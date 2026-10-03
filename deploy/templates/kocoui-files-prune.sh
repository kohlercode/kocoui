#!/usr/bin/env bash
# Daily cleanup of shared files: removes files older than the retention period and
# the outbox folders of conversations deleted in the web UI.
set -uo pipefail
ROOT="__FILES_ROOT__"
DAYS="__FILES_RETENTION__"
APP_USER="__APP_USER__"
APP_ROOT="__APP_ROOT__"

find "$ROOT/inbox" "$ROOT/outbox" -xdev -mindepth 1 \( -type f -o -type l \) -mtime +"$DAYS" -delete
runuser -u "$APP_USER" -- php "$APP_ROOT/bin/kocoui" files:deleted-sessions 2>/dev/null |
  while IFS= read -r sid; do
    [[ "$sid" =~ ^[A-Za-z0-9._:-]{1,128}$ ]] && [ "$sid" != . ] && [ "$sid" != .. ] || continue
    rm -rf --one-file-system -- "$ROOT/outbox/$sid"
  done
find "$ROOT/inbox" "$ROOT/outbox" -xdev -mindepth 1 -type d -empty -delete
