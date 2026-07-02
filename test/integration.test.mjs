// Integration — the verbs over REAL wrapped Viper values, exercising value.hashKey()
// (grouping/dedup/join/set-ops) and the total instance .compare() (ordering). Needs the
// @digitalsubstrate/dsviper binding (>= 1.2.2 for hashKey); imports the package entry,
// which registers CommitState and re-exports the verbs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { distinct, orderBy, groupBy, join, intersect, from } from '../src/index.mjs';

const require = createRequire(import.meta.url);
const { Value, ValueInt8, ValueInt64 } = require('@digitalsubstrate/dsviper');

describe('integration — verbs over real Viper values', () => {
    it('distinct collapses value-equal wrapped structures (hashKey)', () => {
        const docs = [Value.deduce({ g: 1 }), Value.deduce({ g: 1 }), Value.deduce({ g: 2 })];
        assert.equal(distinct(docs).toArray().length, 2);
    });

    it('orderBy sorts wrapped values via the total .compare()', () => {
        const xs = [Value.deduce(3), Value.deduce(1), Value.deduce(2)];
        assert.deepEqual(orderBy(xs).map((v) => Number(Value.dumps(v, true))), [1, 2, 3]);
    });

    it('orderBy sorts a heterogeneous collection deterministically (trans-type order)', () => {
        const het = [Value.deduce('z'), Value.deduce(1), Value.deduce(true), Value.deduce([9])];
        assert.deepEqual(orderBy(het).map((v) => v.typeCode()), ['bool', 'double', 'string', 'vector']);
    });

    it('groupBy buckets real docs by a field value', () => {
        const docs = [
            Value.deduce({ g: 1, n: 'a' }),
            Value.deduce({ g: 2, n: 'b' }),
            Value.deduce({ g: 1, n: 'c' }),
        ];
        const fieldG = (doc) => Value.deduce(new Map(Value.dumps(doc, true)).get('g'));
        const groups = groupBy(docs, fieldG);
        assert.equal(groups.size, 2);
        assert.equal([...groups.values()].find((bucket) => bucket.length === 2).length, 2);
    });

    it('join matches real values by a field key', () => {
        const left = [Value.deduce({ id: 1, n: 'a' }), Value.deduce({ id: 2, n: 'b' })];
        const right = [Value.deduce({ id: 1, t: 'x' }), Value.deduce({ id: 3, t: 'z' })];
        const field = (f) => (doc) => Value.deduce(new Map(Value.dumps(doc, true)).get(f));
        const out = join(left, right, field('id'), field('id'),
            (l, r) => `${new Map(Value.dumps(l, true)).get('n')}${new Map(Value.dumps(r, true)).get('t')}`).toArray();
        assert.deepEqual(out, ['ax']);
    });

    it('intersect by value over real wrapped values', () => {
        const a = [Value.deduce({ k: 1 }), Value.deduce({ k: 2 })];
        const b = [Value.deduce({ k: 2 }), Value.deduce({ k: 3 })];
        const out = intersect(a, b).map((v) => new Map(Value.dumps(v, true)).get('k')).toArray();
        assert.deepEqual(out, [2]);
    });

    // The value-identity key MUST fold in the type: Int8(1) and Int64(1) share a raw
    // value hash but are distinct values. hashKey (type << 64 | value) keeps them apart,
    // so grouping/dedup never silently merges across widths.
    it('distinct does NOT merge equal-valued but differently-typed scalars', () => {
        const xs = [new ValueInt8(1), new ValueInt64(1), new ValueInt8(1)];
        assert.equal(distinct(xs).toArray().length, 2);
    });

    it('groupBy separates cross-width scalars sharing a value', () => {
        const groups = groupBy(
            [new ValueInt8(1), new ValueInt64(1), new ValueInt8(1)],
            (v) => v,
        );
        assert.equal(groups.size, 2);
    });

    it('orderBy places Int8(1) before Int64(1) (trans-type total order)', () => {
        const out = orderBy([new ValueInt64(1), new ValueInt8(1)]).map((v) => v.typeCode());
        assert.deepEqual(out, ['int8', 'int64']);
    });
});

describe('integration — the fluent Query over real Viper values', () => {
    it('chains distinct + orderBy + toArray on wrapped values', () => {
        const xs = [Value.deduce(3), Value.deduce(1), Value.deduce(2), Value.deduce(1)];
        const out = from(xs).distinct().orderBy().map((v) => Number(Value.dumps(v, true))).toArray();
        assert.deepEqual(out, [1, 2, 3]);
    });

    it('where(match) filters wrapped documents on a decoded field', () => {
        const docs = [Value.deduce({ g: 1 }), Value.deduce({ g: 2 }), Value.deduce({ g: 1 })];
        const g = (doc) => new Map(Value.dumps(doc, true)).get('g');
        const count = from(docs).where((doc) => g(doc) === 1).count();
        assert.equal(count, 2);
    });
});
