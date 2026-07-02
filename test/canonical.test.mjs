// canonicalKey — pure unit (no binding): a fake exposes hashKey(); native scalars are
// type-tagged. Real wrapped values are covered in integration.test.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalKey } from '../src/canonical.mjs';

describe('canonicalKey', () => {
    it('delegates to hashKey() for a wrapped value (duck-typed)', () => {
        assert.equal(canonicalKey({ hashKey: () => 42n }), 42n);
    });

    it('type-tags native scalars so 1, 1n and "1" never collide', () => {
        assert.equal(canonicalKey(1), 'num:1');
        assert.equal(canonicalKey(1n), 'big:1');
        assert.equal(canonicalKey('1'), 'str:1');
        assert.equal(canonicalKey(true), 'bool:true');
        assert.notEqual(canonicalKey(1), canonicalKey('1'));
        assert.notEqual(canonicalKey(1), canonicalKey(1n));
    });

    it('maps null and undefined to a single nil token', () => {
        assert.equal(canonicalKey(null), 'nil');
        assert.equal(canonicalKey(undefined), 'nil');
    });
});
