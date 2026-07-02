// Type declarations for @digitalsubstrate/dsviper-query.
// The binding types (CommitState, Attachment, ValueKey, OutputValue) come from the
// peer @digitalsubstrate/dsviper.

import type { CommitState, Attachment, ValueKey, OutputValue } from '@digitalsubstrate/dsviper';

/** A primitive token returned by canonicalKey / value.hashKey() (bigint for a wrapped
 *  value, a type-tagged string for a native scalar). Usable as a native Map/Set key. */
export type CanonicalToken = bigint | string;

export interface QueryOptions {
    /** Reject a key before its get() (key-pushdown: zero get() on a rejected key). */
    keyPred?: (key: ValueKey) => boolean;
    /** Decode scalar leaves to native JS (default true). */
    encoded?: boolean;
}

/** A lazy [key, document] iterator over an immutable CommitState (a database at a fixed
 *  commitId). Mutable sources (CommitMutableState, Database) are rejected — snapshot to a
 *  CommitState first (CommitState.state(commitDatabase, commitId)). */
export function query(
    state: CommitState,
    attachment: Attachment,
    options?: QueryOptions,
): IterableIterator<[ValueKey, OutputValue]>;

/** A value-identity token: value.hashKey() for a wrapped Viper value, a type-tagged
 *  string for a native scalar (so 1, 1n and "1" never collide). */
export function canonicalKey(value: unknown): CanonicalToken;

/** Distinct by value (lazy, via a seen-set of canonical keys). */
export function distinct<T>(iterable: Iterable<T>, keyOf?: (item: T) => unknown): IterableIterator<T>;

/** Sort by one or more key selectors (thenBy = a further selector); the total .compare()
 *  is used when a key is a wrapped value, else native comparison. Materialises. */
export function orderBy<T>(iterable: Iterable<T>, ...selectors: Array<(item: T) => unknown>): T[];

/** Bucket by canonicalKey(keyOf(item)) -> Map<token, items[]> (value-equal keys merge). */
export function groupBy<T>(iterable: Iterable<T>, keyOf: (item: T) => unknown): Map<CanonicalToken, T[]>;

/** Inner join: lookup over `right` keyed by canonicalKey, then stream `left`. */
export function join<L, R, Result>(
    left: Iterable<L>,
    right: Iterable<R>,
    leftKey: (item: L) => unknown,
    rightKey: (item: R) => unknown,
    result: (left: L, right: R) => Result,
): IterableIterator<Result>;

/** Every distinct item across both, by value (lazy). */
export function union<T>(a: Iterable<T>, b: Iterable<T>): IterableIterator<T>;

/** Distinct items of `a` whose value also appears in `b`. */
export function intersect<T>(a: Iterable<T>, b: Iterable<T>): IterableIterator<T>;

/** Distinct items of `a` whose value does NOT appear in `b`. */
export function except<T>(a: Iterable<T>, b: Iterable<T>): IterableIterator<T>;

/** Build a native Map<token, value> keyed by canonicalKey(keyOf(item)). */
export function toMap<T, V = T>(
    iterable: Iterable<T>,
    keyOf: (item: T) => unknown,
    valueOf?: (item: T) => V,
): Map<CanonicalToken, V>;

/** Total ordering primitive: the runtime's .compare() for a wrapped Viper value
 *  (trans-type total order), native < > otherwise. null/undefined sort last, so a
 *  collection with missing keys still orders coherently. Returns -1 | 0 | 1. */
export function compareValues(a: unknown, b: unknown): -1 | 0 | 1;

// MARK: - the match DSL (a declarative, Mongo-like filter)

/** Operator conditions applied to a single field. */
export interface MatchOperators {
    $eq?: unknown;
    $ne?: unknown;
    $gt?: unknown;
    $gte?: unknown;
    $lt?: unknown;
    $lte?: unknown;
    $in?: Iterable<unknown>;
    $nin?: Iterable<unknown>;
    $exists?: boolean;
    $regex?: string | RegExp;
    $not?: MatchCondition;
    $where?: (fieldValue: unknown) => boolean;
}

/** A field's condition: a literal (implicit $eq) or an operator object. */
export type MatchCondition = unknown | MatchOperators;

/** A match spec: a field map with $and/$or/$nor/$not combinators, or a raw predicate. */
export type MatchSpec =
    | { [field: string]: MatchCondition }
    | { $and: MatchSpec[] }
    | { $or: MatchSpec[] }
    | { $nor: MatchSpec[] }
    | { $not: MatchSpec }
    | ((doc: unknown) => boolean);

/** Options for match — override the field accessor (default getField). */
export interface MatchOptions {
    field?: (doc: unknown, path: string) => unknown;
}

/** Compile a Mongo-like spec into a `(doc) => boolean` predicate. Equality rides the
 *  runtime's total .equals() and ordering its .compare() for wrapped Viper values,
 *  native semantics otherwise. Pure and duck-typed (no binding import). */
export function match(spec: MatchSpec, options?: MatchOptions): (doc: unknown) => boolean;

/** Resolve a dotted (or array) path against a document — getIn for a wrapped value
 *  (undefined on a missing path, never throws), nested property access otherwise. */
export function getField(doc: unknown, path: string | string[]): unknown;

// MARK: - the fluent Query wrapper

/** Wrap any iterable (typically the [key, doc] stream from query()) into a fluent,
 *  lazy Query. Single-use, like the underlying iterator helpers. */
export function from<T>(iterable: Iterable<T>): Query<T>;

/** A lazy, chainable wrapper over the verbs and native iterator helpers. Single-use:
 *  every method consumes the underlying iterator, so a second operation on the same
 *  Query (including forking two chains from it) throws 'Query already consumed'. */
export class Query<T> implements Iterable<T> {
    constructor(iterable: Iterable<T>);
    [Symbol.iterator](): Iterator<T>;

    /** Filter by a predicate function or a Mongo-like match spec. */
    where(specOrPredicate: MatchSpec | ((item: T) => boolean)): Query<T>;
    filter(predicate: (item: T) => boolean): Query<T>;
    map<U>(fn: (item: T) => U): Query<U>;
    flatMap<U>(fn: (item: T) => Iterable<U>): Query<U>;
    take(limit: number): Query<T>;
    drop(count: number): Query<T>;
    tap(fn: (item: T) => void): Query<T>;

    /** [key, doc] pair projections (when the source yields pairs). */
    keys(): Query<T extends [infer K, unknown] ? K : unknown>;
    values(): Query<T extends [unknown, infer V] ? V : unknown>;

    distinct(keyOf?: (item: T) => unknown): Query<T>;
    orderBy(...selectors: Array<(item: T) => unknown>): Query<T>;
    join<R, Result>(right: Iterable<R>, leftKey: (item: T) => unknown, rightKey: (item: R) => unknown, result: (left: T, right: R) => Result): Query<Result>;
    union(other: Iterable<T>): Query<T>;
    intersect(other: Iterable<T>): Query<T>;
    except(other: Iterable<T>): Query<T>;

    groupBy(keyOf: (item: T) => unknown): Map<CanonicalToken, T[]>;
    toMap<V = T>(keyOf: (item: T) => unknown, valueOf?: (item: T) => V): Map<CanonicalToken, V>;
    toArray(): T[];
    reduce(reducer: (acc: T, item: T) => T): T;
    reduce<A>(reducer: (acc: A, item: T) => A, initialValue: A): A;
    forEach(fn: (item: T) => void): void;
    first(): T | undefined;
    find(predicate: (item: T) => boolean): T | undefined;
    some(predicate: (item: T) => boolean): boolean;
    every(predicate: (item: T) => boolean): boolean;
    count(): number;
}
