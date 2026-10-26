import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidePreference, setGuidePreference } from '../src/ui/preferences.ts';

test('preferences', async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw Error('storage disabled');
    },
  });
  assert.equal(guidePreference(), null);
  setGuidePreference('off');
  assert.equal(guidePreference(), 'off');
  setGuidePreference('on');
  assert.equal(guidePreference(), 'on');
  console.log('PASS: walkthrough choice works for the visit even when browser storage is unavailable');
});
