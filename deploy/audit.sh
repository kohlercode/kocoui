#!/usr/bin/env bash
# Security acceptance checks for a deployed box, run as root on the VPS:
#   audit.sh --domain ui.example.com [--app-user hermesweb] [--hermes-user hermes]
# Read-only; prints ok/FAIL per check and never prints a secret. The external
# port scan (8642 must be unreachable from the internet) has to run from another
# machine.
set -uo pipefail

DOMAIN=""
APP_USER="hermesweb"
HERMES_USER="hermes"
while [ $# -gt 0 ]; do
  case "$1" in
    --domain)      DOMAIN="$2"; shift 2 ;;
    --app-user)    APP_USER="$2"; shift 2 ;;
    --hermes-user) HERMES_USER="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$DOMAIN" ] || { echo "--domain required" >&2; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 2; }

APP_ROOT="/home/$APP_USER/app"
HERMES_HOME="/home/$HERMES_USER/.hermes"
BA_FILE="/root/basic-auth-$DOMAIN.txt"
PASS_COUNT=0
FAIL_COUNT=0

check() {
  if [ "$2" = "$3" ]; then PASS_COUNT=$((PASS_COUNT + 1)); echo "  ok    $1"
  else FAIL_COUNT=$((FAIL_COUNT + 1)); echo "  FAIL  $1 (expected '$3', got '$2')"; fi
}

KEY=$(grep -m1 '^API_SERVER_KEY=' "$HERMES_HOME/.env" | cut -d= -f2- | tr -d "\r\"' ")
PORT=$(grep -m1 '^API_SERVER_PORT=' "$HERMES_HOME/.env" | cut -d= -f2- | tr -d "\r\"' ")
PORT=${PORT:-8642}
BASIC=""
[ -f "$BA_FILE" ] && BASIC="$(sed -n 's/^user: //p' "$BA_FILE"):$(sed -n 's/^password: //p' "$BA_FILE")"
WEB=(curl -s --resolve "$DOMAIN:443:127.0.0.1")
AUTHWEB=("${WEB[@]}")
[ -n "$BASIC" ] && AUTHWEB+=(-u "$BASIC")

echo "== Hermes API key"
check "correct key -> 200" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $KEY" "http://127.0.0.1:$PORT/v1/models")" "200"
check "wrong key -> 401" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer wrong-$RANDOM" "http://127.0.0.1:$PORT/v1/models")" "401"

echo "== key never reaches the browser"
check "key prefix not in public files" "$(grep -rlF "${KEY:0:12}" "$APP_ROOT/public" | wc -l)" "0"
check "no Hermes port or key name in public files" "$(grep -rlE "API_SERVER_KEY|:$PORT" "$APP_ROOT/public" | wc -l)" "0"
EXT=$(grep -ohE "(fetch|EventSource|XMLHttpRequest)\([^)]{0,80}https?://" "$APP_ROOT"/public/assets/*.js | wc -l)
check "bundle makes no requests to absolute URLs" "$EXT" "0"

echo "== listening sockets"
PUBLIC=$(ss -Htln | awk '{print $4}' | grep -vE '^(127\.[0-9.]+(%lo)?|\[::1\]|\[::ffff:127\.[0-9.]+\]):' | grep -oE '[0-9]+$' | sort -un | tr '\n' ' ' | sed 's/ $//')
check "only 22 80 443 listen publicly" "$PUBLIC" "22 80 443"
check "Hermes API bound to loopback only" "$(ss -Htln "sport = :$PORT" | awk '{print $4}' | grep -vcE '^(127\.0\.0\.1|\[::1\]):')" "0"
check "ufw active" "$(ufw status | head -1)" "Status: active"
check "ufw allows only 22 80 443" "$(ufw status | awk 'NR>4 && /ALLOW/ {print $1}' | sed 's#/tcp##; s# (v6)##' | sort -un | tr '\n' ' ' | sed 's/ $//')" "22 80 443"

echo "== web front"
check "basic auth required" "$("${WEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/")" "401"
H=$("${AUTHWEB[@]}" -D - -o /dev/null "https://$DOMAIN/")
has() { echo "$H" | grep -qi "^$1" && echo yes || echo no; }
check "HSTS header" "$(has 'strict-transport-security: max-age=')" "yes"
check "CSP default-src 'self'" "$(has "content-security-policy: default-src 'self'")" "yes"
check "CSP worker-src self" "$(echo "$H" | grep -i 'content-security-policy:' | grep -c "worker-src 'self'")" "1"
check "CSP manifest-src self" "$(echo "$H" | grep -i 'content-security-policy:' | grep -c "manifest-src 'self'")" "1"
check "service worker reachable" "$("${AUTHWEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/sw.js")" "200"
check "web manifest reachable" "$("${AUTHWEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/manifest.webmanifest")" "200"
check "PWA icon 192 reachable" "$("${AUTHWEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/icons/icon-192.png")" "200"
check "X-Frame-Options DENY" "$(has 'x-frame-options: DENY')" "yes"
check "nosniff" "$(has 'x-content-type-options: nosniff')" "yes"
check "Referrer-Policy no-referrer" "$(has 'referrer-policy: no-referrer')" "yes"
check "no nginx version in Server header" "$(echo "$H" | grep -iE '^server:' | grep -c '[0-9]')" "0"
check "no X-Powered-By" "$(has 'x-powered-by')" "no"
for p in /health /v1/models /v1/capabilities; do
  check "Hermes $p not reachable through nginx" "$("${AUTHWEB[@]}" -o /dev/null -w '%{content_type}' "https://$DOMAIN$p" | grep -c json)" "0"
done
check "config.php not served" "$("${AUTHWEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/config/config.php")" "404"
check "PHP sources not served" "$("${AUTHWEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/src/App.php")" "404"
check "dotfiles denied" "$("${AUTHWEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/assets/.vite/manifest.json")" "403"
C=$("${AUTHWEB[@]}" -D - -o /dev/null "https://$DOMAIN/api/auth/me" | grep -i '^set-cookie: __Host-hwsid')
check "session cookie Secure+HttpOnly+SameSite=Strict" "$(echo "$C" | grep -i secure | grep -i httponly | grep -ic 'samesite=strict')" "1"
check "HTTP redirects to HTTPS" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/x")" "301 https://$DOMAIN/x"
tls() { echo | timeout 5 openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" "$1" 2>/dev/null | grep -c '^New, TLS'; }
check "TLS 1.1 refused" "$(tls -tls1_1)" "0"
check "TLS 1.2 accepted" "$(tls -tls1_2)" "1"
check "TLS 1.3 accepted" "$(tls -tls1_3)" "1"
check "unknown host name gets no certificate" "$(echo | timeout 5 openssl s_client -connect 127.0.0.1:443 -servername "scan.invalid" 2>/dev/null | grep -c 'BEGIN CERTIFICATE')" "0"

echo "== users and files"
for u in "$HERMES_USER" "$APP_USER"; do
  check "$u has no sudo" "$(sudo -l -U "$u" 2>/dev/null | grep -c 'may run')" "0"
done
check "agent user holds no SSH keys" "$(find "/home/$HERMES_USER/.ssh" -type f 2>/dev/null | wc -l)" "0"
check "gateway does not run as root" "$(ps -o user= -p "$(systemctl show -p MainPID --value hermes-gateway)")" "$HERMES_USER"
check "PHP-FPM pool runs as $APP_USER" "$(awk -F' *= *' '$1 == "user" {print $2}' /etc/php/*/fpm/pool.d/"$APP_USER".conf)" "$APP_USER"
check "Hermes .env is 600" "$(stat -c %a "$HERMES_HOME/.env")" "600"
check "app config.php is 600 $APP_USER" "$(stat -c '%a %U' "$APP_ROOT/config/config.php")" "600 $APP_USER"
check "app database is 600" "$(stat -c %a "$APP_ROOT/var/data/app.sqlite")" "600"
check "no leftover .env backups" "$(find "$HERMES_HOME" -maxdepth 1 -name '.env.bak*' | wc -l)" "0"
MODE=$(awk '/^approvals:/ {a=1; next} a && /^[^ ]/ {a=0} a && $1 == "mode:" {gsub(/["'\'']/, "", $2); print $2}' "$HERMES_HOME/config.yaml")
check "approvals.mode is not off" "$([ -n "$MODE" ] && [ "$MODE" != off ] && echo yes || echo "no ($MODE)")" "yes"

echo "== shared files"
FILES_ROOT=$(runuser -u "$APP_USER" -- env APP_ROOT="$APP_ROOT" php -r 'define("APP_ROOT", getenv("APP_ROOT")); require APP_ROOT . "/src/autoload.php";
  KocoUI\Config::load(APP_ROOT . "/config/config.php"); echo KocoUI\Files::root();' 2>/dev/null)
if [ -n "$FILES_ROOT" ]; then
  acl() { getfacl -pc "$1" 2>/dev/null | grep -c "^$2$"; }
  tries() { runuser -u "$1" -- sh -c 't="$1/.audit-$$"; : > "$t" && rm -f "$t"' _ "$2" 2>/dev/null && echo yes || echo no; }
  owner_other() { echo "$(stat -c %U "$1") other=$(stat -c %a "$1" | rev | cut -c1)"; }
  check "inbox owned by $APP_USER, no access for others" "$(owner_other "$FILES_ROOT/inbox")" "$APP_USER other=0"
  check "outbox owned by $HERMES_USER, no access for others" "$(owner_other "$FILES_ROOT/outbox")" "$HERMES_USER other=0"
  check "agent reads the inbox (ACL, default ACL)" "$(acl "$FILES_ROOT/inbox" "user:$HERMES_USER:r-x")$(acl "$FILES_ROOT/inbox" "default:user:$HERMES_USER:r-x")" "11"
  check "app reads the outbox (ACL, default ACL)" "$(acl "$FILES_ROOT/outbox" "group:$APP_USER:r-x")$(acl "$FILES_ROOT/outbox" "default:group:$APP_USER:r-x")" "11"
  check "agent cannot write the inbox" "$(tries "$HERMES_USER" "$FILES_ROOT/inbox")" "no"
  check "app cannot write the outbox" "$(tries "$APP_USER" "$FILES_ROOT/outbox")" "no"
  check "ACL watcher running" "$(systemctl is-active kocoui-files-acl.service)" "active"
  check "file prune timer active" "$(systemctl is-active kocoui-files-prune.timer)" "active"
  check "push watch timer active" "$(systemctl is-active kocoui-push-watch.timer)" "active"
  check "push watch helper is root-only" "$(stat -c '%a %U' /usr/local/sbin/kocoui-push-watch 2>/dev/null)" "700 root"
  check "push watch exits cleanly" "$(runuser -u "$APP_USER" -- php "$APP_ROOT/bin/kocoui" push:watch >/dev/null 2>&1; echo $?)" "0"
  check "no web request holds a worker for minutes" "$(grep -c 'fastcgi_finish_request' "$APP_ROOT/src/Push/RunWatcher.php")" "0"
  SOUL="/home/$HERMES_USER/.hermes/SOUL.md"
  check "PHP open_basedir limited to app, files and the persona file" "$(awk -F' *= *' '$1 == "php_admin_value[open_basedir]" {print $2}' /etc/php/*/fpm/pool.d/"$APP_USER".conf)" "$APP_ROOT:$FILES_ROOT:$SOUL"
  check "app can read the persona file" "$(runuser -u "$APP_USER" -- head -c 1 "$SOUL" >/dev/null 2>&1 && echo yes)" "yes"
  check "app cannot read the Hermes env file" "$(runuser -u "$APP_USER" -- head -c 1 "/home/$HERMES_USER/.hermes/.env" >/dev/null 2>&1 && echo yes || echo no)" "no"
  check "gateway restart path unit enabled" "$(systemctl is-enabled kocoui-restart-gateway.path 2>/dev/null || echo no)" "enabled"
  check "gateway restart helper is root-only" "$(stat -c '%a %U' /usr/local/sbin/kocoui-restart-gateway 2>/dev/null)" "700 root"
  check "internal /_files/ location not reachable" "$("${AUTHWEB[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN/_files/inbox/")" "404"
else
  check "shared files root configured" "missing" "present"
fi
AUX=$(awk '/^auxiliary:/ {a=1; next} a && /^[^ ]/ {a=0} a && /^  [a-z_]+:/ {t=$1} a && $1 == "provider:" {gsub(/["'\'']/, "", $2); print t, $2}' "$HERMES_HOME/config.yaml")
check "side tasks other than vision stay on the main model" "$(echo "$AUX" | grep -v '^vision:' | awk '$2 != "main"' | wc -l)" "0"
check "no fallback providers configured" "$(grep -cE '^(fallback_providers|fallback_model):' "$HERMES_HOME/config.yaml")" "0"

echo "== host"
check "SSH password login off" "$(sshd -T | awk '/^passwordauthentication/ {print $2}')" "no"
check "SSH root login key-only" "$(sshd -T | awk '/^permitrootlogin/ {print $2}')" "prohibit-password"
for j in sshd nginx-http-auth nginx-limit-req hermesweb-login; do
  check "fail2ban jail $j" "$(fail2ban-client status "$j" >/dev/null 2>&1 && echo on || echo off)" "on"
done
check "unattended upgrades enabled" "$(grep -cE '^APT::Periodic::(Update-Package-Lists|Unattended-Upgrade) "1";' /etc/apt/apt.conf.d/20auto-upgrades)" "2"
check "certificate renewal timer active" "$(systemctl is-active certbot.timer)" "active"
check "backup timer active" "$(systemctl is-active kocoui-backup.timer)" "active"
check "a Hermes backup from the last 2 days" "$(find /var/backups/hermes -name 'hermes-*.zip' -mtime -2 2>/dev/null | grep -q . && echo yes || echo no)" "yes"
check "backups readable by root only" "$(stat -c '%a %U' /var/backups/hermes 2>/dev/null)" "700 root"
EXT_MISSING=""
for ext in sodium openssl curl json mbstring fileinfo gd sqlite3 pdo_sqlite; do
  runuser -u "$APP_USER" -- php -m | grep -qx "$ext" || EXT_MISSING="$EXT_MISSING $ext"
done
check "php extensions present" "${EXT_MISSING:-ok}" "ok"

unset KEY BASIC
echo
echo "passed: $PASS_COUNT  failed: $FAIL_COUNT"
[ "$FAIL_COUNT" -eq 0 ]
