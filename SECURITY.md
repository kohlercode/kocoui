# Security

## Supported versions

`0.x` is the supported line. Report problems against the current `main` branch.

## Reporting

Email hello@kohlercode.com. Expect a best-effort response. There is no bug bounty.

## What this project is responsible for

The web app keeps the Hermes API key on the server, requires a password and TOTP, and checks CSRF on unsafe requests. `deploy/provision.sh` puts HTTP basic auth in front of the site.

## What the operator is responsible for

- HTTP basic auth stays in front of the vhost.
- TOTP stays mandatory. There is no self-registration.
- Hermes `approvals.mode` stays `manual`.
- The agent user has no sudo and no SSH keys to other machines.
- Port 8642 stays on localhost.

Anyone who signs in can drive an agent that has a shell on the host. That is the design of this interface, not a vulnerability in it. The boundary is described in [docs/security-model.md](docs/security-model.md).
