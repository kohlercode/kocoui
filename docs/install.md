# Install the PHP web interface for Hermes Agent

Kocoui is a separate PHP application. These steps assume Hermes Agent is already installed for one user on the same machine, with its API server listening on `127.0.0.1:8642`. CI runs the tests on PHP 8.3. A newer distro PHP, including Ubuntu 26.04, is the same code and is not run in CI.

Hostnames, system users, and paths below are defaults. Override them with the flags on each script.

| Thing | Name | Why |
| --- | --- | --- |
| Product, repo, and CLI | KocoUI / `kocoui` | public name |
| System user, PHP-FPM pool, nginx directories, fail2ban jail | `hermesweb` | the name an install already uses; renaming it is a migration |
| Session cookie | `__Host-hwsid` | the name an install already uses |

## 1. Prepare Hermes

Follow the [Hermes Agent install guide](https://hermes-agent.nousresearch.com/docs/getting-started/installation) so that:

- The agent user (default `hermes`) has no sudo, and its `~/.ssh` is empty.
- The gateway runs as a system service (`hermes-gateway`) and survives a reboot.
- `API_SERVER_HOST` is `127.0.0.1`. The API key lives only in the Hermes `.env` (`API_SERVER_KEY`).
- `approvals.mode` is `manual`. With `smart` or `off`, the agent can approve its own shell commands.

```bash
su - hermes -c 'hermes config set approvals.mode manual'
systemctl restart hermes-gateway
ss -tlnp | grep 8642
```

The listen address in that last command must be `127.0.0.1`.

Create a DNS A (and AAAA) record for the hostname you will pass as `--domain`, for example `ui.example.com`, pointing at this server.

## 2. Provision the web server

On the VPS as root, from a copy of this repo's `deploy/` directory:

```bash
./provision.sh --domain ui.example.com
```

Useful flags: `--app-user hermesweb`, `--hermes-user hermes`, `--files-root /srv/kocoui/files`, `--upload-max-mb 50`, `--basic-auth-user NAME`, `--work-root /home/hermes/work`.

The script is safe to run again. It installs nginx, PHP-FPM (curl, mbstring, sqlite3, gd, and `ext-sodium` when the distro package does not already include it), certbot, fail2ban, and ufw rules for ports 22, 80, and 443. Login needs `ext-sodium`. It creates the app user, a PHP pool that cannot call `exec`, the shared `inbox/` and `outbox/` folders, a TLS certificate, and HTTP basic auth. The basic-auth password is written to `/root/basic-auth-<domain>.txt` (mode 600).

It also sets Hermes `platform_hints.api_server.replace` so replies use GitHub-flavored Markdown, which this UI renders. That writes a Hermes config key.

### Work directory

The Work view lists one directory the agent already uses for its project files. It is off until you set that path. The app can read the directory and cannot write it. Chat uploads still go to `inbox/`, and files the agent attaches to a message still go to `outbox/`. Do not point the work directory at the agent home or at `~/.hermes`.

```bash
./provision.sh --domain ui.example.com --work-root /home/hermes/work
```

Pass `--work-root` again whenever you re-run `provision.sh`. Leaving it out turns the viewer off in nginx and PHP. The path is stored in `/etc/kocoui/work-root`. The first install copies it into `config.php` as `files.work_root`. If `config.php` already exists, provision updates that one value. Later deploys do not change `config.php`.

`files.work_root` has to match the path provision wrote into nginx and `open_basedir`. Changing the directory means running provision again with the new `--work-root`. `deploy/audit.sh` checks that the three copies match, that the app can read the directory, and that it cannot create a file there.

PDFs from that directory open inside the page. The nginx location that serves them allows framing by this site only (`X-Frame-Options: SAMEORIGIN`). Every other response stays `DENY`. A release deploy does not rewrite that snippet.

## 3. Deploy the app

On your computer, in this repo (Node.js 20.19+ or 22.12+):

```bash
npm ci
npm run deploy -- --host <ssh-alias> --domain ui.example.com
```

`--host` is an SSH destination that logs in as root. `--domain` is required on the first install: the script generates `config.php`, copies `API_SERVER_KEY` from the Hermes `.env`, and creates a `security.secret` plus Web Push keys. Later deploys keep `config/` and `var/`.

Optional first-install flags: `--app-name "Hermes"`, `--default-lang en` (or `de`), `--app-user hermesweb`.

## 4. Create a user

There is no registration page. On the VPS:

```bash
runuser -u hermesweb -- php /home/hermesweb/app/bin/kocoui user:add alice
```

The command asks for a password (at least 14 characters) and walks through TOTP enrollment. Sign in at `https://ui.example.com` with the basic-auth credentials, then with that username, password, and a 6-digit code.

Other commands: `user:list`, `user:password`, `user:totp`, `user:delete`, `check`. Run them as the app user, never as root.

## 5. Check the box

On the VPS as root, from `deploy/`:

```bash
./audit.sh --domain ui.example.com
```

From another machine, confirm port 8642 does not accept connections. Only 22, 80, and 443 should be open.

## Optional: images

If your main model provider cannot read images, point only the Hermes vision side task at a provider that can. Leave every other auxiliary task on `main`, and do not set fallback providers, or titles and compression will bill the second provider too.

```bash
su - hermes -c 'hermes config set auxiliary.vision.provider <provider> && hermes config set auxiliary.vision.model <model>'
systemctl restart hermes-gateway
```

## Optional: phone notifications

Web Push is configured on the first deploy. In the UI, open Settings and enable notifications. To rotate the keys:

```bash
runuser -u hermesweb -- php /home/hermesweb/app/bin/kocoui push:vapid
```

Paste the printed values into `config.php` under `push`, then reload PHP-FPM.

## Optional: session timeouts

`config.php` under `security` controls how long a signed-in browser stays usable:

- `session_idle` — seconds without a request before the session is cleared (default `7200`)
- `session_absolute` — hard cap from login (default `43200`)
- `session_idle_warn` — seconds before expiry when the UI asks to stay signed in or sign out (default `120`; set `0` to disable the modal)

Existing installs that omit `session_idle_warn` get `120` from the code default. Changing these values does not require a re-provision; reload PHP-FPM after editing `config.php`. See [security-model.md](security-model.md#session-lifetime).

## Updates

```bash
npm run deploy -- --host <ssh-alias>
```

Update Hermes itself with its own updater (`hermes update`), then restart `hermes-gateway` and run `audit.sh` again. See [troubleshooting.md](troubleshooting.md) if the skills page is empty after a Hermes upgrade.

## Backups

On the VPS, `deploy/backup.sh --install` enables a nightly root-only backup under `/var/backups/hermes`. Those archives contain the Hermes `.env` and the app database.

From your computer:

```bash
npm run backups -- --host <ssh-alias> --dest <folder>
```

On Windows the default destination is `C:\Backups\<ssh-alias>`. Pass `--dest` to put them somewhere else.
