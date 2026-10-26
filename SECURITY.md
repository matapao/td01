# Security

TD01 is a browser game with an optional host for a trusted LAN. Read the
[security model](docs/SECURITY.md) before running the host. Its shared controls and reconnect
tokens do not provide public-account authentication. Keep the LAN port off the public internet.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/matapao/td01/security/advisories/new)
when it is enabled. If it is unavailable, contact the repository owner privately through an existing
trusted channel. Do not open a public issue containing exploit details, credentials, saved player data
or other sensitive material.

Include the affected revision, reproduction steps, expected and actual results, and impact.
Use synthetic data and remove tokens, connection strings and personal information from evidence.
A reporting link is not a promise of response time or a supported production service.

## Development

Use Node.js 24 or newer and the committed lockfile. Run `npm run verify` and
`npm audit --audit-level=moderate` when changing dependencies or host boundaries.
Do not commit local environment files, keys, saves, private tool reports or recordings without
verified source redistribution rights. An ignore rule does not remove files from Git history.
