# Changelog

Keep `Version::VERSION` in `app/src/Version.php` equal to `version` in `package.json`.

## [Unreleased]

## [0.4.0] - 2026-10-05

- The composer is one rounded field. A plus button attaches files. The round button on the right records while the field is empty, and sends once there is text or a file. Stopping a recording sends that clip on its own; text already in the field stays.
- Short audio in the chat plays as a waveform. A caret in the corner of the card downloads the file. Audio larger than 2 MB keeps the browser control.

## [0.3.0] - 2026-10-04

- A record button in the composer captures a voice message and sends it as an audio file. The agent reads that file the same way it reads an uploaded mp3. A long take is stored as short blobs and stops before the upload limit.
- The site header allows the microphone for its own origin (`microphone=(self)`). An install created earlier keeps `microphone=()` until that nginx snippet is updated and nginx is reloaded. A release deploy does not change nginx snippets.
- The header shows the app version next to the name, in the theme accent color.

## [0.2.1] - 2026-10-04

- The Send button submits the draft. A long message stays in the field instead of pushing the button out of the row.

## [0.2.0] - 2026-10-03

- Added an informal Spanish UI locale.
- Documented the security model, and added contributor notes for people and coding agents.

## [0.1.0] - 2026-10-03

- Added the initial public release of the PHP web interface for Hermes Agent.
- Push status polls time out after 10 seconds, and one timer pass stops after 20 seconds, so a silent gateway cannot stall the queue.
- `push:watch --dry-run` lists queued runs without sending or deleting. The security audit uses that.
- Fixed TOTP login so a code from the next 30-second window is rejected and cannot burn the current step.
- Moved Web Push delivery onto a `kocoui-push-watch` timer so a running turn no longer holds a PHP-FPM worker.
- Added a zero-dependency PHP test suite and a GitHub Actions workflow.
- `bin/kocoui check` reports the version and missing PHP extensions. `provision.sh` installs `ext-sodium` when it is absent.
- A failed post-install check rolls `bin/`, `src/`, and `public/` back to the previous release.
- Malformed VAPID keys and an unreadable TOTP secret fail cleanly instead of as a 500.
