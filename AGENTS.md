# AGENTS.md

Notes for a coding agent working in this repository. Human contributors should read [CONTRIBUTING.md](CONTRIBUTING.md).

## What this project is

A self-hosted PHP web interface for an existing Hermes Agent on the same machine. The browser talks only to PHP. PHP talks to Hermes on `127.0.0.1:8642`. The API key stays in `config.php`.

## Invariants

- Do not proxy the browser to port 8642. `app/src/Hermes/HermesClient.php` is the only Hermes client.
- Do not log the API key, passwords, TOTP secrets, or chat prompts.
- Do not add `--yolo`, `approvals.mode: off`, or `approvals.mode: smart`. "Always allow" in the UI is Hermes' `always` choice.
- Do not add a terminal, PTY, or shell endpoint. The FPM pool disables PHP's exec-family functions. Gateway restart writes a stamp file; it does not call `exec`.
- Passwords are argon2id. TOTP is mandatory. There is no self-registration.
- Every file path from the browser or an agent reply goes through `Files::resolve()`.
- Persona edits `SOUL.md` only, in place, with one previous copy under `app/var/soul`.
- Web Push payloads are status lines and links, not prompts or commands.
- User-facing strings belong in `frontend/src/i18n/en.json`, `de.json`, and `es.json`. German uses "du". Spanish uses "tú".

## Checks

From the repo root:

```bash
php tests/run.php
npm run build
```

`php -l` on PHP files you touched. Do not print secrets while running checks.

## Public writing

English for code, comments, commit messages, and docs. Tracked files use `ui.example.com`, `<ssh-alias>`, and `alice`. The commit email for this project is `hello@kohlercode.com`.

Do not add private editor rules, deployment notes, or local test scripts to the repo.
