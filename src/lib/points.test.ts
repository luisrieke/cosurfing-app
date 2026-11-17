/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { POINTS, reviewPoints, reviewReward } from './points.ts';

describe('reviewPoints', () => {
  it('matches public.review_points()', () => {
    assert.equal(reviewPoints(null), 3);
    assert.equal(reviewPoints('   '), 3);
    assert.equal(reviewPoints('Good wifi.'), 10);
    assert.equal(reviewPoints('x'.repeat(199)), 10);
    assert.equal(reviewPoints('x'.repeat(200)), 20);
  });

  it('adds the first review bonus', () => {
    assert.equal(reviewPoints('', true), 8);
    assert.equal(reviewPoints('Nice place.', true), 15);
  });
});

describe('reviewReward', () => {
  it('stars only', () => {
    assert.deepEqual(reviewReward({ body: '', first: false }), { lines: [{ key: 'rating', points: 3 }], total: 3 });
  });

  it('adds up to the same total as reviewPoints plus extras', () => {
    const body = 'x'.repeat(POINTS.longTextChars);
    const r = reviewReward({ body, first: true, photos: 2, facts: 3 });
    assert.deepEqual(
      r.lines.map((l) => l.key),
      ['rating', 'text', 'longText', 'first', 'photos', 'facts'],
    );
    assert.equal(r.total, reviewPoints(body, true) + 2 * POINTS.photo + 3 * POINTS.fact);
  });
});
