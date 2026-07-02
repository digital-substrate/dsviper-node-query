// The verbs — pure unit over native scalars / plain objects (canonicalKey tags natives,
// compareKeys falls to native < >). Real wrapped values via hashKey/.compare() are in
// integration.test.mjs; here we pin the verb LOGIC without the binding.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { distinct, orderBy, groupBy, join, union, intersect, except, toMap } from '../src/verbs.mjs';

describe('distinct', () => {
    it('removes value-equal duplicates', () => {
        assert.deepEqual(distinct([1, 1, 2, 2, 3]).toArray(), [1, 2, 3]);
    });
    it('stays lazy — a downstream take stops once n distinct seen', () => {
        let pulls = 0;
        function* src() { for (const x of [1, 1, 2, 2, 3]) { pulls++; yield x; } }
        const first2 = distinct(src()).take(2).toArray();
        assert.deepEqual(first2, [1, 2]);
        assert.equal(pulls, 3);
    });
});

describe('orderBy', () => {
    it('orders by the item (native comparison)', () => {
        assert.deepEqual(orderBy([3, 1, 2]).slice(), [1, 2, 3]);
    });
    it('orders by a selector, then by a second (thenBy)', () => {
        const rows = [{ a: 1, b: 2 }, { a: 1, b: 1 }, { a: 0, b: 9 }];
        const out = orderBy(rows, (r) => r.a, (r) => r.b);
        assert.deepEqual(out, [{ a: 0, b: 9 }, { a: 1, b: 1 }, { a: 1, b: 2 }]);
    });
    it('uses .compare() when the key is a wrapped value', () => {
        const wrap = (n) => ({ compare: (o) => n - o._n, _n: n });
        const out = orderBy([wrap(3), wrap(1), wrap(2)], (x) => x).map((x) => x._n);
        assert.deepEqual(out, [1, 2, 3]);
    });
});

describe('groupBy', () => {
    it('buckets by canonical key of the selector', () => {
        const groups = groupBy([1, 2, 3, 4], (n) => n % 2);
        assert.equal(groups.size, 2);
        assert.deepEqual(groups.get('num:1'), [1, 3]);
        assert.deepEqual(groups.get('num:0'), [2, 4]);
    });
});

describe('join', () => {
    it('inner-joins on a key', () => {
        const left = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }];
        const right = [{ id: 1, t: 'x' }, { id: 1, t: 'y' }, { id: 3, t: 'z' }];
        const out = join(left, right, (l) => l.id, (r) => r.id, (l, r) => `${l.n}${r.t}`).toArray();
        assert.deepEqual(out, ['ax', 'ay']);
    });
});

describe('set operations (by value)', () => {
    it('union — distinct across both', () => {
        assert.deepEqual(union([1, 2], [2, 3]).toArray(), [1, 2, 3]);
    });
    it('intersect — in both', () => {
        assert.deepEqual(intersect([1, 2, 3], [2, 3, 4]).toArray(), [2, 3]);
    });
    it('except — in a, not in b', () => {
        assert.deepEqual(except([1, 2, 3], [2]).toArray(), [1, 3]);
    });
});

describe('toMap', () => {
    it('keys a native Map on the canonical token', () => {
        const m = toMap([{ k: 'a', v: 1 }, { k: 'b', v: 2 }], (x) => x.k, (x) => x.v);
        assert.equal(m.get('str:a'), 1);
        assert.equal(m.get('str:b'), 2);
    });
});
