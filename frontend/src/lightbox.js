import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import { humanSize } from './uploads.js';

const DEFAULT_W = 1600;
const DEFAULT_H = 1200;

function imageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth || DEFAULT_W, img.naturalHeight || DEFAULT_H]);
    img.onerror = () => resolve([DEFAULT_W, DEFAULT_H]);
    img.src = url;
  });
}

function icon(name) {
  return `<i class="bi ${name}" aria-hidden="true"></i>`;
}

/**
 * Opens images and videos (file infos from /api/files/meta) in a PhotoSwipe lightbox.
 * labels: { close, prev, next, zoom, download, open }
 */
export async function openLightbox(files, index, labels) {
  const slides = await Promise.all(files.map(async (f) => {
    const base = { name: f.name, size: f.size, url: f.url, download: f.url + '&download=1', alt: f.name };
    if (f.kind === 'video') return { ...base, type: 'video', width: 1920, height: 1080 };
    let { width, height } = f;
    if (!width || !height) [width, height] = await imageSize(f.url);
    return { ...base, src: f.url, msrc: f.thumb ? f.thumb + '&w=480' : undefined, width, height };
  }));

  const lightbox = new PhotoSwipeLightbox({
    dataSource: slides,
    pswpModule: () => import('photoswipe'),
    index,
    bgOpacity: 0.94,
    showHideAnimationType: 'fade',
    wheelToZoom: true,
    closeTitle: labels.close,
    zoomTitle: labels.zoom,
    arrowPrevTitle: labels.prev,
    arrowNextTitle: labels.next,
    errorMsg: labels.error,
    padding: { top: 56, bottom: 64, left: 16, right: 16 },
  });

  lightbox.on('contentLoad', (e) => {
    const { content } = e;
    if (content.type !== 'video') return;
    e.preventDefault();
    const wrap = document.createElement('div');
    wrap.className = 'pswp-video';
    const video = document.createElement('video');
    video.src = content.data.url;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    // Keep PhotoSwipe's drag/tap handling away from the native controls.
    video.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    wrap.appendChild(video);
    content.element = wrap;
  });

  // Only the visible video plays.
  lightbox.on('change', () => {
    const pswp = lightbox.pswp;
    document.querySelectorAll('.pswp-video video').forEach((v) => {
      if (!pswp?.currSlide?.container?.contains(v)) v.pause();
    });
  });

  lightbox.on('uiRegister', () => {
    const { ui } = lightbox.pswp;
    const link = (name, order, html, title, attrs) => ui.registerElement({
      name,
      order,
      isButton: true,
      tagName: 'a',
      title,
      html,
      onInit: (el, pswp) => {
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        // The top bar is built before the first slide exists, so the first
        // update waits for the change event.
        const set = () => {
          const d = pswp.currSlide?.data;
          if (d) el.href = name === 'download' ? d.download : d.url;
        };
        pswp.on('change', set);
      },
    });
    link('open', 8, icon('bi-box-arrow-up-right'), labels.open, { target: '_blank', rel: 'noopener' });
    link('download', 9, icon('bi-download'), labels.download, { download: '' });
    ui.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el, pswp) => {
        const set = () => {
          const d = pswp.currSlide?.data;
          if (!d) return;
          el.textContent = '';
          const name = document.createElement('span');
          name.className = 'pswp-caption-name';
          name.textContent = d.name;
          const meta = document.createElement('span');
          meta.className = 'pswp-caption-meta';
          meta.textContent = `${humanSize(d.size)}${pswp.getNumItems() > 1 ? ` · ${pswp.currIndex + 1} / ${pswp.getNumItems()}` : ''}`;
          el.append(name, meta);
        };
        pswp.on('change', set);
      },
    });
  });

  lightbox.on('destroy', () => {
    document.querySelectorAll('.pswp-video video').forEach((v) => v.pause());
  });
  lightbox.init();
  lightbox.loadAndOpen(index);
}
