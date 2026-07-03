// rows/query — laziness / short-circuit / key-pushdown / single-use are observed on
// rows() over a FAKE AttachmentGetting whose get() carries a counter (no real database
// needed). The CommitState-only contract of query() is pinned separately: a real
// CommitState is accepted, everything else (a mutable source, a look-alike fake, a
// non-source) is rejected by `instanceof CommitState` — because CommitState is the sole
// type carrying the immutability the query is sound over.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { query, rows } from '../src/source.mjs';
import dsviper from '@digitalsubstrate/dsviper';

const { CommitState, Definitions } = dsviper;

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

const fiveGetting = () => new FakeGetting([
    ['k0', { v: 0 }], ['k1', { v: 1 }], ['k2', { v: 2 }], ['k3', { v: 3 }], ['k4', { v: 4 }],
]);

describe('rows over a frozen AttachmentGetting (the query engine)', () => {
    it('yields [key, document] pairs and skips nil documents', () => {
        const ag = new FakeGetting([['a', { v: 1 }], ['b', null], ['c', { v: 3 }]]);
        assert.deepEqual(Iterator.from(rows(ag, null)).toArray(), [['a', { v: 1 }], ['c', { v: 3 }]]);
        assert.equal(ag.getCalls, 3);
    });

    it('stays lazy — take(2) pulls only two documents', () => {
        const ag = fiveGetting();
        assert.equal(Iterator.from(rows(ag, null)).take(2).toArray().length, 2);
        assert.equal(ag.getCalls, 2);
    });

    it('short-circuits — find stops at the first match', () => {
        const ag = fiveGetting();
        assert.deepEqual(Iterator.from(rows(ag, null)).find(([, d]) => d.v === 2), ['k2', { v: 2 }]);
        assert.equal(ag.getCalls, 3);
    });

    it('key-pushdown — keyPred rejects keys before get()', () => {
        const ag = fiveGetting();
        const out = Iterator.from(rows(ag, null, { keyPred: (k) => k === 'k3' })).toArray();
        assert.equal(out.length, 1);
        assert.equal(ag.getCalls, 1);
    });

    it('single-use — a consumed generator does not restart', () => {
        const it = Iterator.from(rows(fiveGetting(), null));
        assert.equal(it.toArray().length, 5);
        assert.equal(it.toArray().length, 0);
    });
});

describe('query — the CommitState-only guard', () => {
    it('accepts an immutable CommitState', () => {
        const cs = new CommitState(new Definitions().const());
        assert.doesNotThrow(() => query(cs, null));
    });

    it('rejects a mutable / look-alike source (not a CommitState)', () => {
        const lookAlike = { attachmentGetting() { return new FakeGetting([]); }, commitId() { return 'c1'; } };
        assert.throws(() => query(lookAlike, null), /immutable CommitState/);
    });

    it('rejects a non-source value', () => {
        assert.throws(() => query(null, null), /immutable CommitState/);
        assert.throws(() => query({}, null), /immutable CommitState/);
    });
});
