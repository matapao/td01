# Contributing

Read [AGENTS.md](AGENTS.md), the [development guide](docs/DEVELOPMENT.md),
[architecture](docs/ARCHITECTURE.md) and shared [engineering standard](docs/engineering/STANDARD.md)
before changing the game. The supported first loop is gathering, crafting, shipment and tower defence.
Keep proposals distinct from implemented features.

## Work locally

Use Node.js 24 or newer and npm:

```sh
npm ci --ignore-scripts
npm run dev
npm run verify
```

Run `npm run test:browser` for movement, interactions, UI, camera, rendering or the first-tower loop;
it requires Chrome and a running development server. See the development guide for Chrome setup
and the additional LAN browser check.

Keep changes focused in their owning subsystem, preserve unrelated local work, and add a behavior
regression test for a reproducible bug. Preserve deterministic rules, input validation and shutdown
paths. Format touched files with the existing formatter; do not weaken checks to obtain a pass.

## Propose a change

Explain the player-visible problem, resulting behavior, checks run and remaining uncertainty in the
pull request. Record relevant contract changes and a concise player-facing change title. Do not add
dependencies, publish builds or change releases without an explicit need and maintainer approval.

Original code and documentation use [MIT](LICENSE). Assets, fonts and libraries keep their own
licenses and credits. Include creator, source, license and modification details for imported material;
permission to use an asset in a game does not by itself establish permission to publish its source.
Read [repository publication notes](docs/PUBLIC_REPOSITORY.md) before preparing a public snapshot.
Report security issues privately through [SECURITY.md](SECURITY.md).
