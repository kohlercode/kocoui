import { humanSize } from './uploads.js';

/** Must match ChatController::ATTACHMENT_HEADER. */
const HEADER = '[Attached files]';
const ATTACHMENT_LINE = /^- (\/.+) \(([^,()]+), ([^()]+)\)$/;
// MEDIA:/abs/path, optionally in backticks; paths with whitespace are not supported (as in Hermes).
const MEDIA_TAG = /`?MEDIA:\s*(\/[^\s`'"<>]+)`?[.,;]?/g;

/** The text Hermes stores for a user turn with attachments; mirrors ChatController::startRun. */
export function withAttachments(text, files) {
  if (!files.length) return text;
  const lines = files.map((f) => `- ${f.path} (${f.mime}, ${humanSize(f.size)})`);
  return `${text}\n\n${HEADER}\n${lines.join('\n')}`.trim();
}

/**
 * Splits a message into display text and referenced files.
 * User turns carry an "[Attached files]" block, agent turns MEDIA: tags.
 * @returns {{ text: string, paths: string[] }}
 */
export function extractFiles(role, content) {
  if (typeof content !== 'string' || !content) return { text: content || '', paths: [] };
  if (role === 'user') {
    const at = content.lastIndexOf(HEADER);
    if (at === -1) return { text: content, paths: [] };
    const lines = content.slice(at + HEADER.length).split('\n').map((l) => l.trim()).filter(Boolean);
    const paths = [];
    for (const line of lines) {
      const m = line.match(ATTACHMENT_LINE);
      if (!m) return { text: content, paths: [] };
      paths.push(m[1]);
    }
    return { text: content.slice(0, at).trim(), paths };
  }
  if (role === 'assistant' && content.includes('MEDIA:')) {
    const paths = [];
    const text = content.replace(MEDIA_TAG, (_, p) => {
      const path = p.replace(/[.,;:!?)\]]+$/, '');
      if (!paths.includes(path)) paths.push(path);
      return '';
    });
    return { text: text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(), paths };
  }
  return { text: content, paths: [] };
}

/**
 * Batched, cached lookups of /api/files/meta. Components ask for paths and get a
 * promise; requests made in the same tick go out as one call.
 */
const cache = new Map();
let queue = [];
let timer = null;

export function fileMeta(api, path) {
  if (cache.has(path)) return cache.get(path);
  let resolve;
  const p = new Promise((r) => (resolve = r));
  cache.set(path, p);
  queue.push({ path, resolve });
  if (!timer) {
    timer = setTimeout(async () => {
      const batch = queue;
      queue = [];
      timer = null;
      for (let i = 0; i < batch.length; i += 200) {
        const part = batch.slice(i, i + 200);
        try {
          const res = await api('POST', '/api/files/meta', { paths: part.map((b) => b.path) });
          part.forEach((b, n) => b.resolve(res.data?.[n] || { path: b.path, missing: true }));
        } catch {
          // Transient failure: resolve as missing but let the next render retry.
          part.forEach((b) => {
            cache.delete(b.path);
            b.resolve({ path: b.path, missing: true, error: true });
          });
        }
      }
    }, 0);
  }
  return p;
}

/** Seeds the cache with info we already have (e.g. the upload response). */
export function primeFileMeta(info) {
  if (info?.path) cache.set(info.path, Promise.resolve(info));
}
