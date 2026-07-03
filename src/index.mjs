// dsviper-query — a consumer-side query layer over the dsviper binding.
//
// Native Node 22+ iterator-helper chaining is expressive over the Viper value model;
// this package supplies the small set of bridges the stateful verbs need (grouping /
// dedup / join / set-ops key on a primitive token; ordering rides the total
// .compare()). On top sits an ergonomic DSL — a fluent `from()/Query` chain and a
// declarative Mongo-like `match()` filter — that is pure sugar over the same verbs and
// native iterator helpers. It depends on @digitalsubstrate/dsviper and adds NOTHING to
// the binding. Only source.mjs loads the binding — for `state instanceof CommitState`,
// because CommitState is the SOLE type carrying the immutability the query is sound over
// (a frozen, content-addressed snapshot at a fixed commitId); a mutable source has no
// atomic snapshot at this layer. The value-protocol modules (verbs/order/match) only call
// methods on the values themselves (compare/equals/hashKey/getIn), so they need no import.

export { query, rows } from './source.mjs';
export { canonicalKey } from './canonical.mjs';
export { compareValues } from './order.mjs';
export { distinct, orderBy, groupBy, join, union, intersect, except, toMap } from './verbs.mjs';
export { match, getField } from './match.mjs';
export { from, Query } from './query.mjs';
