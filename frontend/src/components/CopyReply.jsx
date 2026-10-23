import { useEffect, useRef, useState } from 'preact/hooks';
import Tooltip from 'bootstrap/js/dist/tooltip.js';
import { useI18n } from '../i18n/index.js';

/** Copies the assistant reply's Markdown source, the text the bubble was rendered from. */
export function CopyReply({ text }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef(null);
  const tooltipRef = useRef(null);
  const label = copied ? t('chat.copied') : t('chat.copy');
  const labelRef = useRef(label);
  labelRef.current = label;

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return undefined;
    // Bootstrap skips show() unless title is non-empty. A function keeps the
    // current label without recreating the tooltip when the text changes.
    const tip = new Tooltip(button, {
      container: 'body',
      placement: 'top',
      trigger: 'hover focus',
      title: () => labelRef.current,
    });
    tooltipRef.current = tip;
    return () => {
      tip.dispose();
      tooltipRef.current = null;
    };
  }, []);

  useEffect(() => {
    tooltipRef.current?.setContent({ '.tooltip-inner': label });
  }, [label]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" class={`btn btn-sm copy-reply ${copied ? 'copied' : ''}`} ref={buttonRef} onClick={copy} aria-label={label}>
      <i class={`bi ${copied ? 'bi-check2' : 'bi-clipboard'}`} aria-hidden="true"></i>
    </button>
  );
}
