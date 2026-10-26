# Security model

This is a shared game for a trusted LAN. It has no public-account authentication, TLS termination
or per-player administrative roles. Joined players share pause, speed, wave, save/load and restart
controls, and shared structures. Do not expose port 7777 to the public internet as a production service.
Browser-tab tokens support reconnection; they are not a replacement for account authentication.

## Enforced boundaries

- Browser WebSocket origins must match the request host. Native clients without an Origin are
  allowed on the trusted LAN. Arbitrary native clients can still reach an exposed host.
- Commands are parsed as unknown data, checked against an exhaustive runtime schema, then
  dispatched. Strings are not coerced to numbers. Counts, coordinates, ids, enum membership,
  required fields, partial points and unknown keys are checked.
- A command's hero id is rebound to the joined player. Development commands are disabled by
  default; embedding the server may explicitly opt in through `allowDevCommands`.
- Connections, players, message sizes, message rates and outgoing queues are bounded in `server/security.ts`.
  Transport errors terminate the affected socket. Resource/site checks remain authoritative.
- Save/load/list errors are returned to the requester instead of becoming unhandled rejections.
  File save codes are validated in the store itself, generated with cryptographic randomness,
  and published atomically without overwriting an existing code. Damaged files are isolated.
- Saves are checked before restoration, including clocks, hero structure, finite numbers,
  grid lengths and prototype-shaped keys. This is not a general-purpose hostile-save import API.
- HTTP serves only the loaded release map. There is no request-driven filesystem traversal.
  Responses carry MIME, content-security, framing and referrer protections.
- UI displays player text through text nodes or HTML escaping. Never interpolate untrusted
  names, save codes or network errors into HTML without escaping them.

## Verification and limits

Run `npm run test:security`, `npm run test:storage`, `npm run test:lan` and `npm audit` for changes
at these boundaries. CI checks known dependency advisories. Test malformed messages and recovery,
not just happy paths. Postgres-backed saves need a separate environment-backed integration run;
the default gate exercises the file store and a temporary in-memory LAN store.

This model does not provide anti-cheat or player isolation inside a cooperative match. A public
service would additionally need authentication, authorization, transport security, deployment
limits, operational monitoring and a separate security review. No test suite proves “no issues.”
