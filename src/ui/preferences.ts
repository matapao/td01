/** Optional preferences must still work for the current visit when browser storage is blocked. */
const session = new Map<string, string>();
const GUIDE_KEY = 'craftdef:guide';
export function guidePreference(): 'on' | 'off' | null {
  let value: string | null = session.get(GUIDE_KEY) ?? null;
  if (value === null)
    try {
      value = localStorage.getItem(GUIDE_KEY);
    } catch {
      /* Memory fallback. */
    }
  return value === 'on' || value === 'off' ? value : null;
}
export function setGuidePreference(value: 'on' | 'off'): void {
  session.set(GUIDE_KEY, value);
  try {
    localStorage.setItem(GUIDE_KEY, value);
  } catch {
    /* This visit keeps the choice. */
  }
}
