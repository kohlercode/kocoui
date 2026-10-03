# Troubleshooting

Things that show up when a custom Hermes interface talks to a real Hermes Agent. The skills note is the only optional edit of a Hermes file, and only on versions that still have that bug.

## Replies look like plain text

Hermes ships a platform hint that tells the model the API client cannot render Markdown. Tables then arrive as aligned spaces.

`provision.sh` replaces `platform_hints.api_server.replace` with the text in `deploy/templates/hermes-platform-hint.txt`. The key is top-level, not under `agent.`. If you configured Hermes before provisioning, re-run `provision.sh` or set that key yourself, then restart `hermes-gateway`.

## A deleted conversation comes back

Hermes writes the auto-generated title a few seconds after a turn ends. A delete that lands in that window is undone by the title write, and the conversation reappears empty.

Kocoui remembers deleted session ids and hides them, then deletes again. Tombstones are kept for a few days so the daily file prune can still find them.

## The skills page says unavailable

Hermes 0.21.5 (and upstream main on 2026-09-29) crashes on `GET /v1/skills` because it passes `include_editorial=True` to a function that no longer accepts that argument. Kocoui treats that 5xx as "skills unavailable" so the rest of the UI keeps working.

You can leave it that way. If you want the list, and a current Hermes release still has the bug, this one-line edit on the server removes the bad argument:

```bash
cd /home/hermes/.hermes/hermes-agent
runuser -u hermes -- sed -i 's/skip_disabled=False, include_editorial=True/skip_disabled=False/' gateway/platforms/api_server.py
systemctl restart hermes-gateway
```

Re-check this file after every `hermes update`. If the upstream function already matches, skip the edit.

## Sending the same message twice, or changing the model

Hermes rejects a reused idempotency key whose body changed (HTTP 409). A retry of the identical message reuses its key. Changing the model, or editing the text, uses a new key. The composer does this for you.

## Guidance typed after the answer arrived

If a steer message lands after the final answer, Hermes returns it as `pending_steer` on the terminal event. The UI puts that text back into the composer.

## The agent sent a file and the UI cannot read it

The agent runs with `umask 077`. Copying a file into the outbox can leave the ACL mask as `---`, so the PHP user cannot read it even though a default ACL exists. `provision.sh` installs a small root inotify service (`kocoui-files-acl`) that resets the mask. `audit.sh` checks that the service is active.

`test -r` is misleading here. Check with a real read as the app user.

## Image uploads are ignored

The vision side task needs a model that accepts images. See the optional step in [install.md](install.md). Only `auxiliary.vision` should use a second provider.

## Notifications never arrive with the tab closed

Hermes only streams events while a browser tab is connected. Closed-window alerts are queued when you send a message. The `kocoui-push-watch` timer polls that queue every 20 seconds and pushes "Approval needed" or "Reply ready" plus a link. The payload does not contain the prompt or the command. A run still going after 30 minutes is dropped and gets no push.

`systemctl status kocoui-push-watch.timer` is the first thing to check. Each status poll gives up after 10 seconds, and one timer pass stops after 20 seconds, so a gateway that accepts the connection and then stays silent cannot block the other queued runs.

Every open chat tab holds a PHP worker for up to 50 seconds per stream window. `pm.max_children` (12 by default) should stay above the number of concurrent tabs. Raise it only after measuring how much memory one worker uses; each child is capped at 256 MB.

The service worker does not cache the signed-in app.

## The site will not install on a phone

HTTP basic auth is in front of the whole vhost. The web app manifest is requested with credentials so that fetch is not anonymous. If you remove basic auth, the manifest link can stay as it is.

## Rolling back a release

`install-release.sh` runs `bin/kocoui check` after swapping in new code. If that check fails, it moves the previous `bin/`, `src/`, and `public/` back into place and reloads PHP-FPM. A database migration from the newer release is not undone: schema steps only move forward.

## Gateway restart from the UI does nothing

Restart is a stamp file under `app/var/run`. A root systemd path unit (`kocoui-restart-gateway.path`) notices it and restarts `hermes-gateway`. The PHP user never gets `exec` or sudo. `audit.sh` checks that the unit is enabled.
