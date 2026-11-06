import { api } from './api.js';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'lost']);
export const isTerminal = (status) => TERMINAL.has(status);

function generationOf(raw, fallback) {
  const n = raw?.execution_generation ?? fallback;
  if (Number.isInteger(n) && n >= 1) return n;
  if (typeof n === 'string' && /^\d+$/.test(n)) {
    const parsed = Number(n);
    return parsed >= 1 ? parsed : undefined;
  }
  return undefined;
}

function normalizeApproval(raw, fallbackGeneration) {
  if (!raw || typeof raw !== 'object') return null;
  const request_id = raw.request_id || raw.prompt_id || '';
  const execution_generation = generationOf(raw, fallbackGeneration);
  return {
    ...raw,
    request_id,
    ...(execution_generation != null ? { execution_generation } : {}),
  };
}

function approvalFromStatus(st, prev) {
  if (st.status !== 'waiting_for_approval') return null;
  if (st.approval) return normalizeApproval(st.approval, st.execution_generation);
  const pending = Array.isArray(st.pending_controls) ? st.pending_controls : [];
  const prompt = pending.find((p) => p && p.kind === 'approval') || pending[0];
  if (prompt) return normalizeApproval(prompt, st.execution_generation);
  if (!prev) return null;
  const execution_generation = generationOf(prev, st.execution_generation);
  return execution_generation != null ? { ...prev, execution_generation } : prev;
}

const runKey = (sessionId) => `kocoui.run.${sessionId}`;
export const rememberRun = (sessionId, runId) => sessionStorage.setItem(runKey(sessionId), runId);
export const rememberedRun = (sessionId) => sessionStorage.getItem(runKey(sessionId));
export const forgetRun = (sessionId) => sessionStorage.removeItem(runKey(sessionId));

/**
 * Follows one run: live events over EventSource (which resumes with Last-Event-ID
 * whenever the PHP side closes its 50 s window), falling back to status polling
 * once the event stream is gone.
 */
export class RunTracker {
  constructor(runId, onChange, onFinish) {
    this.runId = runId;
    this.onChange = onChange;
    this.onFinish = onFinish;
    this.closed = false;
    this.es = null;
    this.timer = null;
    this.state = {
      runId,
      status: 'running',
      text: '',
      interim: [],
      tools: [],
      approval: null,
      terminal: null,
      steers: 0,
    };
  }

  start() {
    this.emit();
    this.connect();
  }

  dispose() {
    this.closed = true;
    this.es?.close();
    clearTimeout(this.timer);
  }

  async stop() {
    this.update({ status: 'stopping' });
    const res = await api('POST', `/api/runs/${encodeURIComponent(this.runId)}/stop`);
    if (isTerminal(res.status)) this.finishWith(res.status, res);
  }

  async approve(choice) {
    const approval = this.state.approval || {};
    const requestId = approval.request_id || approval.prompt_id;
    const generation = generationOf(approval);
    try {
      await api('POST', `/api/runs/${encodeURIComponent(this.runId)}/approval`, {
        choice,
        ...(requestId ? { request_id: requestId } : {}),
        ...(generation != null ? { execution_generation: generation } : {}),
      });
      this.update({ approval: null, status: 'running' });
    } catch (e) {
      if (e.code === 'approval_not_pending' || e.code === 'approval_not_active') {
        this.update({ approval: null });
      }
      throw e;
    }
  }

  async steer(text) {
    await api('POST', `/api/runs/${encodeURIComponent(this.runId)}/steer`, { input: text });
  }

  connect() {
    const url = `/api/runs/${encodeURIComponent(this.runId)}/events`;
    if (import.meta.env.VITE_DEMO) {
      import('../../demo/run-stream.js').then(({ DemoEventSource }) => {
        if (this.closed) return;
        this.attachSource(new DemoEventSource(url));
      });
      return;
    }
    this.attachSource(new EventSource(url));
  }

  attachSource(es) {
    this.es = es;
    es.onmessage = (e) => {
      let ev;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handle(ev);
    };
    es.addEventListener('gone', () => {
      es.close();
      this.es = null;
      this.poll();
    });
    es.onerror = () => {
      // A normal window close reconnects on its own; CLOSED means the response was not an event stream.
      if (es.readyState === EventSource.CLOSED && !this.closed) {
        this.es = null;
        this.poll();
      }
    };
  }

  handle(ev) {
    const s = this.state;
    switch (ev.event) {
      case 'message.delta':
        this.update({ text: s.text + (ev.delta || '') });
        break;
      case 'message.interim':
        if (!ev.already_streamed && ev.text) this.update({ interim: [...s.interim, ev.text] });
        break;
      case 'tool.started':
      case 'subagent.start':
        this.update({
          tools: [...s.tools, { tool: ev.tool || 'subagent', preview: ev.preview || '', running: true }],
        });
        break;
      case 'tool.completed':
      case 'subagent.complete': {
        const name = ev.tool || 'subagent';
        const tools = [...s.tools];
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].running && tools[i].tool === name) {
            tools[i] = { ...tools[i], running: false, duration: ev.duration, error: !!ev.error, result: ev.preview || '' };
            break;
          }
        }
        this.update({ tools });
        break;
      }
      case 'approval.request':
        this.update({ approval: normalizeApproval(ev), status: 'waiting_for_approval' });
        break;
      case 'approval.responded':
        this.update({ approval: null, status: 'running' });
        break;
      case 'run.steered':
        this.update({ steers: s.steers + 1 });
        break;
      default:
        if (typeof ev.event === 'string' && ev.event.startsWith('run.')) {
          const status = ev.event.slice(4);
          if (isTerminal(status)) this.finishWith(status, ev);
        }
    }
  }

  async poll() {
    if (this.closed) return;
    try {
      const st = await api('GET', `/api/runs/${encodeURIComponent(this.runId)}`);
      if (isTerminal(st.status)) {
        this.finishWith(st.status, st);
        return;
      }
      this.update({
        status: st.status,
        approval: approvalFromStatus(st, this.state.approval),
      });
    } catch (e) {
      if (e.status === 404) {
        this.finishWith('lost', {});
        return;
      }
      if (e.status === 401) return;
    }
    this.timer = setTimeout(() => this.poll(), 1500);
  }

  finishWith(status, terminal) {
    if (this.closed) return;
    this.update({ status, terminal, approval: null });
    this.dispose();
    this.onFinish(this.state);
  }

  update(patch) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  emit() {
    if (!this.closed) this.onChange(this.state);
  }
}
