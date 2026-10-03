#!/bin/bash
# Restart the Hermes gateway after the web UI drops a stamp file.
# Invoked by kocoui-restart-gateway.path (root). Safe to re-run.
set -euo pipefail

STAMP="__APP_ROOT__/var/run/restart-gateway"
rm -f "$STAMP"
systemctl restart hermes-gateway
