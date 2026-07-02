// match — the Mongo-like filter compiler, pure unit over native plain objects (the
// implicit path accessor walks nested properties; canonicalKey/compareValues fall to
// native semantics). A fake wrapped value exercises the .equals()/.compare()/getIn
// bridges without the binding. Real wrapped documents are covered in integration.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { match, getField } from '../src/match.mjs';

const docs = [
    { name: 'ada', dept: 'eng', age: 36, addr: { city: 'london' } },
    { name: 'bes', dept: 'eng', age: 28, addr: { city: 'paris' } },
    { name: 'cyd', dept: 'ops', age: 41, addr: { city: 'london' } },
];
const where = (spec) => docs.filter(match(spec)).map((d) => d.name);

describe('match — implicit equality', () => {
    it('matches a scalar field by value', () => {
        assert.deepEqual(where({ dept: 'eng' }), ['ada', 'bes']);
    });
    it('ANDs multiple fields', () => {
        assert.deepEqual(where({ dept: 'eng', age: 28 }), ['bes']);
    });
    it('resolves a dotted nested path', () => {
        assert.deepEqual(where({ 'addr.city': 'london' }), ['ada', 'cyd']);
    });
    it('does not confuse native numeric types', () => {
        assert.deepEqual(where({ age: 36n }), []);
        assert.deepEqual(where({ age: 36 }), ['ada']);
    });
});

describe('match — comparison operators', () => {
    it('$gt / $gte / $lt / $lte', () => {
        assert.deepEqual(where({ age: { $gt: 36 } }), ['cyd']);
        assert.deepEqual(where({ age: { $gte: 36 } }), ['ada', 'cyd']);
        assert.deepEqual(where({ age: { $lt: 36 } }), ['bes']);
        assert.deepEqual(where({ age: { $lte: 36 } }), ['ada', 'bes']);
    });
    it('$ne', () => {
        assert.deepEqual(where({ dept: { $ne: 'eng' } }), ['cyd']);
    });
    it('combines operators on one field (a range)', () => {
        assert.deepEqual(where({ age: { $gte: 28, $lt: 41 } }), ['ada', 'bes']);
    });
    it('an absent field never matches an order comparison', () => {
        // decoupled from compareValues total order (nils sort last there): a missing
        // field is not a large value, it simply fails > / >= / < / <=.
        assert.deepEqual(where({ missing: { $gt: 0 } }), []);
        assert.deepEqual(where({ missing: { $lte: 999 } }), []);
    });
});

describe('match — membership / existence / regex', () => {
    it('$in / $nin', () => {
        assert.deepEqual(where({ dept: { $in: ['ops', 'sales'] } }), ['cyd']);
        assert.deepEqual(where({ dept: { $nin: ['eng'] } }), ['cyd']);
    });
    it('$exists', () => {
        assert.deepEqual(where({ addr: { $exists: true } }), ['ada', 'bes', 'cyd']);
        assert.deepEqual(where({ missing: { $exists: false } }), ['ada', 'bes', 'cyd']);
        assert.deepEqual(where({ missing: { $exists: true } }), []);
    });
    it('$regex against the stringified field', () => {
        assert.deepEqual(where({ name: { $regex: /^a/ } }), ['ada']);
        assert.deepEqual(where({ 'addr.city': { $regex: 'on$' } }), ['ada', 'cyd']);
    });
});

describe('match — logical combinators', () => {
    it('$or', () => {
        assert.deepEqual(where({ $or: [{ dept: 'ops' }, { age: { $lt: 30 } }] }), ['bes', 'cyd']);
    });
    it('$and', () => {
        assert.deepEqual(where({ $and: [{ dept: 'eng' }, { age: { $gt: 30 } }] }), ['ada']);
    });
    it('$nor', () => {
        assert.deepEqual(where({ $nor: [{ dept: 'eng' }, { age: { $gt: 40 } }] }), []);
        assert.deepEqual(where({ $nor: [{ dept: 'ops' }] }), ['ada', 'bes']);
    });
    it('$not negates a field condition', () => {
        assert.deepEqual(where({ age: { $not: { $gt: 30 } } }), ['bes']);
    });
    it('$where escape hatch — a raw predicate', () => {
        assert.deepEqual(where({ name: { $where: (v) => v.length === 3 } }), ['ada', 'bes', 'cyd']);
    });
});

describe('match — spec-level escapes and errors', () => {
    it('a function spec passes through unchanged', () => {
        assert.deepEqual(docs.filter(match((d) => d.age > 40)).map((d) => d.name), ['cyd']);
    });
    it('throws on an unknown operator', () => {
        assert.throws(() => match({ age: { $bogus: 1 } }), /unknown operator \$bogus/);
    });
    it('throws on a non-object, non-function spec', () => {
        assert.throws(() => match(42), /plain object or a function/);
    });
    it('an empty spec matches everything', () => {
        assert.deepEqual(where({}), ['ada', 'bes', 'cyd']);
    });
});

describe('match — strictness (no silent no-op)', () => {
    it('throws on a condition mixing an operator and a plain key (typo guard)', () => {
        assert.throws(() => match({ age: { $gt: 18, tpyo: 1 } }), /cannot mix operators and plain keys/);
    });
    it('throws on an unknown top-level $-operator (not read as a field)', () => {
        assert.throws(() => match({ $xor: [{ dept: 'eng' }] }), /unknown top-level operator \$xor/);
    });
    it('throws when a combinator operand is not an array', () => {
        assert.throws(() => match({ $and: { dept: 'eng' } }), /\$and expects an array/);
        assert.throws(() => match({ $or: 'nope' }), /\$or expects an array/);
    });
    it('throws when $in / $nin operand is not iterable', () => {
        assert.throws(() => match({ dept: { $in: 5 } }), /\$in expects an iterable/);
        assert.throws(() => match({ dept: { $nin: null } }), /\$nin expects an iterable/);
    });
});

describe('match — wrapped-value bridges (fake, no binding)', () => {
    // A fake wrapped scalar: total .equals()/.compare() by an inner number, and a
    // getIn surface so the field accessor takes the wrapped path.
    const wrap = (n) => ({
        _n: n,
        equals(o) { return o != null && o._n === n; },
        compare(o) { return Math.sign(n - (o?._n ?? o)); },
    });
    const rows = [
        { getIn: () => wrap(10), id: 1 },
        { getIn: () => wrap(20), id: 2 },
    ];
    it('$eq rides the wrapped .equals()', () => {
        const out = rows.filter(match({ score: wrap(20) })).map((r) => r.id);
        assert.deepEqual(out, [2]);
    });
    it('$gt rides the wrapped .compare()', () => {
        const out = rows.filter(match({ score: { $gt: wrap(10) } })).map((r) => r.id);
        assert.deepEqual(out, [2]);
    });
    it('a wrapped operand is an equality literal, not an operator object', () => {
        // wrap(10) is a plain object but its keys are not $-prefixed, so the compiler
        // treats it as a value to $eq, never as a bag of operators.
        const out = rows.filter(match({ score: wrap(10) })).map((r) => r.id);
        assert.deepEqual(out, [1]);
    });
});

describe('getField — accessor', () => {
    it('reads nested native paths, undefined on miss', () => {
        assert.equal(getField({ a: { b: 2 } }, 'a.b'), 2);
        assert.equal(getField({ a: {} }, 'a.b.c'), undefined);
        assert.equal(getField(null, 'a'), undefined);
    });
    it('reads via getIn; a throwing getIn (missing/wrong step) maps to undefined', () => {
        // mirrors the real binding: getIn is strict and throws on a missing field.
        const wrapped = { getIn: (p) => { if (p.join('.') === 'a.b') return 'X'; throw new Error('no such field'); } };
        assert.equal(getField(wrapped, 'a.b'), 'X');
        assert.equal(getField(wrapped, 'a.c'), undefined);
    });
});
