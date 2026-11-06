/** Lazy highlight.js for Work code previews. Theme CSS is imported once. */

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp',
  php: 'php', sql: 'sql',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', jsonl: 'json', xml: 'xml',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', conf: 'ini', cfg: 'ini',
  md: 'markdown', markdown: 'markdown',
  html: 'xml', vue: 'xml', svelte: 'xml',
  txt: 'plaintext', text: 'plaintext', log: 'plaintext',
  csv: 'plaintext', tsv: 'plaintext',
};

let hljsPromise = null;

async function loadHljs() {
  if (!hljsPromise) {
    hljsPromise = (async () => {
      const hljs = (await import('highlight.js/lib/core')).default;
      const langs = await Promise.all([
        import('highlight.js/lib/languages/javascript'),
        import('highlight.js/lib/languages/typescript'),
        import('highlight.js/lib/languages/python'),
        import('highlight.js/lib/languages/ruby'),
        import('highlight.js/lib/languages/go'),
        import('highlight.js/lib/languages/rust'),
        import('highlight.js/lib/languages/java'),
        import('highlight.js/lib/languages/kotlin'),
        import('highlight.js/lib/languages/c'),
        import('highlight.js/lib/languages/cpp'),
        import('highlight.js/lib/languages/csharp'),
        import('highlight.js/lib/languages/php'),
        import('highlight.js/lib/languages/sql'),
        import('highlight.js/lib/languages/bash'),
        import('highlight.js/lib/languages/powershell'),
        import('highlight.js/lib/languages/css'),
        import('highlight.js/lib/languages/scss'),
        import('highlight.js/lib/languages/less'),
        import('highlight.js/lib/languages/json'),
        import('highlight.js/lib/languages/xml'),
        import('highlight.js/lib/languages/yaml'),
        import('highlight.js/lib/languages/ini'),
        import('highlight.js/lib/languages/markdown'),
        import('highlight.js/lib/languages/plaintext'),
      ]);
      const names = [
        'javascript', 'typescript', 'python', 'ruby', 'go', 'rust', 'java', 'kotlin',
        'c', 'cpp', 'csharp', 'php', 'sql', 'bash', 'powershell', 'css', 'scss', 'less',
        'json', 'xml', 'yaml', 'ini', 'markdown', 'plaintext',
      ];
      names.forEach((name, i) => hljs.registerLanguage(name, langs[i].default));
      await import('highlight.js/styles/atom-one-dark.min.css');
      return hljs;
    })();
  }
  return hljsPromise;
}

export function languageForName(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  return EXT_LANG[ext] || 'plaintext';
}

/** @returns {Promise<{ html: string, language: string }>} */
export async function highlightCode(code, name) {
  const hljs = await loadHljs();
  const language = languageForName(name);
  try {
    const result = hljs.highlight(String(code ?? ''), { language, ignoreIllegals: true });
    return { html: result.value, language };
  } catch {
    const result = hljs.highlight(String(code ?? ''), { language: 'plaintext', ignoreIllegals: true });
    return { html: result.value, language: 'plaintext' };
  }
}
