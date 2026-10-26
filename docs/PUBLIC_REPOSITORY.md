# Public repository preparation

Reviewed 2026-10-26. Repository preparation does not change GitHub visibility or publish a release.
The current source has an MIT code license, asset and font attribution, a locked npm dependency set,
quality checks and a documented trusted-LAN security model. DungeonCrawler01 has been extracted to
[its own repository](https://github.com/matapao/dungeoncrawler01); TD01 publication must use only the TD01 source and workflows.

## Fresh source publication and private historical archive

The approved publication plan recreates TD01 from the reviewed current source as one new root
commit. The fresh candidate is prepared in a separate `public-repos/td01` checkout, independently of the
original working repository. It imports no old commits, branches, tags or remote refs. The repository
owner coordinates private archive preservation, the new bot-authored commit and the GitHub cutover.
Source preparation and verification do not themselves commit, push or change visibility.

The original commit `2841870` contains 186 Sonniss recordings whose public source redistribution
permission was unconfirmed. Those files are deleted in the current working tree and are absent from
the fresh publication candidate. See [audio provenance](AUDIO_SOURCES.md). The historical repository
must remain private in its preserved archive; its media restriction does not apply to the fresh
candidate's excluded bytes. Never merge or push that old history into the new public repository.

The candidate copies existing current-source files identified by Git, then independently applies
ignore rules even to tracked paths. This excludes the tracked historical `.backup` tree as well as
DungeonCrawler01, local saves, environment files, private reports, installed dependencies and build
outputs. Source file modes are retained and symbolic links are rejected. The candidate has its own
empty Git repository on `main` before the owner creates the single approved source commit.

Scan the exact candidate source, including nested vendored archives, for secrets before committing.
Review findings privately, rotate any real credential, and remove exposed values before publication.
Keep reports with potentially sensitive findings outside public source. The original history was
reviewed separately; preserving it privately does not introduce its commits into the candidate.

## Redistributable third-party assets

The [asset/license audit](ASSET_LICENSE_AUDIT.md) identifies CC0 models, OFL fonts and CC-BY icons
separately from original MIT code. Unused local prototype source, private task tooling and three
optional mixed-site PNG captures are excluded from this candidate while their originals are retained.
The approved policy retains redistributable third-party assets with their required notices.
KayKit models remain CC0, bundled fonts retain OFL notices, and icons retain per-author CC-BY/CC0
credits and modification details. Original code/docs use MIT; no third-party work is relabeled.

## Verify the publication candidate

- Install from the committed lockfile with Node.js 24 and `npm ci --ignore-scripts` in an isolated
  checkout. The game must not depend on a sibling checkout or a developer's local installed packages.
- Run `npm run verify`, `npm run test:browser` and `npm run test:lan:browser` in their documented
  environments. Record the revision and actual results; fixtures do not establish browser acceptance.
- Run `npm audit --audit-level=moderate` with registry access. The 2026-10-26 local audit reported
  zero known advisories across 161 dependency entries; that result is time-specific.
- Retain [credits](CREDITS.md), font and KayKit license texts, and the
  [vendored Zirbel notice](../vendor/NOTICE.md). Review imported media separately from the MIT code.
- Review GitHub Actions permissions, enabled publication variables and secret scopes. Configure
  required merge checks and private vulnerability reporting in repository settings before opening it.
- Review the candidate's file list and history for credentials, recordings, private reports and large
  generated artifacts. Compare the prepared source against the intended working-tree changes.

## Local verification evidence

On 2026-10-26, Node.js 24.22.1 passed `npm run verify` in the working tree and in an isolated
source snapshot with no DungeonCrawler01 directory, installed dependencies or imported Git history.
The snapshot first passed a fresh `npm ci --ignore-scripts`. Both runs passed standards, formatting,
strict types, architecture, 69 headless tests, the production build and the LAN integration test.
`git diff --check` passed and the root README contained 39 lines.

The same day, `npm run test:lan:browser` passed against the production build in Google Chrome,
covering security policy, safe player names, join/pause/save/reload, deferred screens, download
recovery and all twelve playgrounds. `npm run test:browser` passed the first-tower loop against an
owned development server on a free local port, including guide choice, tools, gathering, lift travel,
fabrication, shipment, deployment and saved returning-player progress; it reported no browser errors.
The test host and browser processes were closed. The fresh candidate is validated separately from the preserved private historical repository.

Repository visibility, archive preservation and the approved fresh commit/push are coordinated by
the repository owner. These notes and checks do not perform a deployment.
