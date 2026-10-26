# Working on td01

- Read [the shared engineering standard](docs/engineering/STANDARD.md) and [adoption exceptions](docs/engineering/ADOPTION.md) before coding; use its language, library, testing and architecture choices.

## Product contract

- Polish the existing loop before adding features: kit → gather → workshop → shipment → deployed tower.
- Keep one mine, one workshop and one utility shop. No river, bridge or loose mineable stone props.
- Preserve permanent digging, optional guidance, saved transitions and the first-wave hold.
- The shop sells durable utilities, not resources, crafted goods or consumables.
- Use the pack's cone trees. Keep the painted cartoon style and one visual preset.
- Research, era minigames and historical rail/space scenarios are outside the supported first loop.

## Boundaries

- Read `docs/ARCHITECTURE.md` before changing state, commands, persistence or networking.
- `src/core` is independent; `src/game` imports only core/game code and has no browser or renderer APIs.
- The simulation owns gameplay and uses seeded RNG. Views and UI send commands; they do not award resources.
- Every new command needs an entry in `src/game/commands.ts`; the type checker requires coverage.
- Keep authoritative validation in the game handler as well as the untrusted network boundary.
- Put 3D props in `src/view`, DOM controls in `src/ui`, transport/storage in `server` or `src/net`.
- Extract a focused module rather than growing a legacy monolith. The architecture check enforces size budgets.
- Keep optional minigames and later-era screens behind their on-demand imports; the build enforces their chunk boundaries.
- Avoid framework rewrites, new settings, general-purpose abstractions and dependencies without a concrete need.

## Required evidence

- Run `npm run check`; it must pass. Never remove or weaken an assertion to make a failure disappear.
- Run `npm run test:lan` for command, save, server or network changes.
- Run `npm run test:browser` for movement, interactions, UI, camera, rendering or the first-tower loop.
- Add a regression test for a reproducible bug at the lowest useful boundary.
- Check both snapshots and incremental updates for saved or replicated fields.
- For performance work, record what was measured and on which machine. Do not claim laptop validation from desktop tests.
- `.legacy.*` scenarios preserve old designs; they are not maintained acceptance tests. Do not silently re-enable them.
- Do not modify architecture budgets, validation rules or CI to bypass a check; explain a justified contract change.

## Editing and handoff

- Preserve unrelated local work. No reset, clean or automatic commit/push.
- Use the existing formatter and keep README.md at 50 lines or fewer.
- Update the relevant contract document when behavior changes. Keep plans distinct from implemented features.
- Report behavior changed, checks run, and remaining uncertainty. “Bug free” and “no security issues” are not test results.
