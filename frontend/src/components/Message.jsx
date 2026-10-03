import { renderMarkdown } from '../markdown.js';
import { useI18n } from '../i18n/index.js';
import { extractFiles } from '../media.js';
import { MediaGallery } from './MediaGallery.jsx';

function toolCallNames(toolCalls) {
  let calls = toolCalls;
  if (typeof calls === 'string') {
    try {
      calls = JSON.parse(calls);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(calls)) return [];
  return calls.map((c) => c?.function?.name || c?.name || 'tool');
}

function textContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

export function Markdown({ text }) {
  return <div class="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

export function Message({ message }) {
  const { t } = useI18n();
  const raw = textContent(message.content);

  if (message.role === 'user') {
    const { text, paths } = extractFiles('user', raw);
    return (
      <div class="d-flex flex-column align-items-end mb-3">
        {paths.length > 0 && <MediaGallery paths={paths} align="end" />}
        {text && <div class="bubble bubble-user">{text}</div>}
      </div>
    );
  }

  if (message.role === 'assistant') {
    const tools = toolCallNames(message.tool_calls);
    const { text: content, paths } = extractFiles('assistant', raw);
    if (!content.trim() && tools.length === 0 && paths.length === 0) return null;
    return (
      <div class="mb-3">
        {content.trim() && (
          <div class="bubble bubble-agent">
            <Markdown text={content} />
          </div>
        )}
        {paths.length > 0 && <MediaGallery paths={paths} />}
        {tools.length > 0 && (
          <div class="small text-body-secondary mt-1">
            {tools.map((name) => (
              <span class="badge text-bg-light border me-1">
                <i class="bi bi-wrench me-1" aria-hidden="true"></i>
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (message.role === 'tool') {
    return (
      <details class="mb-2 ms-2 small tool-result">
        <summary class="text-body-secondary">
          {t('chat.toolResult', { tool: message.tool_name || 'tool' })}
        </summary>
        <pre class="mt-1 mb-0">{raw.length > 4000 ? raw.slice(0, 4000) + '\n…' : raw}</pre>
      </details>
    );
  }

  if (message.role === 'system') {
    return (
      <div class="mb-3">
        <div class="bubble bubble-system small text-body-secondary">
          <i class="bi bi-slash-circle me-1" aria-hidden="true"></i>
          {raw}
        </div>
      </div>
    );
  }

  return null;
}
