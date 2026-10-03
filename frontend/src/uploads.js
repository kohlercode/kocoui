import { ApiError, api, csrf } from './api.js';

/**
 * PUT /api/uploads with the raw file as body (XHR for upload progress).
 * Returns { promise, abort }; the promise resolves to the server's file info.
 */
export function uploadFile(file, onProgress) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open('PUT', '/api/uploads');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-CSRF-Token', csrf());
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name || 'file'));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* nginx error page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.id) return resolve(data);
      const err = data?.error || {};
      reject(new ApiError(xhr.status, err.code || (xhr.status === 413 ? 'file_too_large' : 'http_' + xhr.status), err.message || '', err));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'Network error'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Aborted'));
    xhr.send(file);
  });
  return { promise, abort: () => xhr.abort() };
}

export function deleteUpload(id) {
  return api('DELETE', `/api/uploads/${encodeURIComponent(id)}`).catch(() => {});
}

export function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return i === 0 ? `${bytes} B` : `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

/** Bootstrap icon for a file by MIME type / kind. */
export function fileIcon(mime = '', kind = '') {
  if (kind === 'image' || mime.startsWith('image/')) return 'bi-file-earmark-image';
  if (kind === 'video' || mime.startsWith('video/')) return 'bi-file-earmark-play';
  if (kind === 'audio' || mime.startsWith('audio/')) return 'bi-file-earmark-music';
  if (kind === 'pdf' || mime === 'application/pdf') return 'bi-file-earmark-pdf';
  if (/zip|tar|gzip|7z|rar|compressed/.test(mime)) return 'bi-file-earmark-zip';
  if (/spreadsheet|excel|csv/.test(mime)) return 'bi-file-earmark-spreadsheet';
  if (/word|document|rtf/.test(mime)) return 'bi-file-earmark-richtext';
  if (/presentation|powerpoint/.test(mime)) return 'bi-file-earmark-slides';
  if (/json|javascript|xml|x-php|x-python|x-sh|x-c|html/.test(mime)) return 'bi-file-earmark-code';
  if (mime.startsWith('text/')) return 'bi-file-earmark-text';
  return 'bi-file-earmark';
}
