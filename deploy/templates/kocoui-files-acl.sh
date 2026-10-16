#!/usr/bin/env bash
# Keeps files the agent writes into the outbox, and into the work directory when
# one is configured, readable for the web app. nginx serves them as www-data,
# which is a member of the app group, so the grant is a group ACL.
# The agent runs with umask 077 and `cp` keeps the source mode, both of which
# collapse the ACL mask; this restores it for every new file or folder.
# -P: never follow symlinks (PHP rejects paths that resolve outside the root).
set -uo pipefail
OUTBOX="__FILES_ROOT__/outbox"
WORK="__WORK_ROOT__"
GROUP="__APP_USER__"

watch=("$OUTBOX")
setfacl -R -P -m "g:$GROUP:rX,m::rX" "$OUTBOX"
if [ -n "$WORK" ] && [ -d "$WORK" ]; then
  setfacl -R -P -m "g:$GROUP:rX,m::rX" "$WORK"
  watch+=("$WORK")
fi
inotifywait -m -r -q -e close_write,moved_to,create,attrib --format '%w%f' "${watch[@]}" |
  while IFS= read -r path; do
    [ -L "$path" ] && continue
    setfacl -P -m "g:$GROUP:rX,m::rX" -- "$path" 2>/dev/null
  done
