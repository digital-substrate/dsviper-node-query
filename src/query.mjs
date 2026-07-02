// Query — a fluent, lazy wrapper that chains the verbs and native iterator helpers.
//
// `from(iterable)` wraps any iterable (typically the [key, doc] stream from
// `query(state, att)`) into a chainable Query. The stateless spine (where/map/take/…)
// stays lazy on stock iterator helpers; the stateful verbs (distinct/orderBy/…) reuse
// the free functions and return a Query so chaining continues; terminals
// (toArray/groupBy/first/…) consume it. A Query wraps ONE iterator and is single-use,
// like the underlying helpers — re-derive from the source to iterate again.

import { canonicalKey } from './canonical.mjs';
import { distinct, orderBy, groupBy, join, union, intersect, except, toMap } from './verbs.mjs';
import { match } from './match.mjs';

export function from(iterable) {
    return new Query(iterable);
}

export class Query {
    #iterator;
    #consumed = false;

    constructor(iterable) {
        this.#iterator = Iterator.from(iterable);
    }

    // Hand out the underlying iterator exactly once. A Query wraps a single lazy
    // iterator, so any second operation on the same Query would silently see an
    // exhausted (or, worse, half-consumed shared) stream. Deriving two chains from one
    // Query — const a = q.map(f); const b = q.filter(g) — is the classic trap: fail
    // loudly instead. Re-derive a fresh Query from the source to iterate again.
    #take() {
        if (this.#consumed)
            throw new Error(
                'Query already consumed — a Query is single-use. Derive a fresh one from ' +
                'the source (e.g. from(query(state, att))) for each chain.');
        this.#consumed = true;
        return this.#iterator;
    }

    [Symbol.iterator]() {
        return this.#take();
    }

    // MARK: - lazy spine

    // where(specOrPred) — filter by a predicate function or a Mongo-like spec object
    // (compiled via match). filter is the plain-function alias.
    where(specOrPred) {
        const predicate = typeof specOrPred === 'function' ? specOrPred : match(specOrPred);
        return new Query(this.#take().filter(predicate));
    }

    filter(predicate) {
        return new Query(this.#take().filter(predicate));
    }

    map(fn) {
        return new Query(this.#take().map(fn));
    }

    flatMap(fn) {
        return new Query(this.#take().flatMap(fn));
    }

    take(limit) {
        return new Query(this.#take().take(limit));
    }

    drop(count) {
        return new Query(this.#take().drop(count));
    }

    // Peek at each item without altering the stream (debug / side effects).
    tap(fn) {
        return new Query(this.#take().map((item) => (fn(item), item)));
    }

    // MARK: - [key, doc] pair helpers

    keys() {
        return new Query(this.#take().map(([key]) => key));
    }

    values() {
        return new Query(this.#take().map(([, value]) => value));
    }

    // MARK: - stateful verbs (return a Query for further chaining)

    distinct(keyOf = canonicalKey) {
        return new Query(distinct(this.#take(), keyOf));
    }

    orderBy(...selectors) {
        return new Query(orderBy(this.#take(), ...selectors));
    }

    join(right, leftKey, rightKey, result) {
        return new Query(join(this.#take(), right, leftKey, rightKey, result));
    }

    union(other) {
        return new Query(union(this.#take(), other));
    }

    intersect(other) {
        return new Query(intersect(this.#take(), other));
    }

    except(other) {
        return new Query(except(this.#take(), other));
    }

    // MARK: - terminals (consume the iterator)

    groupBy(keyOf) {
        return groupBy(this.#take(), keyOf);
    }

    toMap(keyOf, valueOf) {
        return toMap(this.#take(), keyOf, valueOf);
    }

    toArray() {
        return this.#take().toArray();
    }

    reduce(reducer, initialValue) {
        const iterator = this.#take();
        return arguments.length > 1
            ? iterator.reduce(reducer, initialValue)
            : iterator.reduce(reducer);
    }

    forEach(fn) {
        for (const item of this.#take()) fn(item);
    }

    first() {
        const { value, done } = this.#take().next();
        return done ? undefined : value;
    }

    find(predicate) {
        return this.#take().find(predicate);
    }

    some(predicate) {
        return this.#take().some(predicate);
    }

    every(predicate) {
        return this.#take().every(predicate);
    }

    count() {
        let n = 0;
        for (const _ of this.#take()) n += 1;
        return n;
    }
}
