import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { deleteUpload, uploadFile } from './uploads.js';
import { primeFileMeta } from './media.js';

const PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Files attached in the composer. Each file uploads as soon as it is added; the
 * message only references the upload ids. Item:
 * { key, name, size, mime, preview, progress, status: uploading|done|error, info, error }
 */
export function useAttachments(limits) {
  const [items, setItems] = useState([]);
  const aborts = useRef(new Map());
  const listRef = useRef(items);
  listRef.current = items;

  const update = useCallback((key, patch) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }, []);

  useEffect(() => () => listRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);

  const add = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const max = limits?.max_per_message || 10;
    const maxBytes = limits?.max_upload_bytes || 50 * 1024 * 1024;
    const room = Math.max(0, max - listRef.current.length);
    const fresh = files.map((file, n) => {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const base = { key, name: file.name || 'file', size: file.size, mime: file.type || '', progress: 0, info: null, error: null };
      if (n >= room) return { ...base, status: 'error', error: { code: 'too_many_files', max } };
      if (file.size > maxBytes) return { ...base, status: 'error', error: { code: 'file_too_large', max_bytes: maxBytes } };
      if (file.size === 0) return { ...base, status: 'error', error: { code: 'empty_file' } };
      const preview = file.type.startsWith('image/') && file.type !== 'image/svg+xml' && file.size <= PREVIEW_MAX_BYTES
        ? URL.createObjectURL(file) : '';
      return { ...base, preview, status: 'uploading', file };
    });
    setItems((list) => [...list, ...fresh.map(({ file, ...rest }) => rest)]);

    for (const item of fresh) {
      if (!item.file) continue;
      const { promise, abort } = uploadFile(item.file, (p) => update(item.key, { progress: p }));
      aborts.current.set(item.key, abort);
      promise.then(
        (info) => {
          primeFileMeta(info);
          update(item.key, { status: 'done', progress: 1, info, mime: info.mime });
        },
        (e) => e.code !== 'aborted' && update(item.key, { status: 'error', error: e }),
      ).finally(() => aborts.current.delete(item.key));
    }
  }, [limits, update]);

  const remove = useCallback((key) => {
    const item = listRef.current.find((i) => i.key === key);
    if (!item) return;
    aborts.current.get(key)?.();
    if (item.info?.id) deleteUpload(item.info.id);
    if (item.preview) URL.revokeObjectURL(item.preview);
    setItems((list) => list.filter((i) => i.key !== key));
  }, []);

  /** After sending: the uploads now belong to the conversation, so keep them on the server. */
  const clear = useCallback(() => {
    listRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    setItems([]);
  }, []);

  const uploading = items.some((i) => i.status === 'uploading');
  const failed = items.some((i) => i.status === 'error');
  const ready = items.filter((i) => i.status === 'done');
  return { items, add, remove, clear, uploading, failed, ready };
}

export function hasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}
