// query — pure unit over a fake CommitState (attachmentGetting() + commitId()) whose
// AttachmentGetting carries a get() counter, so laziness / short-circuit / key-pushdown
// / single-use are observable without a real database. The CommitState-only contract is
// pinned by the guard test (a mutable-shaped source is rejected).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/source.mjs';

class Optional {
    constructor(v) { this._v = v; }
    isNil() { return this._v === null || this._v === undefined; }
    unwrap() { return this._v; }
}

class FakeGetting {
    constructor(pairs) { this._pairs = pairs; this.getCalls = 0; }
    keys() { return this._pairs.map(([k]) => k).values(); }
    get(_attachment, key) {
        this.getCalls++;
        const found = this._pairs.find(([k]) => k === key);
        return new Optional(found ? found[1] : null);
    }
}

// A frozen CommitState: a read surface + a commitId (the immutable marker).
const state = (pairs) => {
    const ag = new FakeGetting(pairs);
    return { _ag: ag, attachmentGetting() { return ag; }, commitId() { return 'c1'; } };
};

const FIVE = () => state([
    ['k0', { v: 0 }], ['k1', { v: 1 }], ['k2', { v: 2 }], ['k3', { v: 3 }], ['k4', { v: 4 }],
]);

describe('query over a CommitState', () => {
    it('yields [key, document] pairs and skips nil documents', () => {
        const s = state([['a', { v: 1 }], ['b', null], ['c', { v: 3 }]]);
        assert.deepEqual(query(s, null).toArray(), [['a', { v: 1 }], ['c', { v: 3 }]]);
        assert.equal(s._ag.getCalls, 3);
    });

    it('stays lazy — take(2) pulls only two documents', () => {
        const s = FIVE();
        assert.equal(query(s, null).take(2).toArray().length, 2);
        assert.equal(s._ag.getCalls, 2);
    });

    it('short-circuits — find stops at the first match', () => {
        const s = FIVE();
        assert.deepEqual(query(s, null).find(([, d]) => d.v === 2), ['k2', { v: 2 }]);
        assert.equal(s._ag.getCalls, 3);
    });

    it('key-pushdown — keyPred rejects keys before get()', () => {
        const s = FIVE();
        const out = query(s, null, { keyPred: (k) => k === 'k3' }).toArray();
        assert.equal(out.length, 1);
        assert.equal(s._ag.getCalls, 1);
    });

    it('single-use — a consumed query does not restart', () => {
        const it = query(FIVE(), null);
        assert.equal(it.toArray().length, 5);
        assert.equal(it.toArray().length, 0);
    });
});

describe('query contract — CommitState only', () => {
    it('rejects a mutable-shaped source (no commitId)', () => {
        const mutable = { attachmentGetting() { return new FakeGetting([]); }, attachmentMutating() {} };
        assert.throws(() => query(mutable, null), /immutable CommitState/);
    });

    it('rejects a non-source value', () => {
        assert.throws(() => query(null, null), /immutable CommitState/);
        assert.throws(() => query({}, null), /immutable CommitState/);
    });
});
