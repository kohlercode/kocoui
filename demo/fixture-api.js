import sessions from './fixtures/sessions.json';
import messages from './fixtures/messages.json';
import models from './fixtures/models.json';
import capabilities from './fixtures/capabilities.json';
import toolsets from './fixtures/toolsets.json';
import skills from './fixtures/skills.json';
import jobs from './fixtures/jobs.json';
import persona from './fixtures/persona.json';
import files from './fixtures/files.json';
import work from './fixtures/work.json';
import approval from './fixtures/approval.json';
import { rejectDemo } from './note.js';

export class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let csrfToken = 'demo';

export function setCsrf(token) {
  csrfToken = token || '';
}

export function csrf() {
  return csrfToken;
}

export function onUnauthorized() {
  return () => {};
}

const now = () => Math.floor(Date.now() / 1000);

function fileInfo(path) {
  const spec = files[path];
  if (!spec) return { path, missing: true };
  const info = {
    path,
    name: spec.name,
    size: spec.size,
    mime: spec.mime,
    kind: spec.kind,
    origin: spec.origin,
    modified: now(),
    url: `${import.meta.env.BASE_URL}${spec.file}?demo=1`,
  };
  if (spec.width) {
    info.width = spec.width;
    info.height = spec.height;
  }
  return info;
}

function sessionList() {
  const t = now();
  return {
    data: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      source: s.source || 'api_server',
      message_count: (messages[s.id] || []).length,
      last_active: t - s.ago,
    })),
  };
}

function jobList() {
  const t = now();
  return {
    data: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      schedule: j.schedule,
      enabled: j.enabled,
      next_run_at: j.next_in == null ? null : t + j.next_in,
      last_run_at: j.last_ago == null ? null : t - j.last_ago,
      last_status: j.last_status,
    })),
  };
}

function approvalState() {
  return {
    request_id: approval.request_id,
    command: approval.command,
    description: approval.description,
    choices: approval.choices,
    timestamp: Date.now() / 1000,
  };
}

function workListing(rel) {
  const rows = work.dirs[rel];
  if (!rows) return null;
  const base = import.meta.env.BASE_URL;
  return {
    path: rel,
    truncated: false,
    entries: rows.map((row) => {
      const path = rel ? `${rel}/${row.name}` : row.name;
      const entry = { name: row.name, type: row.type, path, modified: now() };
      if (row.type !== 'file') return entry;
      return {
        ...entry,
        size: row.size,
        mime: row.mime,
        kind: row.kind,
        text: !!row.text,
        url: row.file ? `${base}${row.file}` : undefined,
      };
    }),
  };
}

function workText(rel) {
  for (const [dir, rows] of Object.entries(work.dirs)) {
    for (const row of rows) {
      const path = dir ? `${dir}/${row.name}` : row.name;
      if (path === rel && row.text) return { text: row.body || '', truncated: false };
    }
  }
  return null;
}

function get(url, query = '') {
  if (url === '/api/auth/me') {
    return { authenticated: true, user: { username: 'alice' }, csrf: csrfToken };
  }
  if (url === '/api/sessions') return sessionList();
  const messageMatch = url.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (messageMatch) {
    const id = decodeURIComponent(messageMatch[1]);
    const data = messages[id];
    if (!data) throw new ApiError(404, 'not_found', 'Not found');
    return { data };
  }
  if (url === '/api/capabilities') return capabilities;
  if (url === '/api/work') {
    const rel = new URLSearchParams(query).get('path') || '';
    const page = workListing(rel);
    if (!page) throw new ApiError(404, 'not_found', 'Folder not found');
    return page;
  }
  if (url === '/api/work/text') {
    const rel = new URLSearchParams(query).get('path') || '';
    const body = workText(rel);
    if (!body) throw new ApiError(415, 'not_text', 'This file cannot be previewed as text');
    return body;
  }
  if (url === '/api/models') return models;
  if (url === '/api/toolsets') return toolsets;
  if (url === '/api/skills') return skills;
  if (url === '/api/jobs') return jobList();
  if (url === '/api/persona') return persona;
  if (url === '/api/gateway/status') return { ok: true, restart_pending: false };
  const runMatch = url.match(/^\/api\/runs\/([^/]+)$/);
  if (runMatch && decodeURIComponent(runMatch[1]) === 'run_approval') {
    return { status: 'waiting_for_approval', approval: approvalState() };
  }
  throw new ApiError(404, 'not_found', 'Not found');
}

export async function api(method, path, body) {
  const q = path.indexOf('?');
  const url = q === -1 ? path : path.slice(0, q);
  const query = q === -1 ? '' : path.slice(q + 1);
  if (method === 'POST' && url === '/api/files/meta') {
    const paths = Array.isArray(body?.paths) ? body.paths : [];
    return { data: paths.map((p) => fileInfo(String(p))) };
  }
  if (method !== 'GET' || url === '/api/push') rejectDemo();
  return get(url, query);
}
