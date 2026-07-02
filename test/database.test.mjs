// Integration — query() over a REAL in-memory CommitDatabase. Exercises the actual
// read path (CommitState.attachmentGetting().keys()/get() -> ValueOptional -> unwrap)
// end to end, the CommitState-only contract against a real CommitMutableState, and a
// few verbs chained on the live query. Needs @digitalsubstrate/dsviper (>= 1.2.2).

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { query, groupBy, orderBy, distinct, from, match } from '../src/index.mjs';

const require = createRequire(import.meta.url);
const dsviper = require('@digitalsubstrate/dsviper');
const {
    CommitDatabase, CommitStateBuilder, CommitMutableState,
    Definitions, NameSpace, Type, ValueUUId, TypeStructureDescriptor,
} = dsviper;

// Schema: a Document concept with an `item` {city:STRING, score:INT64} attachment.
function buildSchema() {
    const definitions = new Definitions();
    const namespace = new NameSpace(ValueUUId.create(), 'QueryIT');
    const concept = definitions.createConcept(namespace, 'Document');
    const descriptor = new TypeStructureDescriptor('Item');
    descriptor.addField('city', Type.STRING);
    descriptor.addField('score', Type.INT32);
    const structure = definitions.createStructure(namespace, descriptor);
    const item = definitions.createAttachment(namespace, 'item', concept, structure);
    return { definitions, item };
}

const schema = buildSchema();
const DATA = [
    { city: 'Paris', score: 30 },
    { city: 'Lyon', score: 10 },
    { city: 'Paris', score: 20 },
    { city: 'Nice', score: 50 },
];

// Seed an in-memory DB with DATA in one commit; return the frozen CommitState.
function seed() {
    const db = CommitDatabase.createInMemory();
    db.extendDefinitions(schema.definitions.const());
    const mutable = new CommitMutableState(CommitStateBuilder.initialState(db));
    const mutating = mutable.attachmentMutating();
    for (const row of DATA) {
        const key = schema.item.createKey();
        mutating.set(schema.item, key, schema.item.createStructure({ city: row.city, score: row.score }));
    }
    const commitId = db.commitMutations('seed', mutable);
    return { db, mutable, state: CommitStateBuilder.state(db, commitId) };
}

describe('integration — query() over a real in-memory CommitDatabase', () => {
    let db, state, mutable;

    beforeEach(() => { ({ db, state, mutable } = seed()); });
    afterEach(() => { if (db && !db.isClosed()) db.close(); });

    it('yields one [key, document] pair per stored document', () => {
        const out = query(state, schema.item).toArray();
        assert.equal(out.length, DATA.length);
        for (const [, doc] of out) assert.equal(typeof doc.at('city'), 'string');
    });

    it('chains native helpers over the live query (scalars decode native)', () => {
        const cities = query(state, schema.item)
            .filter(([, doc]) => doc.at('score') > 15)
            .map(([, doc]) => doc.at('city'))
            .toArray();
        assert.deepEqual(cities.sort(), ['Nice', 'Paris', 'Paris']);
    });

    it('groupBy a document field, over real documents', () => {
        const byCity = groupBy(query(state, schema.item).map(([, doc]) => doc), (doc) => doc.at('city'));
        assert.equal(byCity.size, 3);
        const paris = [...byCity.values()].find((bucket) => bucket.length === 2);
        assert.ok(paris && paris.every((doc) => doc.at('city') === 'Paris'));
    });

    it('orderBy a numeric field via the total .compare() of the wrapped score', () => {
        const scores = orderBy(query(state, schema.item).map(([, doc]) => doc), (doc) => doc.at('score', false))
            .map((doc) => doc.at('score'));
        assert.deepEqual(scores, [10, 20, 30, 50]);
    });

    it('distinct collapses value-equal documents via hashKey', () => {
        const docs = query(state, schema.item).map(([, doc]) => doc).toArray();
        const withDup = [...docs, docs[0]];
        assert.equal(distinct(withDup).toArray().length, DATA.length);
    });

    it('rejects the mutable source — query() is CommitState only', () => {
        assert.throws(() => query(mutable, schema.item), /immutable CommitState/);
    });
});

describe('integration — the DSL over real wrapped documents', () => {
    let db, state;

    beforeEach(() => { ({ db, state } = seed()); });
    afterEach(() => { if (db && !db.isClosed()) db.close(); });

    const docs = () => from(query(state, schema.item)).values();

    it('match filters real documents via getIn (encoded native leaves)', () => {
        const scores = docs().where({ city: 'Paris' }).map((doc) => doc.at('score')).toArray();
        assert.deepEqual(scores.sort((a, b) => a - b), [20, 30]);
    });

    it('match comparison operator on a wrapped numeric field', () => {
        const cities = docs().where({ score: { $gt: 15 } }).map((doc) => doc.at('city')).toArray();
        assert.deepEqual(cities.sort(), ['Nice', 'Paris', 'Paris']);
    });

    it('match on a missing field yields no throw, no match (getIn throws -> undefined)', () => {
        assert.equal(docs().where({ nope: { $exists: true } }).count(), 0);
        assert.equal(docs().where({ nope: { $exists: false } }).count(), DATA.length);
    });

    it('fluent chain — where + orderBy (total .compare()) + map', () => {
        const ordered = docs()
            .where({ score: { $gte: 20 } })
            .orderBy((doc) => doc.at('score', false))
            .map((doc) => doc.at('score'))
            .toArray();
        assert.deepEqual(ordered, [20, 30, 50]);
    });

    it('fluent groupBy over a real document field', () => {
        const byCity = docs().groupBy((doc) => doc.at('city'));
        assert.equal(byCity.size, 3);
    });

    it('a bare predicate and a match spec agree', () => {
        const bySpec = docs().where(match({ city: 'Lyon' })).count();
        const byFn = from(query(state, schema.item)).values().where((doc) => doc.at('city') === 'Lyon').count();
        assert.equal(bySpec, byFn);
        assert.equal(bySpec, 1);
    });
});
