/** Small bridge: the icon studio offers a renderer; optional card preparation stays in its game chunk. */
type Renderer = () => Promise<string | null>;
let source: { render: Renderer | null; version: number } = { render: null, version: 0 };
export function provideCardArt(render: Renderer): void {
  source = { render, version: source.version + 1 };
}
export const cardArtSource = (): Readonly<typeof source> => source;
