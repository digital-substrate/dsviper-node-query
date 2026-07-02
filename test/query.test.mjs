// Query / from — the fluent wrapper, pure unit. Chains the verbs and native iterator
// helpers over plain data; laziness and single-use are pinned here. Real wrapped
// documents flow through the same chain in integration.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { from, Query } from '../src/query.mjs';

const people = [
    { name: 'ada', dept: 'eng', age: 36 },
    { name: 'bes', dept: 'eng', age: 28 },
    { name: 'cyd', dept: 'ops', age: 41 },
    { name: 'dot', dept: 'ops', age: 33 },
];

describe('from — construction', () => {
    it('wraps any iterable into a Query', () => {
        assert.ok(from([1, 2, 3]) instanceof Query);
    });
    it('is iterable', () => {
        assert.deepEqual([...from([1, 2, 3])], [1, 2, 3]);
    });
});

describe('Query — lazy spine', () => {
    it('where accepts a predicate function', () => {
        assert.deepEqual(from(people).where((p) => p.age > 33).map((p) => p.name).toArray(), ['ada', 'cyd']);
    });
    it('where accepts a Mongo-like spec', () => {
        assert.deepEqual(from(people).where({ dept: 'eng' }).map((p) => p.name).toArray(), ['ada', 'bes']);
    });
    it('map / take / drop chain', () => {
        assert.deepEqual(from([1, 2, 3, 4, 5]).map((n) => n * 2).drop(1).take(2).toArray(), [4, 6]);
    });
    it('stays lazy — take pulls only what it needs', () => {
        let pulls = 0;
        function* src() { for (const n of [1, 2, 3, 4, 5]) { pulls++; yield n; } }
        const out = from(src()).map((n) => n * 10).take(2).toArray();
        assert.deepEqual(out, [10, 20]);
        assert.equal(pulls, 2);
    });
    it('tap observes without altering the stream', () => {
        const seen = [];
        const out = from([1, 2]).tap((n) => seen.push(n)).toArray();
        assert.deepEqual(out, [1, 2]);
        assert.deepEqual(seen, [1, 2]);
    });
});

describe('Query — [key, doc] pair helpers', () => {
    const rows = [['k1', { v: 1 }], ['k2', { v: 2 }]];
    it('keys() projects the key half', () => {
        assert.deepEqual(from(rows).keys().toArray(), ['k1', 'k2']);
    });
    it('values() projects the doc half', () => {
        assert.deepEqual(from(rows).values().toArray(), [{ v: 1 }, { v: 2 }]);
    });
    it('values().where(spec) filters documents', () => {
        assert.deepEqual(from(rows).values().where({ v: { $gt: 1 } }).toArray(), [{ v: 2 }]);
    });
});

describe('Query — stateful verbs chain', () => {
    it('distinct then orderBy then take', () => {
        assert.deepEqual(from([3, 1, 2, 1, 3]).distinct().orderBy().take(2).toArray(), [1, 2]);
    });
    it('orderBy by selectors (thenBy)', () => {
        const out = from(people).orderBy((p) => p.dept, (p) => p.age).map((p) => p.name).toArray();
        assert.deepEqual(out, ['bes', 'ada', 'dot', 'cyd']);
    });
    it('groupBy is terminal, returns a Map', () => {
        const groups = from(people).groupBy((p) => p.dept);
        assert.deepEqual(groups.get('str:eng').map((p) => p.name), ['ada', 'bes']);
        assert.deepEqual(groups.get('str:ops').map((p) => p.name), ['cyd', 'dot']);
    });
    it('set ops chain by value', () => {
        assert.deepEqual(from([1, 2, 3]).intersect([2, 3, 4]).toArray(), [2, 3]);
        assert.deepEqual(from([1, 2, 3]).except([2]).toArray(), [1, 3]);
        assert.deepEqual(from([1, 2]).union([2, 3]).toArray(), [1, 2, 3]);
    });
    it('join streams matches', () => {
        const orders = [{ user: 'ada', item: 'x' }, { user: 'cyd', item: 'y' }];
        const out = from(people)
            .join(orders, (p) => p.name, (o) => o.user, (p, o) => `${p.name}:${o.item}`)
            .toArray();
        assert.deepEqual(out, ['ada:x', 'cyd:y']);
    });
});

describe('Query — terminals', () => {
    it('first / find', () => {
        assert.equal(from(people).first().name, 'ada');
        assert.equal(from(people).find((p) => p.dept === 'ops').name, 'cyd');
        assert.equal(from([]).first(), undefined);
    });
    it('count', () => {
        assert.equal(from(people).where({ dept: 'eng' }).count(), 2);
    });
    it('reduce with and without seed', () => {
        assert.equal(from([1, 2, 3, 4]).reduce((a, b) => a + b, 0), 10);
        assert.equal(from([1, 2, 3, 4]).reduce((a, b) => a + b), 10);
    });
    it('some / every', () => {
        assert.equal(from(people).some((p) => p.age > 40), true);
        assert.equal(from(people).every((p) => p.age > 40), false);
    });
    it('toMap keys by canonical token', () => {
        const m = from(people).toMap((p) => p.name, (p) => p.age);
        assert.equal(m.get('str:ada'), 36);
    });
    it('forEach visits every item', () => {
        const names = [];
        from(people).forEach((p) => names.push(p.name));
        assert.deepEqual(names, ['ada', 'bes', 'cyd', 'dot']);
    });
});

describe('Query — single-use guard', () => {
    it('a second terminal on the same Query throws (not a silent empty)', () => {
        const q = from([1, 2, 3]);
        assert.deepEqual(q.toArray(), [1, 2, 3]);
        assert.throws(() => q.toArray(), /already consumed/);
    });
    it('forking two chains from one Query throws on the second branch', () => {
        const q = from([1, 2, 3, 4]);
        const evens = q.filter((n) => n % 2 === 0);
        assert.throws(() => q.filter((n) => n % 2 === 1), /already consumed/);
        // the first branch is a fresh, independent Query — still fully usable.
        assert.deepEqual(evens.toArray(), [2, 4]);
    });
    it('iterating (for-of / spread) also consumes', () => {
        const q = from([1, 2]);
        assert.deepEqual([...q], [1, 2]);
        assert.throws(() => q.toArray(), /already consumed/);
    });
});

describe('Query — deep stateful composition', () => {
    it('orderBy then distinct keeps first-in-sorted-order', () => {
        assert.deepEqual(from([3, 1, 2, 1, 3, 2]).orderBy().distinct().toArray(), [1, 2, 3]);
    });
    it('join then groupBy', () => {
        const left = [{ id: 1, team: 'a' }, { id: 2, team: 'b' }, { id: 3, team: 'a' }];
        const right = [{ id: 1, pts: 5 }, { id: 2, pts: 7 }, { id: 3, pts: 9 }];
        const byTeam = from(left)
            .join(right, (l) => l.id, (r) => r.id, (l, r) => ({ team: l.team, pts: r.pts }))
            .groupBy((row) => row.team);
        assert.deepEqual(byTeam.get('str:a').map((r) => r.pts), [5, 9]);
        assert.deepEqual(byTeam.get('str:b').map((r) => r.pts), [7]);
    });
    it('orderBy is stable — equal keys keep source order', () => {
        const rows = [{ k: 1, id: 'a' }, { k: 1, id: 'b' }, { k: 0, id: 'c' }, { k: 1, id: 'd' }];
        const out = from(rows).orderBy((r) => r.k).map((r) => r.id).toArray();
        assert.deepEqual(out, ['c', 'a', 'b', 'd']);
    });
    it('orderBy sorts missing/undefined keys LAST (total order)', () => {
        const rows = [{ a: 2 }, { a: undefined }, { a: 1 }, { b: 9 }];
        const out = from(rows).orderBy((r) => r.a).toArray();
        assert.deepEqual(out, [{ a: 1 }, { a: 2 }, { a: undefined }, { b: 9 }]);
    });
});
