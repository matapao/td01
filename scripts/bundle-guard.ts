/** Verify emitted chunks rather than relying on source imports or hiding Vite's size warning. */
import type { Plugin } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';

const MAX_CHUNK_BYTES = 1_500_000;
// Discover factory modules so a new kind automatically joins the emitted-graph contract.
const directory = new URL('../src/ui/minigames/', import.meta.url);
const implementations = readdirSync(directory)
  .filter(
    (file) =>
      file.endsWith('.ts') &&
      /export const \w+: MinigameDef</.test(readFileSync(new URL(file, directory), 'utf8')),
  )
  .map((file) => `src/ui/minigames/${file}`);
export function bundleGuard(): Plugin {
  return {
    name: 'td01-bundle-contract',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const chunks = Object.fromEntries(
          Object.values(bundle)
            .filter((chunk) => chunk.type === 'chunk')
            .map((chunk) => [
              chunk.fileName,
              {
                bytes: Buffer.byteLength(chunk.code),
                modules: Object.keys(chunk.modules).map((id) =>
                  id.replaceAll('\\', '/').replace(`${this.environment.config.root}/`, ''),
                ),
                imports: chunk.imports,
                dynamicImports: chunk.dynamicImports,
                isEntry: chunk.isEntry,
              },
            ]),
        );
        const closure = (entries: string[]): Set<string> => {
          const seen = new Set<string>();
          const visit = (file: string) => {
            const chunk = chunks[file];
            if (seen.has(file) || !chunk) return;
            seen.add(file);
            chunk.imports.forEach(visit);
          };
          entries.forEach(visit);
          return seen;
        };
        // Entries are read from this immutable chunk map; closure only contains existing keys.
        const startup = closure(Object.keys(chunks).filter((file) => chunks[file]!.isEntry));
        const startupModules = new Set([...startup].flatMap((file) => chunks[file]!.modules));
        // A missing composition root must not pass as an unusually small optimization.
        for (const source of [
          'src/main.ts',
          'src/view/game.ts',
          'src/view/input.ts',
          'src/ui/hud.ts',
          'src/game/sim.ts',
        ])
          if (!startupModules.has(source)) this.error(`Startup is missing required game module ${source}`);
        const emittedModules = new Set(Object.values(chunks).flatMap((chunk) => chunk.modules));
        for (const source of implementations)
          if (!emittedModules.has(source)) this.error(`The build is missing the deferred minigame ${source}`);
        for (const source of startupModules)
          if (source.startsWith('src/ui/minigames/') && source !== 'src/ui/minigames/catalogue.ts')
            this.error(`${source} was pulled into village startup; keep minigame code deferred`);
        for (const source of [
          ...implementations,
          'src/ui/minigames/index.ts',
          'src/ui/minigames/load.ts',
          'src/ui/road-window.ts',
          'src/view/spaceview.ts',
        ])
          if (startupModules.has(source))
            this.error(`${source} was pulled into startup; keep its on-demand import boundary`);
        for (const [file, chunk] of Object.entries(chunks)) {
          if (chunk.bytes > MAX_CHUNK_BYTES)
            this.error(`${file}: ${chunk.bytes} bytes exceeds the existing 1.5 MB chunk budget`);
          const own = implementations.filter((source) => chunk.modules.includes(source));
          if (!own.length) continue;
          const loaded = [...closure([file])]
            .flatMap((name) => chunks[name]!.modules)
            .filter((source) => implementations.includes(source));
          if (new Set(loaded).size !== 1)
            this.error(`${file}: playing one minigame would also load other kinds`);
        }
        const startupBytes = [...startup].reduce((sum, file) => sum + chunks[file]!.bytes, 0);
        if (startupBytes > MAX_CHUNK_BYTES)
          this.error(`Startup JavaScript exceeds 1.5 MB across its initial chunks`);
        this.emitFile({
          type: 'asset',
          fileName: '.vite/bundle-report.json',
          source: JSON.stringify({ startupBytes, chunks }, null, 2),
        });
        this.info(
          `Verified startup: ${(startupBytes / 1000).toFixed(1)} kB; each minigame and later-era screen stays deferred`,
        );
      },
    },
  };
}
