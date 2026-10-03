# Contributing

KocoUI is a small PHP application. A useful change is one that a stranger can install from this repo without your machine, your domain, or your secrets in the diff.

## Before you open a pull request

- Run `php tests/run.php` from the repo root. All tests should pass.
- If you changed the frontend, run `npm run build`.
- User-facing strings go in both `frontend/src/i18n/en.json` and `frontend/src/i18n/de.json`. German uses the informal "du".
- New config keys get a default in code and an entry in `app/config/config.example.php`.
- Schema changes are a new entry at the end of `Db::MIGRATIONS`. Do not edit a migration that already shipped.
- Comments explain a constraint the code cannot show. Skip comments that restate the next line.

## What not to include

- Passwords, API keys, TOTP secrets, VAPID private keys, or `.env` contents.
- Real domains, IP addresses, hostnames, or paths from your own server. Use `ui.example.com`, `<ssh-alias>`, and `alice`.
- Built files under `app/public/assets/`, `app/config/config.php`, or `app/var/`.
- A change that makes the Hermes API reachable from the browser, turns `approvals.mode` off, or adds a terminal endpoint.

## PHP

`declare(strict_types=1);`, namespace `KocoUI\…`, `final` classes. Controllers end in `Response::json()` or throw `HttpError`. Validate ids and strings before they go into a Hermes URL or body. Hermes calls go through `HermesClient`. The web app does not shell out.

## Frontend

Preact components, Bootstrap utility classes, no inline `style=""` attributes, no assets from a CDN. Markdown from the agent goes through `frontend/src/markdown.js`. Requests go through `frontend/src/api.js`.

## Docs and changelog

Behavior changes update `README.md`, `docs/install.md`, or `docs/troubleshooting.md` when those pages would otherwise be wrong. Add a line under `[Unreleased]` in `CHANGELOG.md`. Keep `app/src/Version.php` and `package.json` on the same version.

## Security reports

Email hello@kohlercode.com. See [SECURITY.md](SECURITY.md) and [docs/security-model.md](docs/security-model.md). Do not open a public issue for a vulnerability.
