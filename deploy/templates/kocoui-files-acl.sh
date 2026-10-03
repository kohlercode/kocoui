#!/usr/bin/env bash
# Keeps files the agent writes into the outbox readable for the web app.
# The agent runs with umask 077 and `cp` keeps the source mode, both of which
# collapse the ACL mask; this restores it for every new file or folder.
# -P: never follow symlinks (PHP rejects paths resolving outside the files root).
set -uo pipefail
OUTBOX="__FILES_ROOT__/outbox"
GROUP="__APP_USER__"

setfacl -R -P -m "g:$GROUP:rX,m::rX" "$OUTBOX"
inotifywait -m -r -q -e close_write,moved_to,create,attrib --format '%w%f' "$OUTBOX" |
  while IFS= read -r path; do
    [ -L "$path" ] && continue
    setfacl -P -m "g:$GROUP:rX,m::rX" -- "$path" 2>/dev/null
  done
