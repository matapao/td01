# Credits

Everything below ships with the game and is served by it — the dev server, `vite build` and the LAN
server alike — so nothing needs the internet. The same list is in the game: **Esc → Menu → Credits**
(`src/ui/credits.ts`).

## 3D models and animations — KayKit (CC0)

**KayKit** by **Kay Lousberg** — <https://kaylousberg.com> — **CC0 1.0** (public domain; credit is
not required, and given gladly). The characters, skeletons, buildings, props, items and tools come
from the KayKit packs (the Complete Collection v7); the licence of every pack used is in
`public/assets/licenses/`.

## Icons — game-icons.net (CC BY 3.0)

> Icons made by **Lorc**, **Delapouite**, **Carl Olsen**, **Sbed** and **Skoll** (CC BY 3.0), and by
> **Zeromancer** (CC0). Available on <https://game-icons.net>.

- Licence: [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/) — credit
  each author; Zeromancer gave theirs as [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- Source: <https://github.com/game-icons/icons> (each icon is a 512 × 512 SVG).
- Changes: only the icon's shape is used — the black square behind it is dropped and the shape is
  filled with the HUD's colours (the gold, or the colour of the text it stands in).
- What ships: only these 75 icons, as path data in `src/ui/glyph-data.ts`, made by
  `node scripts/icons/build-glyphs.mjs <game-icons checkout>` from the names in `src/ui/glyphs.ts`.

| Icon                                                                              | Author     | Licence   | Used for                                   |
| --------------------------------------------------------------------------------- | ---------- | --------- | ------------------------------------------ |
| [flame](https://game-icons.net/1x1/carl-olsen/flame.html)                         | Carl Olsen | CC BY 3.0 | damage type: Fire                          |
| [axe-sword](https://game-icons.net/1x1/delapouite/axe-sword.html)                 | Delapouite | CC BY 3.0 | damage type: Slash                         |
| [camping-tent](https://game-icons.net/1x1/delapouite/camping-tent.html)           | Delapouite | CC BY 3.0 | minimap: camps                             |
| [castle](https://game-icons.net/1x1/delapouite/castle.html)                       | Delapouite | CC BY 3.0 | minimap: the keep                          |
| [chest](https://game-icons.net/1x1/delapouite/chest.html)                         | Delapouite | CC BY 3.0 | minimap: chests                            |
| [chest-armor](https://game-icons.net/1x1/delapouite/chest-armor.html)             | Delapouite | CC BY 3.0 | armour class: Plate                        |
| [choice](https://game-icons.net/1x1/delapouite/choice.html)                       | Delapouite | CC BY 3.0 | minigame: Decide                           |
| [delivery-drone](https://game-icons.net/1x1/delapouite/delivery-drone.html)       | Delapouite | CC BY 3.0 | skill: Scout Drone                         |
| [dig-hole](https://game-icons.net/1x1/delapouite/dig-hole.html)                   | Delapouite | CC BY 3.0 | status: Burrowed                           |
| [encrypted-channel](https://game-icons.net/1x1/delapouite/encrypted-channel.html) | Delapouite | CC BY 3.0 | minigame: Encode                           |
| [enrage](https://game-icons.net/1x1/delapouite/enrage.html)                       | Delapouite | CC BY 3.0 | status: Enraged                            |
| [eye-target](https://game-icons.net/1x1/delapouite/eye-target.html)               | Delapouite | CC BY 3.0 | status: In the searchlight                 |
| [funnel](https://game-icons.net/1x1/delapouite/funnel.html)                       | Delapouite | CC BY 3.0 | minigame: Separate                         |
| [healing](https://game-icons.net/1x1/delapouite/healing.html)                     | Delapouite | CC BY 3.0 | skill: Mend                                |
| [human-target](https://game-icons.net/1x1/delapouite/human-target.html)           | Delapouite | CC BY 3.0 | status: Taunted                            |
| [metronome](https://game-icons.net/1x1/delapouite/metronome.html)                 | Delapouite | CC BY 3.0 | minigame: Keep the beat                    |
| [mine-wagon](https://game-icons.net/1x1/delapouite/mine-wagon.html)               | Delapouite | CC BY 3.0 | minimap: mine heads                        |
| [path-distance](https://game-icons.net/1x1/delapouite/path-distance.html)         | Delapouite | CC BY 3.0 | minigame: Lay the path                     |
| [radio-tower](https://game-icons.net/1x1/delapouite/radio-tower.html)             | Delapouite | CC BY 3.0 | age: Signal                                |
| [rock-golem](https://game-icons.net/1x1/delapouite/rock-golem.html)               | Delapouite | CC BY 3.0 | armour class: Colossal                     |
| [round-knob](https://game-icons.net/1x1/delapouite/round-knob.html)               | Delapouite | CC BY 3.0 | minigame: Find the sweet spot              |
| [shambling-zombie](https://game-icons.net/1x1/delapouite/shambling-zombie.html)   | Delapouite | CC BY 3.0 | armour class: Flesh                        |
| [shield-bash](https://game-icons.net/1x1/delapouite/shield-bash.html)             | Delapouite | CC BY 3.0 | skill: Shield Bash                         |
| [shop](https://game-icons.net/1x1/delapouite/shop.html)                           | Delapouite | CC BY 3.0 | minimap: shops                             |
| [speedometer](https://game-icons.net/1x1/delapouite/speedometer.html)             | Delapouite | CC BY 3.0 | minigame: Hold the band                    |
| [stack](https://game-icons.net/1x1/delapouite/stack.html)                         | Delapouite | CC BY 3.0 | minigame: Build in order                   |
| [steam-locomotive](https://game-icons.net/1x1/delapouite/steam-locomotive.html)   | Delapouite | CC BY 3.0 | age: Steam                                 |
| [windmill](https://game-icons.net/1x1/delapouite/windmill.html)                   | Delapouite | CC BY 3.0 | age: Machine                               |
| [anvil](https://game-icons.net/1x1/lorc/anvil.html)                               | Lorc       | CC BY 3.0 | age: Metal                                 |
| [arrowhead](https://game-icons.net/1x1/lorc/arrowhead.html)                       | Lorc       | CC BY 3.0 | damage type: Pierce                        |
| [bat-wing](https://game-icons.net/1x1/lorc/bat-wing.html)                         | Lorc       | CC BY 3.0 | status: Flying                             |
| [brain](https://game-icons.net/1x1/lorc/brain.html)                               | Lorc       | CC BY 3.0 | branch: Thinking machines                  |
| [burning-dot](https://game-icons.net/1x1/lorc/burning-dot.html)                   | Lorc       | CC BY 3.0 | status: Burning                            |
| [campfire](https://game-icons.net/1x1/lorc/campfire.html)                         | Lorc       | CC BY 3.0 | age: Hand & Fire                           |
| [cartwheel](https://game-icons.net/1x1/lorc/cartwheel.html)                       | Lorc       | CC BY 3.0 | branch: Moving                             |
| [cog](https://game-icons.net/1x1/lorc/cog.html)                                   | Lorc       | CC BY 3.0 | branch: Automation                         |
| [cracked-glass](https://game-icons.net/1x1/lorc/cracked-glass.html)               | Lorc       | CC BY 3.0 | status: Brittle                            |
| [crossed-bones](https://game-icons.net/1x1/lorc/crossed-bones.html)               | Lorc       | CC BY 3.0 | armour class: Bone                         |
| [envelope](https://game-icons.net/1x1/lorc/envelope.html)                         | Lorc       | CC BY 3.0 | branch: Messages                           |
| [fire-ray](https://game-icons.net/1x1/lorc/fire-ray.html)                         | Lorc       | CC BY 3.0 | skill: Fireball                            |
| [frozen-block](https://game-icons.net/1x1/lorc/frozen-block.html)                 | Lorc       | CC BY 3.0 | status: Frozen                             |
| [frozen-orb](https://game-icons.net/1x1/lorc/frozen-orb.html)                     | Lorc       | CC BY 3.0 | skill: Frost Nova                          |
| [gear-hammer](https://game-icons.net/1x1/lorc/gear-hammer.html)                   | Lorc       | CC BY 3.0 | branch: Making                             |
| [gears](https://game-icons.net/1x1/lorc/gears.html)                               | Lorc       | CC BY 3.0 | minigame: Pick the sizes                   |
| [ghost](https://game-icons.net/1x1/lorc/ghost.html)                               | Lorc       | CC BY 3.0 | armour class: Spectral                     |
| [grab](https://game-icons.net/1x1/lorc/grab.html)                                 | Lorc       | CC BY 3.0 | action bar: Interact (F)                   |
| [hammer-drop](https://game-icons.net/1x1/lorc/hammer-drop.html)                   | Lorc       | CC BY 3.0 | damage type: Impact                        |
| [light-bulb](https://game-icons.net/1x1/lorc/light-bulb.html)                     | Lorc       | CC BY 3.0 | age: Electric                              |
| [magic-shield](https://game-icons.net/1x1/lorc/magic-shield.html)                 | Lorc       | CC BY 3.0 | armour class: Warded                       |
| [magic-swirl](https://game-icons.net/1x1/lorc/magic-swirl.html)                   | Lorc       | CC BY 3.0 | damage type: Arcane                        |
| [magnifying-glass](https://game-icons.net/1x1/lorc/magnifying-glass.html)         | Lorc       | CC BY 3.0 | minigame: Test & observe                   |
| [mechanical-arm](https://game-icons.net/1x1/lorc/mechanical-arm.html)             | Lorc       | CC BY 3.0 | age: Automated                             |
| [metal-bar](https://game-icons.net/1x1/lorc/metal-bar.html)                       | Lorc       | CC BY 3.0 | branch: Materials                          |
| [meteor-impact](https://game-icons.net/1x1/lorc/meteor-impact.html)               | Lorc       | CC BY 3.0 | skill: Meteor                              |
| [muscle-up](https://game-icons.net/1x1/lorc/muscle-up.html)                       | Lorc       | CC BY 3.0 | wave affix: Bolstering                     |
| [pointing](https://game-icons.net/1x1/lorc/pointing.html)                         | Lorc       | CC BY 3.0 | minigame: Steady hand                      |
| [power-lightning](https://game-icons.net/1x1/lorc/power-lightning.html)           | Lorc       | CC BY 3.0 | branch: Energy                             |
| [processor](https://game-icons.net/1x1/lorc/processor.html)                       | Lorc       | CC BY 3.0 | age: Electronic                            |
| [quake-stomp](https://game-icons.net/1x1/lorc/quake-stomp.html)                   | Lorc       | CC BY 3.0 | skill: Repulse                             |
| [rally-the-troops](https://game-icons.net/1x1/lorc/rally-the-troops.html)         | Lorc       | CC BY 3.0 | skill: Rally                               |
| [ringed-planet](https://game-icons.net/1x1/lorc/ringed-planet.html)               | Lorc       | CC BY 3.0 | branch: Space                              |
| [rocket](https://game-icons.net/1x1/lorc/rocket.html)                             | Lorc       | CC BY 3.0 | age: Space                                 |
| [scales](https://game-icons.net/1x1/lorc/scales.html)                             | Lorc       | CC BY 3.0 | minigame: Mix the ratio                    |
| [sharped-teeth-skull](https://game-icons.net/1x1/lorc/sharped-teeth-skull.html)   | Lorc       | CC BY 3.0 | wave affix: Frenzied                       |
| [shield-echoes](https://game-icons.net/1x1/lorc/shield-echoes.html)               | Lorc       | CC BY 3.0 | skill and status: Shield Wall              |
| [shouting](https://game-icons.net/1x1/lorc/shouting.html)                         | Lorc       | CC BY 3.0 | skill: Battle Cry                          |
| [skull-shield](https://game-icons.net/1x1/lorc/skull-shield.html)                 | Lorc       | CC BY 3.0 | status: Bone ward; wave affix: Bone-Warded |
| [snail](https://game-icons.net/1x1/lorc/snail.html)                               | Lorc       | CC BY 3.0 | status: Slowed                             |
| [snowflake-2](https://game-icons.net/1x1/lorc/snowflake-2.html)                   | Lorc       | CC BY 3.0 | damage type: Frost; status: Chilled        |
| [sprint](https://game-icons.net/1x1/lorc/sprint.html)                             | Lorc       | CC BY 3.0 | wave affix: Swift                          |
| [tombstone](https://game-icons.net/1x1/lorc/tombstone.html)                       | Lorc       | CC BY 3.0 | minimap: crypts                            |
| [white-tower](https://game-icons.net/1x1/lorc/white-tower.html)                   | Lorc       | CC BY 3.0 | minimap: towers                            |
| [electric](https://game-icons.net/1x1/sbed/electric.html)                         | Sbed       | CC BY 3.0 | damage type: Lightning                     |
| [knockout](https://game-icons.net/1x1/skoll/knockout.html)                        | Skoll      | CC BY 3.0 | status: Stunned                            |
| [heart-plus](https://game-icons.net/1x1/zeromancer/heart-plus.html)               | Zeromancer | CC0       | wave affix: Regenerating                   |

The authors' pages, as game-icons.net lists them: Lorc <http://lorcblog.blogspot.com>, Delapouite
<https://delapouite.com>, Carl Olsen <https://twitter.com/unstoppableCarl>, Sbed
<http://opengameart.org/content/95-game-icons>; Skoll and Zeromancer have none listed.

## Fonts — SIL Open Font License 1.1

All from [Google Fonts](https://fonts.google.com), the Latin subset as Google serves it, unmodified, in
`public/fonts/<family>/` beside its `OFL.txt`. The faces are only scaled and given Palatino's line
metrics in CSS (`src/ui/fonts.css`), so the HUD keeps its layout.

| Font                | Designer                                                                | Used for                                                                   | Files                           |
| ------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| **Cinzel**          | Natanael Gama (The Cinzel Project Authors)                              | the HUD's titles, names and section heads                                  | `public/fonts/cinzel/`          |
| **Alegreya**        | Juan Pablo del Peral, Huerta Tipográfica (The Alegreya Project Authors) | the HUD's text; the boards of the early ages (Hand & Fire, Metal, Machine) | `public/fonts/alegreya/`        |
| **Old Standard TT** | Alexey Kryukov (The Old Standard Project Authors)                       | the Steam Age boards                                                       | `public/fonts/old-standard-tt/` |
| **Courier Prime**   | Alan Dague-Greene (The Courier Prime Project Authors)                   | the Electric and Signal Age boards: their panels                           | `public/fonts/courier-prime/`   |
| **Cutive**          | Vernon Adams (The Cutive Project Authors; Reserved Font Name "Cutive")  | the Electric and Signal Age boards: the words on them                      | `public/fonts/cutive/`          |
| **VT323**           | Peter Hull (The VT323 Project Authors)                                  | the Electronic and Automated Age boards                                    | `public/fonts/vt323/`           |
| **Exo 2**           | Natanael Gama (The Exo 2 Project Authors)                               | the Space Age boards                                                       | `public/fonts/exo-2/`           |

## Sound — generated in code

Effects, wind, birds and crickets use the game's original Web Audio recipes. No recordings are
shipped or fetched. The removed Sonniss/Pixabay inventory remains in [Audio sources](AUDIO_SOURCES.md)
for creator/source history; its recordings are not cleared for redistribution in this repository.

## Made in code

The terrain, water, sky, weather and effects — and the minigames' boards — are generated in code.
