# Security model

KocoUI does not run the Hermes agent inside the web server. nginx and PHP-FPM serve the site. PHP calls the Hermes API on `127.0.0.1`. The API key stays in `config.php`, outside the document root. The browser never receives that key and never opens port 8642.

Signing in is still the front door of a machine. A signed-in user can ask the agent to run tools, including a shell, subject to Hermes approvals. This page says what that login reaches, and what it does not.

## What a signed-in user can do

- Send chat, steer or stop a run, and answer tool approvals (`once`, `session`, `always`, `deny`).
- List models, toolsets, and skills, and manage scheduled jobs when Hermes exposes that feature.
- Upload files and open files the agent has already produced, through the app's file routes.
- Read and save the persona file `SOUL.md`, and restore the one previous copy the app keeps.
- Ask the gateway to restart. The app writes a stamp file. A root unit restarts the service. PHP does not run shell commands for this.
- Turn Web Push on for their own account. Payloads are status lines and links, not prompts or commands.

There is no terminal or PTY endpoint in the web app. There is no self-registration and no password reset in the browser. Users are created with `bin/kocoui user:add`.

## What that login does not hand over

| Item | Where it lives | What the web app does |
| --- | --- | --- |
| Hermes API key | Hermes `.env` and `config.php` | Used only by PHP, on localhost. It is not in JavaScript, HTML, or logs. |
| Hermes home | The agent user's directory | The app user can read and write `SOUL.md` only. It cannot browse the rest of that home. |
| Backups | A root-only directory | The app user cannot read or delete them. |
| Other users' sessions | SQLite, mode `600`, owned by the app user | A stolen browser session is one user. It is not the database file and not another user's TOTP secret. |
| Root and SSH | Not granted to the app user or the agent user | Restarting the gateway does not give the app sudo. The agent user's `~/.ssh` is empty. |

A stolen session cookie can do what that user can do in the UI until the session ends. It cannot mint a new user, read `config.php`, or open the Hermes port from the internet. `deploy/provision.sh` also puts HTTP basic auth in front of the whole site.

## How this differs from an in-process UI

An in-process web UI loads the agent in the same program as the website and reads the Hermes home directly. A bug in that website is a bug in the agent process: the API key, the config, and the tool runtime are already there. Some of those UIs also expose a terminal in the browser and leave the password optional.

KocoUI keeps those in different processes. A bug in PHP is still serious, because the signed-in user can drive the agent. It does not start from the API key or from a shell inside the web worker. The FPM pool disables the PHP functions that run programs, and it limits `open_basedir` to the app directory, the files root, and the path of `SOUL.md`.

The Hermes setting `approvals.mode` stays `manual`. With `smart` or `off`, the agent can approve its own commands. KocoUI does not change that setting; the operator does, and `deploy/audit.sh` checks it.

## What the operator still has to get right

- Port 8642 listens on localhost only. Public ports are 22, 80, and 443.
- Basic auth, TOTP, and `approvals.mode: manual` stay on.
- The agent user has no sudo and no SSH keys to other machines.
- Backups stay root-only. They contain every secret.

`deploy/audit.sh` is read-only. Run it on the server after install and after a change. It prints `ok` or `FAIL` and does not print secrets. Report a problem in this model to hello@kohlercode.com. See [SECURITY.md](../SECURITY.md).
