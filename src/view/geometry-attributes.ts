import type { BufferGeometry, BufferAttribute, InterleavedBufferAttribute } from 'three';

/** Imported or generated meshes must provide the attributes consumed by their painter. */
export function geometryAttribute(
  geometry: BufferGeometry,
  name: string,
): BufferAttribute | InterleavedBufferAttribute {
  const attribute = geometry.attributes[name];
  if (!attribute) throw new Error(`Geometry is missing its ${name} attribute`);
  return attribute;
}
