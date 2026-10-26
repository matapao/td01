/** Minimal typed event emitter. */
export class Emitter<M extends object> {
  private handlers = new Map<keyof M, Set<(e: never) => void>>();

  on<K extends keyof M>(type: K, fn: (e: M[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as (e: never) => void);
    return () => set!.delete(fn as (e: never) => void);
  }

  emit<K extends keyof M>(type: K, e: M[K]): void {
    const set = this.handlers.get(type);
    if (set) for (const fn of set) (fn as (e: M[K]) => void)(e);
  }

  clear(): void {
    this.handlers.clear();
  }
}
