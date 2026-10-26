// Saved games: the whole simulation as JSON under a short code, so a team can pause and pick the
// game up later exactly where it was. Postgres when DATABASE_URL is set (a jsonb row per save),
// otherwise JSON files in ./saves — a LAN party doesn't need a database running.

import { mkdir, readdir, readFile, stat, writeFile, link, unlink } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { SaveData } from '../src/game/save.ts';
import { assertSaveData } from '../src/game/save-format.ts';

export interface SavedGame {
  save: SaveData;
  /** Who played which hero, so everyone gets theirs back. */
  players: { token: string; name: string; color: string; hero: number }[];
}

export interface SaveStore {
  kind: 'postgres' | 'files';
  save(game: SavedGame): Promise<string>;
  load(code: string): Promise<SavedGame | null>;
  list(): Promise<{ code: string; at: string; wave: number }[]>;
  close?(): Promise<void>;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export const cleanCode = (code: unknown): string | null =>
  typeof code === 'string' && /^[A-Z2-9]{6}$/.test(code.trim().toUpperCase())
    ? code.trim().toUpperCase()
    : null;

const waveOf = (g: SavedGame) => Number((g.save.state as { wave?: number }).wave ?? 0);

function storedGame(value: unknown): SavedGame | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as SavedGame;
  try {
    assertSaveData(v.save);
    if (
      !Array.isArray(v.players) ||
      v.players.some(
        (p) =>
          !p ||
          typeof p.token !== 'string' ||
          !/^[0-9a-f]{8,64}$/.test(p.token) ||
          typeof p.name !== 'string' ||
          typeof p.color !== 'string' ||
          !Number.isSafeInteger(p.hero),
      )
    )
      return null;
    return v;
  } catch {
    return null;
  }
}

export async function openSaves(root: string, url = process.env['DATABASE_URL']): Promise<SaveStore> {
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: 3 });
    try {
      await pool.query(`create table if not exists browserdefense_saves (
      code text primary key,
      created_at timestamptz not null default now(),
      wave integer not null default 0,
      data jsonb not null
    )`);
      // Saves made before the game was renamed (CraftDef) come along.
      const old = await pool.query(`select to_regclass('craftdef_saves') as t`);
      if (old.rows[0]?.t)
        await pool.query(
          'insert into browserdefense_saves select code, created_at, wave, data from craftdef_saves on conflict do nothing',
        );
    } catch (error) {
      await pool.end();
      throw error;
    }
    return {
      kind: 'postgres',
      close: () => pool.end(),
      async save(game) {
        for (;;) {
          const code = newCode();
          const r = await pool.query(
            'insert into browserdefense_saves (code, wave, data) values ($1, $2, $3) on conflict do nothing',
            [code, waveOf(game), game],
          );
          if (r.rowCount) return code;
        }
      },
      async load(code) {
        if (!cleanCode(code)) return null;
        code = cleanCode(code)!;
        const r = await pool.query('select data from browserdefense_saves where code = $1', [code]);
        return storedGame(r.rows[0]?.data);
      },
      async list() {
        const r = await pool.query(
          'select code, created_at, wave from browserdefense_saves order by created_at desc limit 20',
        );
        return r.rows.map((row) => ({
          code: row.code as string,
          at: new Date(row.created_at as string).toISOString(),
          wave: row.wave as number,
        }));
      },
    };
  }
  const dir = join(root, 'saves');
  await mkdir(dir, { recursive: true });
  return {
    kind: 'files',
    async save(game) {
      const temp = join(dir, `.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, JSON.stringify(game), { flag: 'wx', mode: 0o600 });
        for (;;) {
          const code = newCode();
          try {
            await link(temp, join(dir, `${code}.json`));
            return code;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          }
        }
      } finally {
        await unlink(temp).catch(() => {});
      }
    },
    async load(code) {
      const clean = cleanCode(code);
      if (!clean) return null;
      const body = await readFile(join(dir, `${clean}.json`), 'utf8').catch(() => null);
      try {
        return body ? storedGame(JSON.parse(body)) : null;
      } catch {
        return null;
      }
    },
    async list() {
      const out: { code: string; at: string; wave: number }[] = [];
      for (const f of await readdir(dir).catch(() => [])) {
        if (!f.endsWith('.json') || !cleanCode(f.slice(0, -5))) continue;
        try {
          const st = await stat(join(dir, f));
          const g = JSON.parse(await readFile(join(dir, f), 'utf8')) as SavedGame;
          if (storedGame(g)) out.push({ code: f.slice(0, -5), at: st.mtime.toISOString(), wave: waveOf(g) });
        } catch {
          /* A damaged or concurrently removed save must not hide the other saves. */
        }
      }
      return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
    },
  };
}
