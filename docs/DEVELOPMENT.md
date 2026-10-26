# Development

Use Node.js 24 or newer and the committed npm lockfile. `npm run dev` starts Vite;
`npm run lan` builds the browser and starts the supervised LAN host.

## Checks

| Command                            | Evidence                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                   | Standards, formatting, compiler profiles, architecture, maintained headless tests, production build and LAN integration |
| `npm run format`                   | Applies the shared formatter to maintained files                                                                        |
| `npm run test:browser`             | First-tower flow in Chrome against a running dev server                                                                 |
| `npm run test:lan:browser`         | Production `dist`, an owned LAN server and Chrome                                                                       |
| `npm audit --audit-level=moderate` | Current dependency advisories; separate networked check                                                                 |

`npm test` discovers `scripts/*-test.ts`, except separately run LAN integration.
Workers have bounded concurrency/timeouts. `.legacy.*` scenarios remain historical evidence.
Input/view unit ports cover command routing and ownership; they do not replace WebGL acceptance.
Architecture fixtures reject coordinator back-edges and value-import/re-export cycles, including
aliases and cross-system helpers. The complete application runtime graph is acyclic. New leaves stay
below 600 lines; content, HUD, mine, crafting, hero and combat coordinators have no size exemptions.

Browser tests default to `http://127.0.0.1:5173/`; pass another URL after `--`.
Set `CHROME_PATH` for another Chrome installation. Ignored screenshots go to `scripts/out`.
The first-loop scenario buys tools, gathers, rides the lift, aims charges at real rock, fabricates/ships a kit,
reloads the deployed tower and checks persistent guidance choice/errors.
LAN-browser checks cover security, names, join/pause/save/rejoin, deferred requests, twelve playgrounds,
cancelled/failed imports and Space entry. Later-era fixtures do not expand supported product scope.

LAN integration owns temporary HTTP/WebSocket servers and memory saves. It covers authority, invalid input,
origin/payload limits, excavation deltas, save/load and disk-error recovery without real saves/databases.
CI runs quality, LAN, audit and Chrome checks. Required merge checks must also be configured in GitHub settings.

## Types and builds

Node strips erasable TypeScript; use explicit import extensions and `node:test`.
The browser profile has DOM/Vite declarations; server has Node and no DOM; tools check integration;
portable core/game use ES2022 with no ambient platform types. Only host serialization `save.ts` is excluded
from the portable profile and checked in both host environments.

Maintained source enforces checked indexing, exact optional fields, explicit returns and dictionary access.
Use tuples for fixed shapes, validate optional selections, document numerical-buffer bounds, omit absent
creation options, and explicitly type clearable state. Consumer tests reject weakening these contracts.
The TS-01/02/03 migrations are complete across all four projects; the mirrored adoption record records their coverage.
The active gate runs browser, server, script, portable core/game and `tsconfig.tools.json` profiles.
The tools profile checks every maintained JS/MJS script, including asset importers, screenshots and
current browser regressions. Archived `.legacy.*` scenarios stay excluded.

The build guard requires the game entry/minigame factories, lazy presentation imports and unchanged
1,500,000-byte chunk/startup budgets. `.vite/bundle-report.json` records the graph.
Local emitted startup JavaScript fell from 1,854.03 kB to 1,487.44 kB on arm64 Mac,
Node 24.22.1/Vite 8.3.4; this is not a frame-rate or modest-laptop measurement.

Microblock meshing spot checks (2026-10-25, Apple M4, macOS arm64, Node 26) measured
representative untouched solid chunks at 63–75 ms before conservative column skipping and 4–7 ms
afterward. A tunnel chunk took 56 ms afterward, spread across the existing 2 ms frame budget.
These are local CPU generation measurements, not frame-rate or laptop validation.

## Data and review

Single-player saves use localStorage; LAN saves belong to the host. `DATABASE_URL` enables optional Postgres;
otherwise atomic file writes are used. Serialized/version changes require migrations, full/delta restoration
and deterministic-continuation tests. Postgres needs its own environment-backed integration run.

Keep local model/font/audio creator, source and license records when replacing media.
Read [architecture](ARCHITECTURE.md), [security](SECURITY.md) and the shared standard before editing.
Report the changed behavior, checks actually run and unresolved limits. Fixtures are not fresh-player evidence;
a local build is not a deployed release.
