export { IN_SCALE } from './room-builder.ts';
export type { KitPiece } from './room-builder.ts';
export type { Side } from './room-builder.ts';
export type { Piece } from './room-builder.ts';
export type { Fixture } from './room-builder.ts';
export type { Rect } from './room-builder.ts';
export type { Level } from './room-builder.ts';
export type { Ramp } from './room-builder.ts';
export type { InteriorDef } from './room-builder.ts';
import { U, RoomBuilder } from './room-builder.ts';
import type { Rect, InteriorDef } from './room-builder.ts';
/**
 * Building interiors. Some buildings are walked into: run at their door and you are inside, run
 * out of the room's doorway and you are back in the world — no key, no wait. Every room lives off
 * the map in the dark (like the mines), so it can be as big and as detailed as it needs to be, and
 * nothing of the world shows from inside.
 *
 * Rooms are built the way KayKit's own dungeon dioramas are: thick stone walls two storeys high with
 * their cap stones, timber-framed and barred and shelved walls, a balcony on stone foundations with
 * a balustrade and a stair up to it, floors of big stone tiles, planks and dirt, and the workshop
 * crowded along the walls — at the characters' own scale (a person is half a metre tall, a storey
 * 0.84 m). The wall between you and the camera is cut away, as in the dioramas.
 *
 * A room is plain data here — its pieces, where the floor is and how high, what is solid, where
 * the door and the workbench are — shared by the simulation (walking, levels, the door, the work)
 * and the view (drawing it). Each kind of building has its own row of rooms, so a point's room
 * (and the floor's height there) follows from the point alone.
 */
import type { BuildingKind } from './content-types.ts';
import type { Vec2 } from './path-resampling.ts';

/** Rooms lie west of here (the mines lie east of the map). */
export const INTERIOR_REGION_X = -1500;
/** Is a world point inside some building? */
export const indoors = (x: number): boolean => x < INTERIOR_REGION_X;

/** A wall piece's width, a big floor tile (4 units). */
export const TILE = 4 * U;
/** One storey: a wall's height. */
export const STOREY = 4 * U;

/**
 * The smithy behind the Anvil: a two-storey stone workshop. In through the door, the forge glows in
 * the far left corner with its chimney up the wall, the anvil stands before it with the hammer and
 * tongs, a quench bucket and the grindstone by; the long workbench runs along the left wall under
 * the weapon rack. A stone stair climbs the right wall to the loft across the back — planks on stone
 * foundations behind a balustrade — where the stock is kept: crates, barrels, the master's chest, a
 * cot. Banners and shelves up the walls, torches by the door, ingots in an open crate.
 */
export const SMITHY: InteriorDef = (() => {
  const r = new RoomBuilder(7, 6);
  // Units below: x −14…14 (inside −13.5…13.5), z −12 (back) … 12 (front, the door); a storey is 4.
  const W = 'wall' as const;
  const S = 'wall_scaffold' as const;
  r.walls([
    {
      back: [W, W, W, W, W, W, W],
      front: [W, 'wall_window_open_scaffold', S, 'wall_doorway', S, 'wall_window_open_scaffold', W],
      left: [W, 'wall_shelves', S, W, 'wall_cracked', W],
      right: [W, W, W, 'wall_arched', 'wall_shelves', W],
    },
    {
      back: [S, W, 'wall_window_closed_scaffold', W, S, 'wall_archedwindow_gated', W],
      front: [W, S, W, W, W, S, W],
      left: [W, S, W, 'wall_window_closed', S, W],
      right: [S, W, 'wall_window_closed', W, S, W],
    },
  ]);
  // Big stone tiles; trodden dirt by the forge.
  r.floor((i, j) => {
    if (j === 0 && i >= 2) return null; // under the loft
    if (i <= 1 && j <= 1) return 'floor_dirt_large';
    return 'floor_tile_large';
  });

  // The loft across the back: planks on stone foundations, x −6…13.5, z −11.5…−5, a storey up.
  for (let x = -5; x <= 7; x += 2)
    for (const y of [0, 2])
      r.add('dungeon', x === -5 ? 'floor_foundation_corner' : 'floor_foundation_front', x, -6.1, { y });
  for (const z of [-8.1, -10.1])
    for (const y of [0, 2]) r.add('dungeon', 'floor_foundation_front', -5.1, z, { y, rot: -Math.PI / 2 });
  for (let x = -5; x <= 13; x += 2)
    for (let z = -11; z <= -6; z += 2)
      r.add('dungeon', x === 3 && z === -9 ? 'floor_wood_small_dark' : 'floor_wood_small', x, z, { y: 4 });
  r.add('dungeon', 'floor_wood_small', -5, -5.4, { y: 3.96 });
  // Its balustrade round the open sides.
  r.add('dungeon', 'barrier_column', -4, -5.2, { y: 4 });
  r.add('dungeon', 'barrier', 0, -5.2, { y: 4 });
  r.add('dungeon', 'barrier_column', 4, -5.2, { y: 4 });
  r.add('dungeon', 'barrier_half', 6, -5.2, { y: 4 });
  r.add('dungeon', 'barrier', -5.8, -7.4, { y: 4, rot: Math.PI / 2 });
  r.add('dungeon', 'barrier_half', -5.8, -11.4, { y: 4, rot: Math.PI / 2 });
  r.level(-6, -11.5, 13.5, -5, 4);
  r.solid(-6.4, -5.45, 8.6, -4.95); // its edge, all but where the stair comes up
  r.solid(-6.4, -11.5, -5.4, -5);
  // The stair up the right wall: from the floor at z −1 to the loft at z −5.
  r.add('dungeon', 'stairs', 11, -5);
  r.ramp(9.1, -5, 13.5, -1, 'z', 4, 0);
  r.solid(8.4, -5, 9.1, -1.6);
  // Banners hang over the loft's edge.
  r.add('dungeon', 'banner_patternA_red', -1.6, -5.15, { y: 2.3, s: 0.75 });
  r.add('dungeon', 'banner_thin_red', 2.4, -5.15, { y: 2.3, s: 0.75 });

  // The forge in the far left corner: a stone hearth with its bed of coals, its hood and chimney.
  const hearth = { x0: -13.5 * U, z0: -11.5 * U, x1: -8 * U, z1: -7.6 * U, h: 2.2 * U, top: 8.6 * U };
  r.solid(-13.5, -11.5, -8, -7.6);
  r.add('resources', 'Fuel_A_Barrel', -7.1, -8.6, { rot: 0.3, s: 1.15 });
  // The anvil before it, hammer and tongs on it; the quench bucket and the grindstone by.
  r.add('tools', 'anvil', -7, -2.4, { rot: 0.15, s: 1.7, block: [1.5, 0.8] });
  r.add('tools', 'hammer', -6.3, -2.3, { y: 1.42, rot: 1.8, rx: Math.PI / 2, s: 0.85 });
  r.add('tools', 'tongs', -7.8, -2.6, { y: 1.42, rot: 0.5, rx: Math.PI / 2, s: 0.9 });
  r.add('tools', 'bucket_metal', -10.4, -5.6, { rot: 0.4, s: 0.75, block: [0.5, 0.5] });
  r.add('tools', 'grindstone', -11.8, 1.4, { rot: Math.PI / 2, s: 0.85, block: [1.1, 1] });
  // The workbench along the left wall, laid with tools, a stool before it; the weapon rack up the wall.
  r.add('dungeon', 'table_long', -12.3, 7, { block: [1, 2] });
  r.add('tools', 'wrench_A', -12.5, 5.6, { y: 1.05, rot: 0.2, rx: Math.PI / 2, s: 0.7 });
  r.add('tools', 'chisel', -12, 6.3, { y: 1.05, rot: 1.7, rx: Math.PI / 2, s: 0.7 });
  r.add('tools', 'mallet', -12.3, 8.6, { y: 1.05, rot: 0.3, rx: Math.PI / 2, s: 0.7 });
  r.add('dungeon', 'stool', -10.1, 6.2, { rot: 0.4 });
  r.add('medieval', 'weaponrack', -12.9, -1.2, { rot: Math.PI / 2, s: 8, block: [0.6, 0.9] });
  r.add('dungeon', 'sword_shield', -13.45, -3, { y: 6, rot: Math.PI / 2, sides: ['left'] });
  // Barrels in the front corners, crates by the door.
  r.add('dungeon', 'barrel_large', -11.9, 10.2, { block: [0.9, 0.9] });
  r.add('dungeon', 'barrel_small_stack', -9.2, 10.8, { rot: 0.1, block: [0.95, 0.55] });
  r.add('dungeon', 'barrel_small', 12.4, 10.4, { block: [0.5, 0.5] });
  r.add('dungeon', 'crates_stacked', 9.4, 10.2, { rot: 0.3, block: [1.1, 1.1] });
  // The ingots come in by the door: an open crate, and a stack beside it.
  r.add('medieval', 'crate_open', 4.4, 10, { rot: Math.PI, s: 6, block: [1, 0.7] });
  r.add('resources', 'Iron_Bars_Stack_Small', 6.4, 10.8, { rot: 0.6, s: 1.15, block: [0.5, 0.5] });
  // Along the right wall: a table with candles before the shelves, a chair, a chest in the alcove.
  r.add('dungeon', 'table_medium_decorated_A', 12.2, 5.6, { rot: -Math.PI / 2, block: [1, 1] });
  r.add('dungeon', 'chair', 10.4, 5.4, { rot: -Math.PI / 2 + 0.25 });
  r.add('dungeon', 'chest', 12.6, 1.8, { rot: -Math.PI / 2, block: [0.75, 0.85] });
  // Up the walls: a crest, a shield banner, candles on a shelf.
  r.add('dungeon', 'banner_shield_red', -14, 10, { y: 4, rot: Math.PI / 2, s: 0.85, sides: ['left'] });
  r.add('dungeon', 'shelf_small_candles', 13.5, -8, { y: 6.2, rot: -Math.PI / 2, sides: ['right'] });
  // The loft: the stock, the master's chest and his cot.
  r.add('dungeon', 'crates_stacked', -3.8, -10.3, { y: 4, rot: 0.2 });
  r.add('dungeon', 'barrel_large', -0.9, -10.4, { y: 4 });
  r.add('dungeon', 'barrel_small', 1.2, -10.8, { y: 4, rot: 0.8 });
  r.add('dungeon', 'chest_gold', 6.8, -10.6, { y: 4, rot: 0.1 });
  r.add('dungeon', 'coin_stack_medium', 4.8, -10.4, { y: 4 });
  r.add('dungeon', 'bed_floor', 11, -10.6, { y: 4, rot: Math.PI / 2 });
  r.add('dungeon', 'candle_lit', 8.6, -11, { y: 4 });
  r.solid(-4.9, -11.5, 1.8, -9.3);
  r.solid(5.8, -11.5, 7.8, -9.8);
  // A little clutter on the floor.
  r.add('dungeon', 'coin', 2.5, 4.6, { rot: 0.4 });
  r.add('dungeon', 'bottle_A_brown', 11.6, 8.2, { rot: 0.4 });
  r.add('dungeon', 'candle_triple', -11.7, 8.6, { y: 1 });
  return r.build({
    name: 'Smithy',
    door: { x: 0, hw: 1.3 * U },
    bench: { x: -7 * U, z: -0.2 * U, face: Math.PI },
    trays: {
      input: { x: 4.4 * U, y: 1.1 * U, z: 10 * U },
      output: { x: -12.3 * U, y: 1.02 * U, z: 7.2 * U },
    },
    hearth,
    fires: [{ x: -10.75 * U, y: 2.3 * U, z: -9.3 * U, size: 0.75 }],
    torches: [
      { x: -3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: 3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: -13.5 * U, y: 2.6 * U, z: 4 * U, rot: Math.PI / 2, side: 'left' },
      { x: 13.5 * U, y: 2.6 * U, z: 8 * U, rot: -Math.PI / 2, side: 'right' },
      { x: 2 * U, y: 6.6 * U, z: -11.5 * U, rot: 0, side: 'back' },
    ],
  });
})();

/**
 * The sawyer's shed behind the Sawmill: a tall timber shed. In through the door, the saw bench stands
 * across the middle with its big blade (it spins as the work goes), logs piled by the door and along
 * the left wall waiting for it, planks stacked high on the right; a workbench under the windows with
 * the plane, the file and a hand saw, sawdust on the floor by the bench.
 */
const SAWYER: InteriorDef = (() => {
  const r = new RoomBuilder(7, 6);
  // Units: x −14…14 (inside −13.5…13.5), z −12 (back) … 12 (front, the door).
  const W = 'wall' as const;
  const S = 'wall_scaffold' as const;
  r.walls([
    {
      back: [W, 'wall_window_open', W, 'wall_shelves', W, 'wall_window_open', W],
      front: [W, 'wall_window_open_scaffold', S, 'wall_doorway', S, 'wall_window_open_scaffold', W],
      left: [W, 'wall_window_open', S, W, 'wall_window_open', W],
      right: [W, 'wall_arched', W, 'wall_window_open', S, W],
    },
    {
      back: [S, 'wall_window_open_scaffold', S, S, S, 'wall_window_open_scaffold', S],
      front: [S, S, 'wall_window_closed_scaffold', S, 'wall_window_closed_scaffold', S, S],
      left: [S, 'wall_window_open_scaffold', S, S, 'wall_window_open_scaffold', S],
      right: [S, S, 'wall_window_open_scaffold', S, S, S],
    },
  ]);
  // Planks underfoot, trodden dirt where the logs come in and round the saw.
  r.floor((i, j) =>
    (j === 5 && i >= 1 && i <= 2) || (j === 2 && i >= 3 && i <= 4)
      ? 'floor_dirt_large'
      : (i + j) % 3
        ? 'floor_wood_large'
        : 'floor_wood_large_dark',
  );
  // The saw bench across the middle, its blade in a slot; a log on it, the hand saw by.
  r.add('dungeon', 'table_long', 0, -3, { rot: Math.PI / 2, s: 1.1, block: [2.3, 1.1] });
  // (The blade stands along the bench, the way the log is fed into it.)
  r.fixture('saw', 1.2, -3, { y: 1.1, s: 2.6, rot: Math.PI / 2 });
  r.add('resources', 'Wood_Log_A', -1.6, -3, { y: 1.05, rot: Math.PI / 2 + 0.05, s: 1.1 });
  r.add('tools', 'saw', -3.2, -2.4, { y: 1.12, rot: 0.3, rx: Math.PI / 2, s: 0.8 });
  // Logs waiting: by the door (the station's tray) and piled along the left wall.
  r.add('resources', 'Pallet_Wood', -7.6, 7.4, { rot: 0.1, s: 1.4, block: [1.1, 1.1] });
  r.add('medieval', 'resource_lumber', -11.4, -7.2, { rot: Math.PI / 2, s: 9, block: [1.6, 3.2] });
  r.add('medieval', 'resource_lumber', -11.6, 0.4, { rot: Math.PI / 2 + 0.1, s: 8, block: [1.5, 2.8] });
  r.add('resources', 'Wood_Log_A', -8.6, -9.6, { rot: 0.2, s: 1.1 });
  r.add('town', 'Wood_Log_B', -9.4, 3.8, { rot: 1.3, s: 1.1 });
  // Planks stacked high on the right, ready to go (the station's output shows on the near stack).
  r.add('town', 'Wood_Planks_Stack_Large', 11.2, -7.6, { rot: 0.05, s: 1.15, block: [1.1, 1.1] });
  r.add('town', 'Wood_Planks_Stack_Medium', 11.4, -3.6, { rot: -0.08, s: 1.15, block: [1.1, 1] });
  r.add('resources', 'Wood_Planks_Stack_Small', 7.2, -6.6, { rot: 1.5, s: 1.2, block: [1, 0.6] });
  r.add('town', 'Wood_Plank_B', 8.6, -9.8, { rot: 0.4, s: 1.2 });
  // The workbench under the right-hand windows: the plane, a file, a hammer; a stool before it.
  r.add('dungeon', 'table_long', 12.3, 5.4, { block: [1, 2] });
  r.add('town', 'handplane', 12.4, 4.2, { y: 1.05, rot: 0.4, s: 0.9 });
  r.add('town', 'file', 12, 6.2, { y: 1.05, rot: 1.7, rx: Math.PI / 2, s: 0.8 });
  r.add('tools', 'hammer', 12.5, 7, { y: 1.05, rot: 0.3, rx: Math.PI / 2, s: 0.75 });
  r.add('dungeon', 'stool', 10.2, 5, { rot: 0.4 });
  // A barrel, a crate, a lantern; a saw hung on the wall.
  r.add('dungeon', 'barrel_small', -12.4, 10.2, { block: [0.5, 0.5] });
  r.add('dungeon', 'crates_stacked', 11.6, 10, { rot: 0.3, block: [1.1, 1.1] });
  r.add('tools', 'lantern', 9.6, 9.2, { s: 0.8 });
  r.add('tools', 'saw', -13.45, 5, { y: 5.6, rot: Math.PI / 2, s: 1.1, sides: ['left'] });
  r.add('tools', 'rope_bundle_A', 13.45, -1, { y: 5.2, rot: -Math.PI / 2, s: 0.9, sides: ['right'] });
  return r.build({
    name: "Sawyer's Shed",
    door: { x: 0, hw: 1.3 * U },
    bench: { x: 0, z: -0.4 * U, face: Math.PI },
    trays: {
      input: { x: -7.6 * U, y: 0.45 * U, z: 7.4 * U },
      output: { x: 11.4 * U, y: 2.3 * U, z: -3.6 * U },
    },
    fires: [],
    torches: [
      { x: -3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: 3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: -13.5 * U, y: 2.6 * U, z: -4 * U, rot: Math.PI / 2, side: 'left' },
      { x: 13.5 * U, y: 2.6 * U, z: 1 * U, rot: -Math.PI / 2, side: 'right' },
      { x: 0, y: 2.8 * U, z: -11.5 * U, rot: 0, side: 'back' },
    ],
  });
})();

/**
 * The mason's workshop behind the Stonecutter: stone-flagged and dusty. The cutting bench stands in
 * the middle with a block on it and the chisel and mallet laid by; rough stone heaped by the door,
 * dressed blocks stacked on the right, the grindstone against the left wall, a column half carved,
 * and the master's bench of tools under the window.
 */
const MASON: InteriorDef = (() => {
  const r = new RoomBuilder(7, 5);
  // Units: x −14…14 (inside −13.5…13.5), z −10 (back) … 10 (front, the door).
  const W = 'wall' as const;
  r.walls([
    {
      back: [W, 'wall_shelves', W, W, W, 'wall_shelves', W],
      front: [W, 'wall_window_open', W, 'wall_doorway', W, 'wall_window_open', W],
      left: [W, 'wall_cracked', W, 'wall_window_open', W],
      right: [W, 'wall_window_open', W, 'wall_arched', W],
    },
    {
      back: [W, 'wall_window_closed', W, 'wall_archedwindow_gated', W, 'wall_window_closed', W],
      front: [W, W, 'wall_window_closed', W, 'wall_window_closed', W, W],
      left: [W, W, 'wall_window_closed', W, W],
      right: [W, 'wall_window_closed', W, W, W],
    },
  ]);
  // Flagstones, rubbly in the corners; stone dust round the bench.
  r.floor((i, j) =>
    (j === 2 && i >= 3 && i <= 3) || (j === 1 && i === 3)
      ? 'floor_dirt_large'
      : (i === 0 || i === 6) && j === 0
        ? 'floor_tile_large_rocks'
        : 'floor_tile_large',
  );
  // The cutting bench: a heavy table, a block on it, chisel and mallet.
  r.add('dungeon', 'table_medium', 0, -3.2, { s: 1.2, block: [1.3, 1.3] });
  r.add('resources', 'Stone_Bricks_Stack_Small', 0.2, -3.4, { y: 1.2, rot: 0.2, s: 1.5 });
  r.add('tools', 'chisel', -1.2, -2, { y: 1.22, rot: 1.2, rx: Math.PI / 2, s: 0.8 });
  r.add('tools', 'mallet', 1.6, -2.1, { y: 1.22, rot: 0.4, rx: Math.PI / 2, s: 0.8 });
  // Rough stone by the door (the station's tray), and a heap in the back corner.
  r.add('resources', 'Stone_Chunks_Small', -7.8, 6.6, { rot: 0.3, s: 1.6, block: [1.2, 0.9] });
  r.add('town', 'rocks', -10.4, 4.6, { rot: 1.1, s: 1, block: [1, 1] });
  r.add('dungeon', 'rubble_half', -13.3, -8.6, { rot: Math.PI / 2 + 0.2, s: 0.8, block: [1.9, 1.2] });
  r.add('town', 'rocks_small', -8.4, -8.4, { rot: 0.5 });
  // Dressed blocks stacked on the right (the output shows on the near stack); a pallet of bricks.
  r.add('town', 'Stone_Bricks_Stack_Large', 11, -6.6, { rot: 0.1, s: 1.15, block: [1, 1] });
  r.add('town', 'Stone_Bricks_Stack_Medium', 11.6, -2.4, { rot: -0.05, s: 1.15, block: [1, 0.9] });
  r.add('resources', 'Pallet_Wood', 7.8, -7.6, { s: 1.3, block: [1, 1] });
  r.add('resources', 'Stone_Brick', 7.6, -7.4, { y: 0.4, rot: 0.3, s: 1.3 });
  r.add('resources', 'Stone_Brick', 8.2, -7.9, { y: 0.4, rot: 1.6, s: 1.3 });
  // The grindstone against the left wall; a column half carved; a water bucket.
  r.add('tools', 'grindstone', -12, -2.4, { rot: Math.PI / 2, s: 0.9, block: [1.1, 1] });
  r.add('dungeon', 'column', 5, -7.8, { s: 1.6, block: [0.7, 0.7] });
  r.add('dungeon', 'pillar_decorated', -4.4, -8.6, { s: 0.8, block: [1, 0.8] });
  r.add('tools', 'bucket_metal', -9.6, -5.4, { rot: 0.3, s: 0.8, block: [0.45, 0.45] });
  // The master's bench of tools under the right-hand window; a stool.
  r.add('dungeon', 'table_long', 12.3, 5, { block: [1, 2] });
  r.add('town', 'trowel', 12.4, 3.8, { y: 1.05, rot: 0.4, rx: Math.PI / 2, s: 0.8 });
  r.add('tools', 'chisel', 12.1, 5.4, { y: 1.05, rot: 1.6, rx: Math.PI / 2, s: 0.7 });
  r.add('tools', 'compass_base', 12.5, 6.6, { y: 1.12, rot: 0.2, s: 0.8 });
  r.add('dungeon', 'stool', 10.2, 4.8, { rot: 0.3 });
  r.add('dungeon', 'barrel_small', 12.6, 8.6, { block: [0.5, 0.5] });
  r.add('tools', 'lantern', -12.6, 8.4, { s: 0.8 });
  return r.build({
    name: "Mason's Workshop",
    door: { x: 0, hw: 1.3 * U },
    bench: { x: 0, z: -0.6 * U, face: Math.PI },
    trays: {
      input: { x: -7.8 * U, y: 0.7 * U, z: 6.6 * U },
      output: { x: 11.6 * U, y: 1.6 * U, z: -2.4 * U },
    },
    fires: [],
    torches: [
      { x: -3.4 * U, y: 2.6 * U, z: 9.5 * U, rot: Math.PI, side: 'front' },
      { x: 3.4 * U, y: 2.6 * U, z: 9.5 * U, rot: Math.PI, side: 'front' },
      { x: -13.5 * U, y: 2.6 * U, z: 2 * U, rot: Math.PI / 2, side: 'left' },
      { x: 13.5 * U, y: 2.6 * U, z: 1 * U, rot: -Math.PI / 2, side: 'right' },
      { x: 0, y: 2.8 * U, z: -9.5 * U, rot: 0, side: 'back' },
    ],
  });
})();

/**
 * The forge house behind the Forge: a great stone hearth against the back wall, its coals glowing
 * under a hood, the chimney up through the roof; the bellows beside it (they pump while the metal
 * melts), the moulds before it where the iron runs; ore heaped by the door in a barrow, coal by the
 * hearth, ingots stacked on the right; the quench trough, fuel barrels, the tools on the wall.
 */
const FORGE_HOUSE: InteriorDef = (() => {
  const r = new RoomBuilder(7, 6);
  // Units: x −14…14 (inside −13.5…13.5), z −12 (back) … 12 (front, the door).
  const W = 'wall' as const;
  const S = 'wall_scaffold' as const;
  r.walls([
    {
      back: [W, W, W, W, W, W, W],
      front: [W, 'wall_window_open_scaffold', S, 'wall_doorway', S, 'wall_window_open_scaffold', W],
      left: [W, 'wall_shelves', W, 'wall_gated', W, W],
      right: [W, W, 'wall_arched', W, 'wall_shelves', W],
    },
    {
      back: [S, W, 'wall_window_closed_scaffold', W, 'wall_window_closed_scaffold', W, S],
      front: [W, S, W, W, W, S, W],
      left: [W, S, W, 'wall_window_closed', S, W],
      right: [S, W, 'wall_window_closed', W, S, W],
    },
  ]);
  r.floor((i, j) =>
    j <= 1 && i >= 2 && i <= 4
      ? 'floor_dirt_large'
      : j === 5 && i === 2
        ? 'floor_dirt_large'
        : 'floor_tile_large',
  );
  // The hearth in the middle of the back wall.
  const hearth = { x0: -4.6 * U, z0: -11.5 * U, x1: 4.6 * U, z1: -6.6 * U, h: 2.2 * U, top: 8.6 * U };
  r.solid(-4.6, -11.5, 4.6, -6.6);
  // The bellows beside it, the moulds before it (where you work the smelt).
  r.fixture('bellows', 6.4, -8.6, { rot: -Math.PI / 2, s: 3.2, block: [1.5, 1.3] });
  r.fixture('moulds', -2.8, -4.4, { s: 2.2, block: [1.4, 0.8] });
  // Coal by the hearth; fuel barrels; the quench trough.
  r.add('town', 'rocks_small', -6.4, -8.8, { rot: 0.4, s: 1.1 });
  r.add('town', 'rocks', -8.2, -10.2, { rot: 1.4, s: 0.9, block: [0.9, 0.9] });
  r.add('resources', 'Fuel_A_Barrel', 11.8, -9.6, { rot: 0.3, s: 1.15, block: [0.5, 0.5] });
  r.add('resources', 'Fuel_A_Barrel', 10.3, -10.6, { rot: 1.2, s: 1.15, block: [0.5, 0.5] });
  r.add('tools', 'bucket_metal', 4.8, -4.6, { rot: 0.4, s: 0.8, block: [0.45, 0.45] });
  r.add('town', 'trough', -9.8, -4.2, { rot: Math.PI / 2, s: 9, block: [1, 1] });
  // Ore by the door in a barrow (the station's tray), a heap of it beside.
  r.add('medieval', 'wheelbarrow', -8, 7.4, { rot: 0.6, s: 7.5, block: [1, 1.6] });
  r.add('town', 'Iron_Nuggets', -10.6, 9.6, { rot: 0.3, s: 1.4 });
  // Ingots stacked on the right (the output shows on the near stack), copper beside.
  r.add('town', 'Iron_Bars_Stack_Medium', 10.8, 4.4, { rot: 0.1, s: 1.2, block: [0.8, 0.8] });
  r.add('resources', 'Iron_Bars_Stack_Small', 11.8, 7.4, { rot: 0.5, s: 1.15, block: [0.5, 0.5] });
  r.add('town', 'Copper_Bars_Stack_Small', 9, 8.6, { rot: 1.2, s: 1.15, block: [0.5, 0.5] });
  // The anvil to the right, hammer and tongs on it; tools and a shield on the walls.
  r.add('tools', 'anvil', 7.4, -2.6, { rot: -0.2, s: 1.5, block: [1.3, 0.8] });
  r.add('tools', 'hammer', 7.9, -2.5, { y: 1.27, rot: 1.8, rx: Math.PI / 2, s: 0.8 });
  r.add('tools', 'tongs', 6.8, -2.8, { y: 1.27, rot: 0.5, rx: Math.PI / 2, s: 0.85 });
  r.add('medieval', 'weaponrack', -12.9, 1.6, { rot: Math.PI / 2, s: 8, block: [0.6, 0.9] });
  r.add('dungeon', 'sword_shield', 13.45, -6, { y: 6, rot: -Math.PI / 2, sides: ['right'] });
  r.add('dungeon', 'barrel_small_stack', 12.2, 10.8, { rot: 0.1, block: [0.95, 0.55] });
  r.add('dungeon', 'crates_stacked', -12.2, -6.6, { rot: 0.3, block: [1.1, 1.1] });
  return r.build({
    name: 'Forge House',
    door: { x: 0, hw: 1.3 * U },
    bench: { x: 0, z: -4.4 * U, face: Math.PI },
    trays: { input: { x: -8 * U, y: 1.15 * U, z: 7.2 * U }, output: { x: 10.8 * U, y: 1.9 * U, z: 4.4 * U } },
    hearth,
    fires: [{ x: 0, y: 2.3 * U, z: -9 * U, size: 1.05 }],
    torches: [
      { x: -3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: 3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: -13.5 * U, y: 2.6 * U, z: 6 * U, rot: Math.PI / 2, side: 'left' },
      { x: 13.5 * U, y: 2.6 * U, z: 0, rot: -Math.PI / 2, side: 'right' },
    ],
  });
})();

/**
 * The arcanist's study behind the Arcanist's Bench: a tall, dim room of books. The bench is a round
 * table in the middle with a crystal on it and a circle of runes turning over it as the core is
 * wired; bookcases along the walls, a potion station and a cauldron bubbling green, gems and candles,
 * a rug, an old chest by the door.
 */
const STUDY: InteriorDef = (() => {
  const r = new RoomBuilder(5, 6);
  // Units: x −10…10 (inside −9.5…9.5), z −12 (back) … 12 (front, the door).
  const W = 'wall' as const;
  r.walls([
    {
      back: [W, 'wall_shelves', 'wall_archedwindow_gated', 'wall_shelves', W],
      front: [W, 'wall_window_closed', 'wall_doorway', 'wall_window_closed', W],
      left: [W, 'wall_shelves', W, 'wall_window_open', 'wall_shelves', W],
      right: [W, 'wall_shelves', W, 'wall_arched', 'wall_shelves', W],
    },
    {
      back: [W, 'wall_archedwindow_open', W, 'wall_archedwindow_open', W],
      front: [W, W, 'wall_window_closed', W, W],
      left: [W, 'wall_archedwindow_open', W, W, 'wall_archedwindow_open', W],
      right: [W, W, 'wall_archedwindow_open', W, W, W],
    },
  ]);
  r.floor((i, j) => ((i + j) % 2 ? 'floor_wood_large_dark' : 'floor_wood_large'));
  r.add('town', 'rug_oval_B', 0, -1.4, { y: 0.06, rot: Math.PI / 2, s: 2 });
  // The bench: a round table, a crystal on it, the runes turning over it; a chair; books and candles.
  r.add('town', 'table_round_medium', 0, -4, { s: 1.25, block: [1.25, 1.3] });
  r.fixture('crystal', 0.2, -4.2, { y: 1.28, s: 1.6 });
  r.fixture('runes', 0, -4, { y: 2.6, s: 2.4 });
  r.add('tools', 'journal_open', -1.2, -3.2, { y: 1.3, rot: 0.5, rx: -0.2, s: 0.7 });
  r.add('dungeon', 'candle_triple', 1.2, -5, { y: 1.26, s: 0.9 });
  r.add('town', 'Gem_Medium', -0.9, -5, { y: 1.27, rot: 0.6, s: 1.1 });
  // Bookcases along the left wall; books stacked; an old chest by the door.
  r.add('town', 'bookcase_double', -9.2, -6.4, { rot: Math.PI / 2, s: 1.05, block: [0.35, 2.1] });
  r.add('town', 'bookcase_single_decoratedB', -9.2, 1.8, { rot: Math.PI / 2, s: 1.05, block: [0.35, 1.1] });
  r.add('town', 'book_brown', -7.6, -1.4, { rot: 0.4, s: 1.1 });
  r.add('town', 'book_grey', -7.4, -1.1, { y: 0.25, rot: 1.1, s: 1.1 });
  r.add('dungeon', 'chest', -7.2, 9.6, { rot: 0.1, block: [0.85, 0.75] });
  // The potion station along the right wall, mortar and pestle on it; the cauldron bubbling green.
  r.add('town', 'Potionstation', 8.4, -7, { rot: -Math.PI / 2, s: 1.05, block: [0.8, 1.3] });
  r.add('town', 'Mortar', 8.2, -5.6, { y: 1.55, rot: 0.3, s: 0.9 });
  r.add('town', 'Pestle', 8.4, -5.2, { y: 1.6, rot: 1.2, rx: 0.4, s: 0.9 });
  r.add('town', 'Cauldron', 6.2, 3.4, { rot: 0.4, s: 1.25, block: [0.8, 0.8] });
  // Gems and crystals on a side table by the door (the station's tray); the cores it makes go on the shelf.
  r.add('dungeon', 'table_small', -6.6, 6.4, { s: 1.2, block: [0.6, 0.6] });
  r.add('town', 'Gems_Pile_Small', -6.8, 6.2, { y: 1.22, s: 0.9 });
  r.add('dungeon', 'table_medium', 7.4, 8.6, { rot: 0.2, s: 1, block: [1, 1] });
  r.add('town', 'Cleric_Tome', 7.8, 8.2, { y: 1.02, rot: 0.6, s: 0.9 });
  r.fixture('crystal', -9, 9.6, { s: 1.4 });
  r.fixture('crystal', 9, -10.6, { s: 1.2 });
  r.add('dungeon', 'candle_lit', 6.8, 9.2, { y: 1 });
  r.add('dungeon', 'chair', 1.4, -1.6, { rot: 0.4 + Math.PI });
  r.add('dungeon', 'shelf_small_candles', 0, -11.5, { y: 6.2, sides: ['back'] });
  r.add('dungeon', 'banner_patternA_blue', -9.6, 6, { y: 3.6, rot: Math.PI / 2, s: 0.8, sides: ['left'] });
  return r.build({
    name: "Arcanist's Study",
    door: { x: 0, hw: 1.3 * U },
    bench: { x: 0, z: -1.2 * U, face: Math.PI },
    trays: {
      input: { x: -6.6 * U, y: 1.25 * U, z: 6.4 * U },
      output: { x: 7.4 * U, y: 1.05 * U, z: 8.6 * U },
    },
    fires: [],
    glows: [
      { x: 6.2 * U, y: 1.2 * U, z: 3.4 * U, color: '#7dff6a', r: 1.6 },
      { x: 0, y: 2 * U, z: -4 * U, color: '#a77bff', r: 2.2 },
    ],
    torches: [
      { x: -3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: 3.4 * U, y: 2.6 * U, z: 11.5 * U, rot: Math.PI, side: 'front' },
      { x: -9.5 * U, y: 2.6 * U, z: -2 * U, rot: Math.PI / 2, side: 'left' },
      { x: 9.5 * U, y: 2.6 * U, z: 0, rot: -Math.PI / 2, side: 'right' },
    ],
  });
})();

/** A single-storey starter workshop built entirely from the KayKit dungeon room pieces. */
const STARTER_WORKSHOP: InteriorDef = (() => {
  const r = new RoomBuilder(5, 4);
  r.walls([
    {
      back: ['wall_shelves', 'wall', 'wall', 'wall', 'wall_window_open'],
      front: ['wall', 'wall', 'wall_doorway', 'wall', 'wall'],
      left: ['wall', 'wall_scaffold', 'wall', 'wall'],
      right: ['wall', 'wall_window_open', 'wall', 'wall'],
    },
  ]);
  r.floor(() => 'floor_tile_large');
  r.add('dungeon', 'table_long', -3.7, -1, { block: [1, 2] });
  r.add('dungeon', 'crates_stacked', 3.8, -4, { block: [1, 1] });
  r.add('dungeon', 'barrel_large', -7, 5, { block: [0.8, 0.8] });
  r.add('tools', 'anvil', 0, -3, { s: 1.5, block: [1, 0.7] });
  r.solid(1, -4, 7, 2);
  return r.build({
    name: 'Workshop',
    door: { x: 0, hw: 0.3 },
    bench: { x: 4 * U, z: 4 * U, face: Math.PI },
    trays: { input: { x: -3.7 * U, y: 1.5 * U, z: 0 }, output: { x: -3.7 * U, y: 1.5 * U, z: -2 * U } },
    fires: [],
    torches: [],
  });
})();

/** A small shop counter and stocked shelves; no animated lighting or additional rooms. */
const SHOP: InteriorDef = (() => {
  const r = new RoomBuilder(4, 3);
  r.walls([
    {
      back: ['wall_shelves', 'wall', 'wall_shelves', 'wall'],
      front: ['wall', 'wall_doorway', 'wall', 'wall'],
      left: ['wall', 'wall_window_open', 'wall'],
      right: ['wall', 'wall_window_open', 'wall'],
    },
  ]);
  r.floor(() => 'floor_tile_large');
  // The doorway of an even-width room is offset one tile-half from its middle.
  r.add('dungeon', 'table_long', 0, -2.8, { rot: Math.PI / 2, block: [2.2, 0.9] });
  r.add('dungeon', 'crates_stacked', -6, -4, { block: [0.9, 0.9] });
  r.add('dungeon', 'barrel_large', 6, -4, { block: [0.8, 0.8] });
  r.add('tools', 'mallet', 0, -2.8, { y: 1.6, rx: Math.PI / 2 });
  return r.build({
    name: 'Shop',
    door: { x: 2 * U, hw: 0.3 },
    bench: { x: 0, z: -0.1, face: Math.PI },
    trays: { input: { x: -0.2, y: 1.5 * U, z: -2.8 * U }, output: { x: 0.2, y: 1.5 * U, z: -2.8 * U } },
    fires: [],
    torches: [],
  });
})();

/** The buildings you can walk into, and their rooms: every workshop is worked indoors. */
export const INTERIORS: Partial<Record<BuildingKind, InteriorDef>> = {
  shop: SHOP,
  anvil: STARTER_WORKSHOP,
  sawmill: SAWYER,
  stonecutter: MASON,
  forge: FORGE_HOUSE,
  arcanist: STUDY,
};

/** Each kind's row of rooms (z = its index × 1000), its rooms 200 m apart along it. */
const ROOM_KINDS: BuildingKind[] = ['anvil', 'sawmill', 'stonecutter', 'forge', 'arcanist', 'shop'];
const ROW = 1000;
const SPACING = 200;

/** Where room `slot` of a `kind` sits in the world (its floor's middle). */
export function interiorOrigin(kind: BuildingKind, slot: number): Vec2 {
  return { x: INTERIOR_REGION_X - 100 - slot * SPACING, z: Math.max(0, ROOM_KINDS.indexOf(kind)) * ROW };
}

/** The room a world point is in (or near), and the point in the room's frame. Needs no game state. */
export function roomFrameAt(
  x: number,
  z: number,
): { kind: BuildingKind; slot: number; def: InteriorDef; lx: number; lz: number } | null {
  if (!indoors(x)) return null;
  const k = Math.round(z / ROW);
  const kind = ROOM_KINDS[k];
  const def = kind && INTERIORS[kind];
  if (!def) return null;
  const slot = Math.max(0, Math.round((INTERIOR_REGION_X - 100 - x) / SPACING));
  const o = interiorOrigin(kind, slot);
  const lx = x - o.x;
  const lz = z - o.z;
  if (Math.abs(lx) > def.hx + 1.5 || Math.abs(lz) > def.hz + 1.5) return null;
  return { kind, slot, def, lx, lz };
}

const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** How high the floor is at a room point (its own frame): up the stair, on the loft, or the ground. */
export function floorIn(def: InteriorDef, x: number, z: number): number {
  for (const r of def.ramps) {
    if (!inRect(r, x, z)) continue;
    const t = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
    return r.ya + (r.yb - r.ya) * Math.min(1, Math.max(0, t));
  }
  for (const l of def.levels) if (inRect(l, x, z)) return l.y;
  return 0;
}

/** The floor's height under a world point indoors (0 outside any room). */
export function roomFloorAt(x: number, z: number): number {
  const r = roomFrameAt(x, z);
  return r ? floorIn(r.def, r.lx, r.lz) : 0;
}

/** Half the room's floor (m). */
export function roomHalf(def: InteriorDef): { hx: number; hz: number } {
  return { hx: def.hx, hz: def.hz };
}

/** A room point (its own frame) in the world. */
export function toWorld(kind: BuildingKind, slot: number, x: number, z: number): Vec2 {
  const o = interiorOrigin(kind, slot);
  return { x: o.x + x, z: o.z + z };
}

/** Where you come in: just inside the door, facing into the room. */
export function entryPoint(def: InteriorDef): { x: number; z: number; face: number } {
  return { x: def.door.x, z: def.hz - 0.3, face: Math.PI };
}

/** Is (x, z) — in the room's own frame — open floor? The doorway is, out to the wall's outer face. */
export function roomOpen(def: InteriorDef, x: number, z: number, pad = 0.08): boolean {
  if (z > def.hz - pad && Math.abs(x - def.door.x) < def.door.hw - pad && z < def.hz + TILE * 0.125 + 0.12)
    return true;
  if (Math.abs(x) > def.hx - pad || Math.abs(z) > def.hz - pad) return false;
  for (const s of def.solids)
    if (x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad) return false;
  return true;
}
