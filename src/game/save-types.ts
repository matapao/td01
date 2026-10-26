/** Versioned, platform-independent save envelope. */
export interface SaveData {
  v: number;
  /** Random generator state. */
  rng: number;
  /** GameState as JSON-safe data. */
  state: Record<string, unknown>;
}
