import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.js';
import { RunTracker, forgetRun, isTerminal, rememberRun, rememberedRun } from '../runs.js';
import { errorText, newIdempotencyKey } from '../util.js';
import { modelChoices, storeModel, storedModel } from '../models.js';
import { Message } from './Message.jsx';
import { LiveRun, RunNotice } from './LiveRun.jsx';
import { Composer } from './Composer.jsx';
import { hasFiles, useAttachments } from '../attachments.js';
import { humanSize } from '../uploads.js';
import { withAttachments } from '../media.js';
import { FilesPanel, conversationFiles } from './FilesPanel.jsx';
import { COMMANDS, parseSlash, resolveCommand } from '../commands.js';

export function ChatView({ initialSessionId, models, limits, onSessionCreated, onRunFinished, onNewChat }) {
  const { t } = useI18n();
  const attachments = useAttachments(limits);
  const [model, setModel] = useState(storedModel);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(!!initialSessionId);
  const [loadError, setLoadError] = useState('');
  const [run, setRun] = useState(null);
  const [notice, setNotice] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tracker = useRef(null);
  const pendingSubmit = useRef(null);
  const scroller = useRef(null);
  const stick = useRef(true);

  const loadMessages = useCallback(async (sid) => {
    try {
      const res = await api('GET', `/api/sessions/${encodeURIComponent(sid)}/messages`);
      setMessages(res.data || []);
      setLoadError('');
    } catch (e) {
      setLoadError(errorText(t, e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const attach = useCallback((runId, sid) => {
    tracker.current?.dispose();
    const tr = new RunTracker(runId, setRun, async (final) => {
      forgetRun(sid);
      await loadMessages(sid);
      tracker.current = null;
      setRun(null);
      const pending = final.terminal?.pending_steer;
      if (final.status !== 'completed') {
        setNotice({ kind: final.status, error: final.terminal?.error || '' });
      } else if (pending) {
        setNotice({ kind: 'pending_steer' });
      }
      if (pending) setDraft((d) => d || pending);
      onRunFinished();
    });
    tracker.current = tr;
    tr.start();
  }, [loadMessages, onRunFinished]);

  useEffect(() => {
    if (initialSessionId) {
      loadMessages(initialSessionId);
      const active = rememberedRun(initialSessionId);
      if (active) attach(active, initialSessionId);
    }
    return () => tracker.current?.dispose();
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, run]);

  function onScroll() {
    const el = scroller.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const choices = modelChoices(models);
  // A remembered model the agent no longer offers falls back to the default.
  const effectiveModel = models && !choices.some((c) => c.value === model) ? '' : model;

  function chooseModel(value) {
    setModel(value);
    storeModel(value);
  }

  const running = run !== null && !isTerminal(run.status);
  const canSteer = running && run.status === 'running';

  const [filesOpen, setFilesOpen] = useState(false);
  const closeFiles = useCallback(() => setFilesOpen(false), []);
  const fileCount = useMemo(() => conversationFiles(messages).length, [messages]);

  // dragenter/dragleave fire for every child element; count them to know when the pointer really left.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const dropHandlers = {
    onDragEnter: (e) => {
      if (!hasFiles(e) || running) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e) => {
      if (!hasFiles(e) || running) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!running) attachments.add(e.dataTransfer.files);
    },
  };

  async function submit(overrideText) {
    const text = (typeof overrideText === 'string' ? overrideText : draft).trim();
    if (running) {
      if (!text) return;
      setError('');
      return steer(text);
    }
    const files = attachments.ready.map((i) => i.info);
    if ((!text && !files.length) || attachments.uploading || attachments.failed) return;
    setError('');

    const slash = !files.length ? parseSlash(text) : null;
    if (slash) {
      const cmd = resolveCommand(slash.name);
      if (!cmd) {
        noteSystem(t('cmd.unknown', { name: slash.name }));
        setDraft('');
        return;
      }
      setBusy(true);
      setNotice(null);
      try {
        await runCommand(cmd.name, slash.args);
        setDraft('');
      } catch (e) {
        setError(errorText(t, e));
      } finally {
        setBusy(false);
      }
      return;
    }

    // A retried submit of the same text reuses its key, so Hermes replays instead of running twice.
    const ids = files.map((f) => f.id);
    const sig = `${text}\n${effectiveModel}\n${ids.join(',')}`;
    if (pendingSubmit.current?.sig !== sig) {
      pendingSubmit.current = { sig, key: newIdempotencyKey() };
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await api('POST', '/api/runs', { input: text, session_id: sessionId || '', model: effectiveModel, attachments: ids }, {
        'Idempotency-Key': pendingSubmit.current.key,
      });
      pendingSubmit.current = null;
      const sid = res.session_id;
      if (!sessionId) {
        setSessionId(sid);
        onSessionCreated(sid);
      }
      setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: withAttachments(text, files) }]);
      setDraft('');
      attachments.clear();
      stick.current = true;
      rememberRun(sid, res.run_id);
      attach(res.run_id, sid);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  function noteSystem(content) {
    stick.current = true;
    setMessages((m) => [...m, { id: `cmd-${Date.now()}`, role: 'system', content }]);
  }

  async function waitForGateway(timeoutMs = 30000) {
    const start = Date.now();
    // Give the path unit a moment to tear the process down before we look for "up".
    await new Promise((r) => setTimeout(r, 800));
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await api('GET', '/api/gateway/status');
        if (res.ok && !res.restart_pending) return true;
      } catch {
        // PHP itself can answer while Hermes is down; treat any failure as not ready.
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    return false;
  }

  async function runCommand(name, args) {
    switch (name) {
      case 'help': {
        const lines = COMMANDS.map((c) => {
          const aliases = c.aliases.length ? ` (${c.aliases.map((a) => `/${a}`).join(', ')})` : '';
          return `/${c.name}${aliases} — ${t(c.descKey)}`;
        });
        noteSystem(`${t('cmd.help.title')}\n${lines.join('\n')}`);
        return;
      }
      case 'new':
        if (!sessionId && messages.length === 0) {
          noteSystem(t('cmd.new.already'));
          return;
        }
        onNewChat?.();
        return;
      case 'status': {
        const modelLabel = effectiveModel || models?.current?.model || '—';
        const sid = sessionId || t('cmd.status.noSession');
        const state = running ? t('cmd.status.running') : t('cmd.status.idle');
        noteSystem(t('cmd.status.body', { session: sid, model: modelLabel, state }));
        return;
      }
      case 'stop':
        if (!running) {
          noteSystem(t('cmd.stop.idle'));
          return;
        }
        await stop();
        noteSystem(t('cmd.stop.done'));
        return;
      case 'restart': {
        const id = `cmd-${Date.now()}`;
        const update = (content) => {
          stick.current = true;
          setMessages((m) => {
            const i = m.findIndex((x) => x.id === id);
            if (i < 0) return [...m, { id, role: 'system', content }];
            const next = m.slice();
            next[i] = { ...next[i], content };
            return next;
          });
        };
        update(t('cmd.restart.working'));
        await api('POST', '/api/gateway/restart');
        update(t('cmd.restart.waiting'));
        const ready = await waitForGateway();
        update(ready ? t('cmd.restart.ready') : t('cmd.restart.timeout'));
        return;
      }
      default:
        noteSystem(t('cmd.unknown', { name }));
    }
  }

  async function steer(text) {
    setBusy(true);
    try {
      await tracker.current.steer(text);
      setDraft('');
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    try {
      await tracker.current?.stop();
    } catch (e) {
      setError(errorText(t, e));
    }
  }

  async function approve(choice) {
    try {
      await tracker.current.approve(choice);
    } catch (e) {
      throw new Error(errorText(t, e));
    }
  }

  return (
    <div class="d-flex flex-column h-100 position-relative" {...dropHandlers}>
      {dragging && (
        <div class="drop-overlay">
          <div class="drop-overlay-inner">
            <i class="bi bi-cloud-arrow-up display-4 d-block mb-2" aria-hidden="true"></i>
            <div class="fs-5 fw-semibold">{t('composer.drop')}</div>
            <div class="small text-body-secondary">{t('composer.dropHint', { max: humanSize(limits?.max_upload_bytes || 50 * 1024 * 1024) })}</div>
          </div>
        </div>
      )}
      {fileCount > 0 && (
        <div class="chat-toolbar d-flex justify-content-end px-2 py-1 border-bottom bg-body">
          <button type="button" class="btn btn-sm btn-outline-secondary" onClick={() => setFilesOpen(true)}>
            <i class="bi bi-folder2-open me-1" aria-hidden="true"></i>
            {t('filesPanel.button')}
            <span class="badge rounded-pill text-bg-primary ms-1">{fileCount}</span>
          </button>
        </div>
      )}
      <FilesPanel open={filesOpen} onClose={closeFiles} messages={messages} />
      <div class="flex-grow-1 overflow-auto" ref={scroller} onScroll={onScroll}>
        <div class="container-fluid chat-column py-3">
          {loading && <div class="text-body-secondary small">{t('common.loading')}</div>}
          {loadError && <div class="alert alert-warning">{loadError}</div>}
          {!loading && !sessionId && messages.length === 0 && (
            <div class="text-center text-body-secondary py-5">
              <i class="bi bi-chat-dots display-6 d-block mb-3" aria-hidden="true"></i>
              {t('chat.empty')}
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
          {run && <LiveRun run={run} onApprove={approve} />}
          {notice && <RunNotice notice={notice} onDismiss={() => setNotice(null)} />}
          {error && (
            <div class="alert alert-danger d-flex justify-content-between align-items-start">
              <span>{error}</span>
              <button type="button" class="btn-close" aria-label="Close" onClick={() => setError('')}></button>
            </div>
          )}
        </div>
      </div>
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        onStop={stop}
        busy={busy}
        running={running}
        canSteer={canSteer}
        models={models}
        choices={choices}
        model={effectiveModel}
        onModelChange={chooseModel}
        attachments={attachments}
        maxUploadBytes={limits?.max_upload_bytes}
      />
    </div>
  );
}
