// dsviper-query — a consumer-side query layer over the N_Viper binding.
//
// Native Node 22+ iterator-helper chaining is expressive over the Viper value model;
// this package supplies the small set of bridges the stateful verbs need (grouping /
// dedup / join / set-ops key on a primitive token; ordering rides the total
// .compare()). On top sits an ergonomic DSL — a fluent `from()/Query` chain and a
// declarative Mongo-like `match()` filter — that is pure sugar over the same verbs and
// native iterator helpers. It depends on @digitalsubstrate/dsviper but adds NOTHING to
// the binding, and does not even load it — every module duck-types on hashKey/compare/
// equals/getIn and on the CommitState read surface, so the package is pure and
// unit-tests without the binding.

export { query } from './source.mjs';
export { canonicalKey } from './canonical.mjs';
export { compareValues } from './order.mjs';
export { distinct, orderBy, groupBy, join, union, intersect, except, toMap } from './verbs.mjs';
export { match, getField } from './match.mjs';
export { from, Query } from './query.mjs';
