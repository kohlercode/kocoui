import { useEffect, useRef, useState } from 'preact/hooks';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
const BITS_PER_SECOND = 64_000;

function preferredMime() {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return '';
  return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

function extensionFor(mime) {
  return mime.includes('mp4') ? 'm4a' : 'weba';
}

function voiceFileName(mime) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
  return `voice-${stamp}.${extensionFor(mime)}`;
}

function openRecorder(stream, mime) {
  try {
    return new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: BITS_PER_SECOND });
  } catch {
    return new MediaRecorder(stream, { mimeType: mime });
  }
}

/**
 * Records a voice message as one audio file for the existing upload path.
 * Hermes never receives audio inside the run body; the agent reads the file
 * from the inbox path, the same way it reads an uploaded mp3.
 *
 * Chunks stay Blobs. Decoding to samples, or transcoding in the page, is what
 * runs out of memory on a long take. A one-second timeslice flushes the
 * encoder, and the take stops before the next chunk would pass maxBytes.
 * 64 kbit/s is the size estimate for that stop, not a quality setting.
 *
 * The file is named .weba (or .m4a on Safari). libmagic reports an audio-only
 * WebM container as video/webm; Files::mime trusts the .weba extension and
 * stores it as audio, so the chat player is used.
 *
 * The vhost must send Permissions-Policy microphone=(self). microphone=()
 * rejects getUserMedia with NotAllowedError even after the visitor allows it.
 * onClip(file, { capped }) runs after a kept stop. Notice is denied|unsupported|limit.
 */
export function useVoiceRecorder({ maxBytes = 50 * 1024 * 1024, onClip }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState('');
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;
  const session = useRef(null);
  const alive = useRef(true);

  function release(current) {
    clearInterval(current.timer);
    current.stream.getTracks().forEach((track) => track.stop());
    if (session.current === current) session.current = null;
  }

  useEffect(() => () => {
    alive.current = false;
    const current = session.current;
    if (!current) return;
    current.keep = false;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    else release(current);
  }, []);

  function finish(current) {
    if (current.done) return;
    current.done = true;
    const parts = current.chunks;
    const capped = current.capped;
    const mime = current.mime;
    release(current);
    if (!alive.current) return;
    setRecording(false);
    setSeconds(0);
    if (!current.keep || !parts.length) return;
    const type = mime.split(';')[0];
    const file = new File(parts, voiceFileName(mime), { type });
    if (file.size > maxBytes) return;
    onClipRef.current(file, { capped });
    if (capped) setNotice('limit');
  }

  async function start() {
    if (session.current) return;
    setNotice('');
    const mime = preferredMime();
    if (!mime) {
      setNotice('unsupported');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      setNotice(denied ? 'denied' : 'unsupported');
      return;
    }
    if (!alive.current || session.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    let recorder;
    try {
      recorder = openRecorder(stream, mime);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setNotice('unsupported');
      return;
    }
    const current = {
      recorder,
      stream,
      mime,
      chunks: [],
      bytes: 0,
      capped: false,
      keep: true,
      done: false,
      started: Date.now(),
      timer: 0,
    };
    const maxSeconds = Math.max(1, Math.floor((maxBytes * 8) / BITS_PER_SECOND));
    recorder.ondataavailable = (e) => {
      if (!e.data?.size || current.done) return;
      if (current.bytes + e.data.size > maxBytes) {
        current.capped = true;
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      current.chunks.push(e.data);
      current.bytes += e.data.size;
    };
    recorder.onstop = () => finish(current);
    session.current = current;
    setSeconds(0);
    setRecording(true);
    recorder.start(1000);
    current.timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - current.started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= maxSeconds && !current.capped) {
        current.capped = true;
        if (recorder.state !== 'inactive') recorder.stop();
      }
    }, 250);
  }

  function stop() {
    const current = session.current;
    if (!current || current.recorder.state === 'inactive') return;
    current.recorder.stop();
  }

  function cancel() {
    const current = session.current;
    if (!current) return;
    current.keep = false;
    current.chunks = [];
    if (current.recorder.state === 'inactive') finish(current);
    else current.recorder.stop();
  }

  return { recording, seconds, notice, start, stop, cancel };
}
