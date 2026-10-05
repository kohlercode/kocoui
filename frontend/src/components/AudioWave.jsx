import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../i18n/index.js';
import { wavePeaks } from '../waveform.js';

const SEEK_STEP = 5;

let active = null;

function takeOver(audio) {
  if (active && active !== audio && !active.paused) active.pause();
  active = audio;
}

function clock(total) {
  if (!Number.isFinite(total) || total < 0) return '';
  const s = Math.floor(total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function paintBar(ctx, x, y, w, h, color, alpha) {
  if (w <= 0 || h <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(w / 2, h / 2));
  ctx.fill();
}

function drawWave(canvas, peaks, current, duration) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH || !peaks?.length) return;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const style = getComputedStyle(document.documentElement);
  const primary = style.getPropertyValue('--k-primary').trim() || '#3f6f9f';
  const text = style.getPropertyValue('--k-text').trim() || '#2c3136';
  const gap = Math.max(1, Math.round(1.5 * dpr));
  const barW = (w - gap * (peaks.length - 1)) / peaks.length;
  const played = duration > 0 ? Math.min(1, current / duration) : 0;
  const minH = Math.max(2 * dpr, h * 0.08);
  for (let i = 0; i < peaks.length; i++) {
    const bh = Math.max(minH, peaks[i] * h * 0.92);
    const x = i * (barW + gap);
    const y = (h - bh) / 2;
    const start = i / peaks.length;
    const end = (i + 1) / peaks.length;
    if (played <= start) {
      paintBar(ctx, x, y, barW, bh, text, 0.35);
    } else if (played >= end) {
      paintBar(ctx, x, y, barW, bh, primary, 1);
    } else {
      const cut = ((played - start) / (end - start)) * barW;
      paintBar(ctx, x, y, barW, bh, text, 0.35);
      paintBar(ctx, x, y, cut, bh, primary, 1);
    }
  }
  ctx.globalAlpha = 1;
}

export function AudioWave({ file }) {
  const { t } = useI18n();
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const peaksRef = useRef(null);
  const [peaks, setPeaks] = useState(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  peaksRef.current = peaks;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas) return;
    drawWave(canvas, peaksRef.current, audio?.currentTime || 0, Number.isFinite(audio?.duration) ? audio.duration : 0);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || failed) return undefined;
    let live = true;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      wavePeaks(file.url, file.path).then(
        (list) => { if (live) setPeaks(list); },
        () => { if (live) setFailed(true); },
      );
    }, { rootMargin: '200px' });
    io.observe(root);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [file.url, file.path, failed]);

  useEffect(() => {
    redraw();
  }, [peaks, time, duration, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);
    const theme = new MutationObserver(() => redraw());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'style'] });
    return () => {
      ro.disconnect();
      theme.disconnect();
    };
  }, [peaks, redraw]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio && active === audio) {
      audio.pause();
      active = null;
    }
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      takeOver(audio);
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function seekRatio(ratio) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const next = Math.min(audio.duration, Math.max(0, ratio * audio.duration));
    audio.currentTime = next;
    setTime(next);
  }

  function seekFromEvent(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    seekRatio((e.clientX - rect.left) / rect.width);
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekFromEvent(e);
  }

  function onPointerMove(e) {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    seekFromEvent(e);
  }

  function onKeyDown(e) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration, audio.currentTime + SEEK_STEP);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - SEEK_STEP);
    }
  }

  if (failed) {
    return <audio class="file-card-audio" src={file.url} controls preload="none"></audio>;
  }

  const shown = clock(time) || '0:00';
  const total = clock(duration);

  return (
    <div class="audio-wave" ref={rootRef}>
      <audio
        ref={audioRef}
        class="audio-wave-el"
        src={file.url}
        preload="none"
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (active === audioRef.current) active = null;
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
      />
      <button
        type="button"
        class="btn btn-primary audio-wave-play"
        onClick={toggle}
        title={playing ? t('media.pause') : t('media.play')}
        aria-label={playing ? t('media.pause') : t('media.play')}
      >
        <i class={`bi ${playing ? 'bi-pause-fill' : 'bi-play-fill'}`} aria-hidden="true"></i>
      </button>
      {peaks ? (
        <canvas
          ref={canvasRef}
          class="audio-wave-canvas"
          role="slider"
          tabIndex={0}
          aria-label={t('media.seek')}
          aria-valuemin="0"
          aria-valuemax={duration || 0}
          aria-valuenow={time || 0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={onKeyDown}
        />
      ) : (
        <div class="audio-wave-placeholder" aria-hidden="true"></div>
      )}
      <span class="audio-wave-time">{total ? `${shown} / ${total}` : shown}</span>
    </div>
  );
}
