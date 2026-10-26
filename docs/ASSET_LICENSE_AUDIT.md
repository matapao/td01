# TD01 asset and license audit

Reviewed 2026-10-26 for the fresh current-source publication candidate. This records license and
provenance evidence; it does not grant new rights or relabel third-party works as MIT. The user
approved retaining redistributable assets with their required notices. The original code/docs use
MIT; KayKit, bundled fonts and game-icons retain their separate licenses and credits.

## Inventory and evidence

The candidate contains 87 binary files: 70 KayKit model/animation GLBs, 10 WOFF2 fonts, three
TD01 gameplay JPGs, one Zirbel cartridge PNG and three Zirbel package archives. A byte-content pass found no other binary
formats. No audio/video recordings, purchase-source archives, old Git history, `.backup` or
DungeonCrawler01 content is included. Installed dependencies and generated builds are excluded
from the source inventory.

The [complete per-file inventory](asset-license-inventory.json) records each retained binary’s
path, size, SHA-256, license, source/pipeline evidence and notice locations, plus all 75 embedded
game-icons identifiers. It also records the excluded files and original hashes of removed captures.

| Content                      | Count | License / provenance                                                            |
| ---------------------------- | ----- | ------------------------------------------------------------------------------- |
| KayKit models and animations | 70    | CC0-1.0; Kay Lousberg; pinned GitHub packs and Complete Collection v7           |
| Font binaries                | 10    | SIL OFL-1.1; seven Google Fonts families; each family retains its OFL.txt       |
| Gameplay captures            | 3     | Original TD01 captures containing KayKit CC0 models and original game rendering |
| Vendored Zirbel archives     | 3     | MIT; vendor/NOTICE.md and vendor/zirbel-LICENSE.txt retained                    |
| Embedded game-icons paths    | 75    | 74 CC-BY-3.0; one Zeromancer icon CC0-1.0; per-icon credits retained            |

## Models, characters and animations

All 70 GLBs map to the existing import/build pipelines and retained KayKit license texts.
`scripts/assets/fetch-kaykit.mjs` pins five official GitHub packs to commits and two free itch.io
downloads to archive SHA-256 values. `collection-manifest.json` and `town-manifest.json` pin
selected collection source files. `build-assets.mjs`, `build-town-kit.mjs` and `build-mine-kit.mjs`
describe bundling, clip extraction, subsets and recoloring. Every characters2 basename had a
matching pinned source-file entry. Embedded textures travel inside their owning GLB.

The creator’s [Complete KayKit page](https://kaylousberg.itch.io/kaykit-complete) explicitly lists
CC0, consistent with the retained v7 license. Paid purchase or itch.io hosting alone does not
make the shipped selection proprietary. `kits/space.glb` includes CC0 KayKit Prototype Bits floor
models; this is a named creator asset pack, separate from the excluded local prototype source.

The original source purchase archive was not accessed again or rebuilt during this audit. Matching
the checked-in pipeline, source pins and license evidence is not a fresh byte-for-byte rebuild of
every derived GLB. See [collection provenance](KAYKIT_COLLECTION.md) and [credits](CREDITS.md).

## Fonts and embedded icons

Cinzel, Alegreya, Old Standard TT, Courier Prime, Cutive, VT323 and Exo 2 retain their family
copyright and OFL texts. Their binaries are documented as Google Fonts Latin subsets; upstream
download URLs and hashes are not pinned in this repository. No font binary was modified here.
The [OFL guidance](https://openfontlicense.org/ofl-faq/) permits bundling while requiring the font
license and authorship to remain. These files must not be labeled MIT.

The 75 paths in `src/ui/glyph-data.ts` come from game-icons.net, with per-icon author/source
credits and a modification description in `docs/CREDITS.md` and the in-game credits. The
[creator FAQ](https://game-icons.net/faq.html) explains its attribution requirement. No Lucide or
other icon package was found in maintained application imports. No icon was relabeled MIT.

Other inline application visuals are the simple authored shapes in `src/ui/dom.ts`, procedurally
rendered model/tool icons, and a one-pixel blank PNG fallback in `src/ui/icons.ts`. No additional
third-party bitmap library is embedded there. `docs/research/mine-reference-index.json` is an index
of external photograph URLs/alt labels for analysis; it contains no copied photograph bytes and is
not a game dependency. The historical asset catalog contains reference links and an external
Google Fonts stylesheet request (Cinzel, Alegreya Sans and IBM Plex Mono), rather than bundled
font bytes. It is marked as historical research and cannot authorize importing those resources.

## Removed optional prototype material

The candidate excludes unused `three.js/` drift experiment source and `codex-one/` private task
tooling. Maintained application/server/scripts/package/build/workflow references were checked:
only formatter exclusion lists mentioned these directories. Originals remain in the private
working repository. The candidate ignore rules prevent accidental reintroduction.

These unused mixed-site PNGs were visually inspected and excluded because their FPS01/Derby01
covers and platform UI had no per-image provenance record in TD01. They have no runtime or
maintained-check references; the three gameplay JPGs remain:

- `docs/site/td01/cover-preview.png`
- `docs/site/td01/mobile-preview.png`
- `docs/site/td01/shelf-preview.png`

## Dependency license boundaries

The three vendored Zirbel archives declare MIT. Core and statistics include package/LICENSE;
the engineering archive’s missing inline notice is supplied by vendor/zirbel-LICENSE.txt.
Archive integrity was not changed.

A local installed-package manifest inventory also found Apache-2.0, BSD-3-Clause, ISC, MPL-2.0
(lightningcss) and LGPL-3.0-or-later (libvips through sharp) dependencies alongside MIT. These
installed packages are not checked into the source candidate. TypeScript/Puppeteer and the
asset/build tools are development dependencies. Their metadata is separate from the original
game’s MIT license; a literal MIT-only dependency graph would require a separate tooling review.
Generated playable distribution and dependency redistribution require the applicable notices.
No license label or asset content was changed to evade these obligations.

## README logo

`docs/cartridge.png` reuses the actual cartridge from [Zirbel](https://zirbel.app/), exported
from its existing front-face markup, styles and painted key art. Only the Alpha/Beta badge is
aligned with this repository’s Status. The README displays the cartridge at 112 pixels wide.
The cartridge layout is from Zirbel’s `packages/web/lib/cover.ts` and site styles; retain
[its MIT notice](ZIRBEL_CARTRIDGE_LICENSE.txt). The image includes rendered lettering, not font
software; the SIL OFL does not require documents or artwork produced with a font to use OFL.
The pictured TD01 gameplay retains the KayKit CC0 and other applicable credits in `docs/CREDITS.md`.
