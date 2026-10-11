import approval from './fixtures/approval.json';

const RUN_ID = 'run_approval';

/**
 * Stands in for EventSource in the demo build. The approval conversation
 * replays a tool start and then waits on the approval card.
 */
export class DemoEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onmessage = null;
    this.onerror = null;
    this.listeners = {};
    setTimeout(() => this.play(), 400);
  }

  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }

  close() {
    this.readyState = 2;
  }

  emit(data) {
    if (this.readyState === 2) return;
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  play() {
    if (this.readyState === 2 || !this.url.endsWith(`/api/runs/${RUN_ID}/events`)) return;
    this.readyState = 1;
    this.emit({ event: 'tool.started', tool: 'terminal', preview: approval.command });
    setTimeout(() => {
      this.emit({
        event: 'approval.request',
        request_id: approval.request_id,
        command: approval.command,
        description: approval.description,
        choices: approval.choices,
        timestamp: Date.now() / 1000,
      });
    }, 500);
  }
}
