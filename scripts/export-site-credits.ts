/** Export the game's complete current creator credits; historical recordings stay metadata-only. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { creditsHtml } from '../src/ui/credits.ts';
const directory = new URL('../docs/site/td01/', import.meta.url);
mkdirSync(directory, { recursive: true });
const body = creditsHtml()
  .replace('<summary>Credits</summary>', '')
  .replaceAll('<h4>', '<h2>')
  .replaceAll('</h4>', '</h2>')
  .replace(
    'href="./sound-credits.html"',
    'href="https://github.com/matapao/td01/blob/main/docs/AUDIO_SOURCES.md"',
  );
writeFileSync(
  new URL('credits.html', directory),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TD01 credits</title><style>body{max-width:70ch;margin:3rem auto;padding:0 1.5rem;background:#211b38;color:#f2efe7;font:16px/1.65 system-ui}a{color:#f2cb84}h2{margin-top:2rem}p{overflow-wrap:anywhere}</style><h1>TD01 credits</h1><p>Code: MIT. Third-party assets retain their own licences. Directed by <a href="https://github.com/bestrand">bestrand</a>.</p><h2>Engine</h2><p>three.js by the three.js authors, MIT.</p>${body}</html>\n`,
);
console.log('Exported current TD01 credits.');
