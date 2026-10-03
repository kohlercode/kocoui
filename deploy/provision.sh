#!/usr/bin/env bash
# Provision the public side of a Hermes VPS for the web UI: nginx + PHP-FPM +
# Let's Encrypt + basic auth + fail2ban. Safe to re-run.
#
# Usage (as root, from the deploy/ directory):
#   ./provision.sh --domain ui.example.com [--app-user hermesweb] [--hermes-user hermes] [--basic-auth-user NAME]
#                  [--files-root /srv/kocoui/files] [--upload-max-mb 50] [--files-retention-days 30]
#
# Prerequisites: Hermes installed and its gateway running on 127.0.0.1 (see
# docs/install.md), and a DNS A/AAAA record for --domain that
# already points at this server.
set -euo pipefail

DOMAIN=""
APP_USER="hermesweb"
HERMES_USER="hermes"
BA_USER=""
FILES_ROOT="/srv/kocoui/files"
UPLOAD_MAX=50
FILES_RETENTION=30

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)          DOMAIN="$2"; shift 2 ;;
    --app-user)        APP_USER="$2"; shift 2 ;;
    --hermes-user)     HERMES_USER="$2"; shift 2 ;;
    --basic-auth-user) BA_USER="$2"; shift 2 ;;
    --files-root)      FILES_ROOT="${2%/}"; shift 2 ;;
    --upload-max-mb)   UPLOAD_MAX="$2"; shift 2 ;;
    --files-retention-days) FILES_RETENTION="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || { echo "--domain is required (lowercase host name)" >&2; exit 2; }
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "invalid --app-user" >&2; exit 2; }
[[ "$HERMES_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "invalid --hermes-user" >&2; exit 2; }
[[ "$FILES_ROOT" =~ ^/[a-z0-9/_.-]+$ && "$FILES_ROOT" != *..* ]] || { echo "invalid --files-root" >&2; exit 2; }
SOUL_PATH="/home/$HERMES_USER/.hermes/SOUL.md"
[[ "$UPLOAD_MAX" =~ ^[0-9]{1,4}$ && "$FILES_RETENTION" =~ ^[0-9]{1,4}$ ]] || { echo "invalid size or retention" >&2; exit 2; }
BA_USER="${BA_USER:-$APP_USER}"

HERE="$(cd "$(dirname "$0")" && pwd)"
T="$HERE/templates"
APP_ROOT="/home/$APP_USER/app"
HTPASSWD_DIR="/etc/nginx/hermesweb"
HTPASSWD="$HTPASSWD_DIR/$DOMAIN.htpasswd"
BA_SECRET_FILE="/root/basic-auth-$DOMAIN.txt"

log() { printf '\n== %s\n' "$*"; }

render() {
  sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__APP_USER__|$APP_USER|g" -e "s|__APP_ROOT__|$APP_ROOT|g" \
      -e "s|__FILES_ROOT__|$FILES_ROOT|g" -e "s|__UPLOAD_MAX__|$UPLOAD_MAX|g" \
      -e "s|__FILES_RETENTION__|$FILES_RETENTION|g" -e "s|__SOUL_PATH__|$SOUL_PATH|g" \
      "$1" | tr -d '\r' > "$2"
}

log "packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx php-fpm php-cli php-curl php-mbstring php-sqlite3 php-gd certbot apache2-utils fail2ban ufw acl inotify-tools
PHPV="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
echo "PHP $PHPV"
php -m | grep -qx sodium || apt-get install -y -q "php${PHPV}-sodium"

log "app user and directories"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$APP_ROOT" "$APP_ROOT/public"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$APP_ROOT/config" "$APP_ROOT/var" \
  "$APP_ROOT/var/sessions" "$APP_ROOT/var/tmp" "$APP_ROOT/var/log" "$APP_ROOT/var/data" "$APP_ROOT/var/cache" \
  "$APP_ROOT/var/run"
chmod 750 "/home/$APP_USER"
# nginx serves static files from public/ and needs to traverse the home dir; config/ and var/ stay 700
usermod -aG "$APP_USER" www-data
if [ ! -e "$APP_ROOT/public/index.php" ]; then
  printf '<?php\nheader("Content-Type: text/plain");\necho "hermesweb placeholder\\n";\n' > "$APP_ROOT/public/index.php"
  chown "$APP_USER:$APP_USER" "$APP_ROOT/public/index.php"; chmod 640 "$APP_ROOT/public/index.php"
fi

log "shared files ($FILES_ROOT)"
# inbox: written by the app, read-only for the agent. outbox: written by the agent,
# read-only for the app and nginx (www-data is in the app group).
id "$HERMES_USER" >/dev/null 2>&1 || { echo "agent user $HERMES_USER missing (install Hermes first)" >&2; exit 1; }
install -d -o root -g root -m 755 "$(dirname "$FILES_ROOT")" "$FILES_ROOT"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$FILES_ROOT/inbox"
install -d -o "$HERMES_USER" -g "$HERMES_USER" -m 750 "$FILES_ROOT/outbox"
setfacl -m "u:$HERMES_USER:rX" -m "d:u:$HERMES_USER:rX" -m "d:g:$APP_USER:rX" -m "d:u::rwX" "$FILES_ROOT/inbox"
setfacl -R -P -m "g:$APP_USER:rX,m::rX" -m "d:g:$APP_USER:rX,d:m::rX" "$FILES_ROOT/outbox"
render "$T/kocoui-files-acl.sh" /usr/local/sbin/kocoui-files-acl
render "$T/kocoui-files-prune.sh" /usr/local/sbin/kocoui-files-prune
render "$T/kocoui-push-watch.sh" /usr/local/sbin/kocoui-push-watch
chmod 700 /usr/local/sbin/kocoui-files-acl /usr/local/sbin/kocoui-files-prune /usr/local/sbin/kocoui-push-watch
for u in kocoui-files-acl.service kocoui-files-prune.service kocoui-files-prune.timer \
         kocoui-push-watch.service kocoui-push-watch.timer; do
  render "$T/$u" "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now kocoui-files-prune.timer >/dev/null
systemctl enable --now kocoui-push-watch.timer >/dev/null
systemctl enable kocoui-files-acl.service >/dev/null
systemctl restart kocoui-files-acl.service
getfacl -p "$FILES_ROOT/inbox" "$FILES_ROOT/outbox" 2>/dev/null | grep -E '^(# file|user:|group:|default:user:[a-z])'

log "persona file"
# Traverse-only on the agent home, read-write on SOUL.md alone. No default ACL:
# a new file in that directory must not become readable by the app.
if [ -f "$SOUL_PATH" ]; then
  setfacl -m "u:$APP_USER:x" "/home/$HERMES_USER" "/home/$HERMES_USER/.hermes"
  setfacl -m "u:$APP_USER:rw" "$SOUL_PATH"
else
  echo "no $SOUL_PATH yet; persona access skipped"
fi

log "gateway restart helper"
# The web app cannot exec systemctl. It drops a stamp under var/run; this path
# unit (root) restarts hermes-gateway and clears the stamp.
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$APP_ROOT/var/run"
render "$T/kocoui-restart-gateway.sh" /usr/local/sbin/kocoui-restart-gateway
chmod 700 /usr/local/sbin/kocoui-restart-gateway
render "$T/kocoui-restart-gateway.service" /etc/systemd/system/kocoui-restart-gateway.service
render "$T/kocoui-restart-gateway.path" /etc/systemd/system/kocoui-restart-gateway.path
systemctl daemon-reload
systemctl enable --now kocoui-restart-gateway.path >/dev/null

log "php-fpm pool"
render "$T/php-fpm-pool.conf" "/etc/php/$PHPV/fpm/pool.d/$APP_USER.conf"
render "$T/php-hardening.ini" "/etc/php/$PHPV/fpm/conf.d/99-hermesweb-hardening.ini"
if [ -f "/etc/php/$PHPV/fpm/pool.d/www.conf" ]; then
  mv "/etc/php/$PHPV/fpm/pool.d/www.conf" "/etc/php/$PHPV/fpm/pool.d/www.conf.disabled"
fi
"php-fpm$PHPV" -t
systemctl restart "php$PHPV-fpm"

log "nginx base config"
install -d -m 755 /var/www/acme "$HTPASSWD_DIR"
rm -f /etc/nginx/sites-enabled/default
if grep -qE '^\s*#?\s*server_tokens\s' /etc/nginx/nginx.conf; then
  sed -i -E 's/^(\s*)#?\s*server_tokens\s+[a-z]+;/\1server_tokens off;/' /etc/nginx/nginx.conf
else
  sed -i -E 's/^(\s*http\s*\{)/\1\n\tserver_tokens off;/' /etc/nginx/nginx.conf
fi
render "$T/nginx-http-context.conf" /etc/nginx/conf.d/hermesweb.conf
render "$T/nginx-headers-base.conf" /etc/nginx/snippets/hermesweb-headers-base.conf
render "$T/nginx-headers.conf" /etc/nginx/snippets/hermesweb-headers.conf
render "$T/nginx-php.conf" /etc/nginx/snippets/hermesweb-php.conf

log "basic auth"
if [ ! -s "$HTPASSWD" ]; then
  BA_PASS="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-40)"
  htpasswd -cbB -C 12 "$HTPASSWD" "$BA_USER" "$BA_PASS" 2>/dev/null
  ( umask 077; printf 'Basic auth for https://%s\nuser: %s\npassword: %s\n' "$DOMAIN" "$BA_USER" "$BA_PASS" > "$BA_SECRET_FILE" )
  unset BA_PASS
  echo "created; credentials in $BA_SECRET_FILE (root only)"
else
  echo "exists, unchanged"
fi
chown root:www-data "$HTPASSWD"; chmod 640 "$HTPASSWD"

log "firewall"
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw status | grep -E '^(22|80|443)/tcp ' || true

log "certificate"
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  render "$T/nginx-http.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
  ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
  nginx -t
  systemctl reload nginx
  certbot certonly --webroot -w /var/www/acme -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --key-type ecdsa --deploy-hook "systemctl reload nginx"
else
  echo "certificate exists"
fi

log "nginx site"
render "$T/nginx-site.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
nginx -t
systemctl reload nginx

log "fail2ban"
render "$T/fail2ban-filter-login.conf" /etc/fail2ban/filter.d/hermesweb-login.conf
render "$T/fail2ban-jail.conf" /etc/fail2ban/jail.d/hermesweb.conf
systemctl restart fail2ban
sleep 2
fail2ban-client status | sed -n 's/.*Jail list:\s*//p'

log "hermes formatting hint"
# Hermes tells the model the API-server client renders plain text; this UI renders Markdown.
HERMES_BIN="/home/$HERMES_USER/.local/bin/hermes"
if [ -x "$HERMES_BIN" ]; then
  HINT="$(render "$T/hermes-platform-hint.txt" /dev/stdout | tr '\n' ' ' | sed 's/ *$//')"
  runuser -u "$HERMES_USER" -- env HOME="/home/$HERMES_USER" "$HERMES_BIN" config set platform_hints.api_server.replace "$HINT" >/dev/null
  systemctl restart hermes-gateway 2>/dev/null && echo "set; hermes-gateway restarted" || echo "set; restart hermes-gateway yourself"
else
  echo "hermes not found at $HERMES_BIN, skipped"
fi

log "done"
echo "https://$DOMAIN is up behind basic auth. App root: $APP_ROOT"
