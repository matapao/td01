/** Require an authored entry or established fixture without inventing a fallback value. */
export function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Required authored entry or fixture is missing');
  return value;
}
