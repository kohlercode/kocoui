import { useEffect, useRef } from 'preact/hooks';
import Tooltip from 'bootstrap/js/dist/tooltip.js';

/** Bootstrap tooltip on a ref; `title` can change (e.g. language switch). */
export function useTooltip(elementRef, title, placement = 'bottom') {
  const tipRef = useRef(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return undefined;
    // Bootstrap skips show() unless title is non-empty. A function keeps the
    // current label without recreating the tooltip when the text changes.
    const tip = new Tooltip(el, {
      container: 'body',
      placement,
      trigger: 'hover focus',
      title: () => titleRef.current,
    });
    tipRef.current = tip;
    const hide = () => tip.hide();
    el.addEventListener('click', hide);
    return () => {
      el.removeEventListener('click', hide);
      tip.dispose();
      tipRef.current = null;
    };
  }, [elementRef, placement]);

  useEffect(() => {
    tipRef.current?.setContent({ '.tooltip-inner': title });
  }, [title]);
}
