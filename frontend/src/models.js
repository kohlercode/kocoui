const KEY = 'kocoui.model';

/** Selectable models as "provider::model" values; "" stands for the agent's configured default. */
export function modelChoices(models) {
  const out = [];
  for (const p of models?.providers || []) {
    for (const m of p.models) out.push({ value: `${p.slug}::${m}`, provider: p.name, model: m });
  }
  return out;
}

export function storedModel() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function storeModel(value) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
