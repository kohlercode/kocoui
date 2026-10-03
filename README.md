# Kocoui — self-hosted PHP web interface for Hermes Agent

Kocoui is a custom Hermes interface written in PHP, the most common scripting language on the web. It gives an existing [Hermes Agent](https://github.com/NousResearch/hermes-agent) a private browser UI: streaming chat, tool approvals, files, and persona editing.

The PHP app sits beside Hermes and calls its API on localhost. You install Kocoui with the scripts in this repo. Hermes stays the agent you already run.

![Chat](docs/screenshots/chat.png)

## Why a PHP Hermes interface

Hermes Agent is a long-running agent with a shell, files, memory, and skills. People reach it from a terminal, from messaging apps, or from a generic chat frontend pointed at its OpenAI-compatible API.

Kocoui is a purpose-built custom Hermes interface for the case where you want your own site, in PHP:

| | Kocoui | Hermes dashboard | hermes-webui | Open WebUI |
|---|---|---|---|---|
| What it is | Custom Hermes chat UI | Config UI plus an embedded terminal | Web UI with CLI parity | General chat app connected to Hermes |
| Language | PHP 8 backend, Preact frontend | Python | Python and vanilla JS | Python |
| How it connects | Loopback Hermes API, key stays on the server | Local dashboard process | In-process agent | OpenAI-compatible API |
| Login | Password plus mandatory TOTP, no open registration | Dashboard auth | Your deployment | Its own accounts |

PHP is a deliberate choice. It is what most web servers already run, and the backend has no Composer dependencies: nginx, PHP-FPM, and SQLite.

## What this custom Hermes interface includes

- Streaming replies rendered as sanitized GitHub-flavored Markdown
- Inline approval cards when Hermes wants to run a command (`once`, `session`, `always`, `deny`)
- Steer a running turn, or stop it
- Model picker, tools and skills list, scheduled jobs
- Uploads (button, drag and drop, paste) and files the agent sends back, with an album and a lightbox
- Persona page that edits Hermes `SOUL.md` in place
- Light and dark themes, English and German
- Optional Web Push when a reply or an approval is waiting, and a minimal installable PWA
- Slash commands in the composer: `/help`, `/new`, `/status`, `/stop`, `/restart`

![Tool approval](docs/screenshots/approval.png)

![Files](docs/screenshots/files.png)

![Persona](docs/screenshots/persona.png)

![Phone](docs/screenshots/mobile.png)

The screenshots above are placeholders. Real captures of the interface will replace the files in `docs/screenshots/`.

## Requirements

- Ubuntu 24.04 or 26.04 VPS with Hermes Agent already installed
- Hermes gateway running, API server bound to `127.0.0.1:8642`
- DNS name for the UI
- On your own computer: Node.js 20 or 22, npm, and SSH access as root to the VPS

Install steps: [docs/install.md](docs/install.md). Quirks worth knowing: [docs/troubleshooting.md](docs/troubleshooting.md).

## Security

Whoever signs in can drive an agent that has a shell on the server. Treat the login as the front door of that machine.

- Argon2id passwords, mandatory TOTP, no self-registration (users are created with `bin/kocoui`)
- Session cookie `Secure`, `HttpOnly`, `SameSite=Strict`, plus CSRF checks
- The Hermes API key stays in `config.php` outside the document root. The browser never receives it and never talks to port 8642
- Strict Content-Security-Policy, Markdown sanitized in the browser
- `approvals.mode` stays `manual` on the Hermes side. Do not turn approvals off
- `deploy/provision.sh` puts HTTP basic auth in front of the whole site and installs fail2ban rules for the login

After installing, run `deploy/audit.sh` on the server. It is read-only and prints no secrets.

## License

[MIT](LICENSE)
