#!/usr/bin/env bash
# Runs one push-watch pass as the app user. Invoked by kocoui-push-watch.timer.
set -uo pipefail
APP_USER="__APP_USER__"
APP_ROOT="__APP_ROOT__"
runuser -u "$APP_USER" -- php "$APP_ROOT/bin/kocoui" push:watch
