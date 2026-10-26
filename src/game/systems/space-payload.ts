/** Complete the existing pad lifecycle without depending on launch commands. */
import type { Building } from '../entity-types.ts';
import type { PayloadId } from '../space-types.ts';

/** The Port's payload is assembled: it stands ready on the pad. */
export function payloadStacked(b: Building, payload: PayloadId): void {
  b.ready = payload;
}
