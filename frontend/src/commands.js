/** Slash commands handled by the web UI, not by Hermes /v1/runs. */

export const COMMANDS = [
  { name: 'help', aliases: [], descKey: 'cmd.help.desc' },
  { name: 'new', aliases: ['start', 'reset'], descKey: 'cmd.new.desc' },
  { name: 'status', aliases: [], descKey: 'cmd.status.desc' },
  { name: 'stop', aliases: [], descKey: 'cmd.stop.desc' },
  { name: 'restart', aliases: [], descKey: 'cmd.restart.desc' },
];

export function parseSlash(text) {
  const trimmed = text.trim();
  const m = trimmed.match(/^\/([A-Za-z0-9_-]+)(?:\s+(.*))?$/s);
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: (m[2] || '').trim(), raw: trimmed };
}

export function resolveCommand(name) {
  const needle = String(name || '').toLowerCase();
  return COMMANDS.find((c) => c.name === needle || c.aliases.includes(needle)) || null;
}

/** Filter the registry for the incomplete token after a leading slash. */
export function matchingCommands(draft) {
  if (!draft.startsWith('/') || draft.includes('\n')) return [];
  const token = draft.slice(1).split(/\s/, 1)[0].toLowerCase();
  if (draft.includes(' ') && token) {
    // Already completed a command name; hide the menu.
    return [];
  }
  return COMMANDS.filter(
    (c) => c.name.startsWith(token) || c.aliases.some((a) => a.startsWith(token)),
  );
}
