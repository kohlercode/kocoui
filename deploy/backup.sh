#!/usr/bin/env bash
# Local backups of the agent and the web app, run as root on the VPS.
#   backup.sh [--app-user hermesweb] [--hermes-user hermes] [--dest /var/backups/hermes] [--keep 7]
#   backup.sh --install [same options]   # copy to /usr/local/sbin, nightly systemd timer
#
# Per run, into DEST (root only, so the agent cannot read or delete its own backups):
#   hermes-<stamp>.zip   full `hermes backup`: config, .env, state.db (memory, sessions), skills, cron
#   webapp-<stamp>.tgz   app config.php (API key copy, secret), consistent copy of app.sqlite
#                        (users, TOTP secrets), basic-auth files
set -euo pipefail

APP_USER="hermesweb"
HERMES_USER="hermes"
DEST="/var/backups/hermes"
KEEP=7
INSTALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --app-user)    APP_USER="$2"; shift 2 ;;
    --hermes-user) HERMES_USER="$2"; shift 2 ;;
    --dest)        DEST="$2"; shift 2 ;;
    --keep)        KEEP="$2"; shift 2 ;;
    --install)     INSTALL=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 2; }

if [ "$INSTALL" -eq 1 ]; then
  install -m 700 -o root -g root "$0" /usr/local/sbin/kocoui-backup
  cat > /etc/systemd/system/kocoui-backup.service <<EOF
[Unit]
Description=Local backup of Hermes and the web app
After=hermes-gateway.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/kocoui-backup --app-user $APP_USER --hermes-user $HERMES_USER --dest $DEST --keep $KEEP
Nice=10
IOSchedulingClass=idle
EOF
  cat > /etc/systemd/system/kocoui-backup.timer <<'EOF'
[Unit]
Description=Nightly local backup of Hermes and the web app

[Timer]
OnCalendar=*-*-* 03:30
RandomizedDelaySec=20min
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now kocoui-backup.timer
  systemctl list-timers kocoui-backup.timer --no-pager
  exit 0
fi

HERMES_HOME="/home/$HERMES_USER"
APP_ROOT="/home/$APP_USER/app"
STAMP=$(date +%F_%H%M)
umask 077
install -d -m 700 -o root -g root "$DEST"

# hermes backup writes as the agent user; stage in its own folder, then move out of its reach.
STAGE="$HERMES_HOME/backups"
runuser -u "$HERMES_USER" -- mkdir -p -m 700 "$STAGE"
runuser -u "$HERMES_USER" -- env HOME="$HERMES_HOME" "$HERMES_HOME/.local/bin/hermes" backup \
  -o "$STAGE/hermes-backup-$STAMP.zip" -k 0 >/dev/null
mv "$STAGE/hermes-backup-$STAMP.zip" "$DEST/hermes-$STAMP.zip"
chown root:root "$DEST/hermes-$STAMP.zip"
chmod 600 "$DEST/hermes-$STAMP.zip"
python3 -m zipfile -t "$DEST/hermes-$STAMP.zip" >/dev/null

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [ -d "$APP_ROOT" ]; then
  # VACUUM INTO gives a consistent snapshot while the app may be writing (WAL mode).
  SNAP="$APP_ROOT/var/tmp/backup-$STAMP.sqlite"
  runuser -u "$APP_USER" -- php -r '$p = new PDO("sqlite:" . $argv[1]); $p->exec("VACUUM INTO " . $p->quote($argv[2]));' \
    "$APP_ROOT/var/data/app.sqlite" "$SNAP"
  mkdir -p "$TMP/webapp/nginx"
  mv "$SNAP" "$TMP/webapp/app.sqlite"
  cp -p "$APP_ROOT/config/config.php" "$TMP/webapp/"
  cp -p /etc/nginx/hermesweb/*.htpasswd "$TMP/webapp/nginx/" 2>/dev/null || true
  tar -C "$TMP" -czf "$DEST/webapp-$STAMP.tgz" webapp
  chmod 600 "$DEST/webapp-$STAMP.tgz"
  tar -tzf "$DEST/webapp-$STAMP.tgz" >/dev/null
fi

for prefix in hermes webapp; do
  ls -1t "$DEST"/"$prefix"-*.* 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
done

echo "backup ok: $(du -ch "$DEST"/*-"$STAMP".* | tail -1 | cut -f1) written to $DEST ($(ls -1 "$DEST" | wc -l) files kept)"
