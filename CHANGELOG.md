# Changelog — @digitalsubstrate/dsviper-query

All notable changes to this package. Format: [Keep a Changelog](https://keepachangelog.com/),
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- Initial consumer-side query layer over the `@digitalsubstrate/dsviper` Node binding.
- `query(state, attachment, options?)` — a lazy `[key, document]` iterator over an
  immutable `CommitState`; nil-skipped, with `keyPred` key-pushdown. Mutable sources
  are rejected (snapshot to a `CommitState` first).
- `canonicalKey(value)` — a value-identity token (`value.hashKey()` for wrapped values,
  a type-tagged token for native scalars).
- Verbs over native iterator helpers: `distinct`, `orderBy`, `groupBy`, `join`,
  `union`, `intersect`, `except`, `toMap`.
- DSL — `from(iterable)` / `Query`, a fluent lazy chain over the verbs and iterator
  helpers (`where`/`map`/`take`/`distinct`/`orderBy`/`groupBy`/`join`/set-ops/terminals;
  `keys()`/`values()` pair projections; single-use).
- DSL — `match(spec)`, a declarative Mongo-like filter compiled to a `(doc) => boolean`
  predicate (implicit equality, `$eq $ne $gt $gte $lt $lte $in $nin $exists $regex
  $not $where`, combinators `$and $or $nor $not`; dotted paths via `getIn`/nested).
  Also accepted directly by `Query.where`. Strict: a malformed spec (unknown operator,
  unknown top-level `$`-combinator, operator/plain-key mix, or ill-typed operand) throws
  at compile time instead of silently matching nothing.
- `compareValues(a, b)` and `getField(doc, path)` exposed as building blocks.
- `compareValues` is now a total order: `null`/`undefined` sort last, so `orderBy`
  over a collection with missing/optional keys is coherent (no broken transitivity).
  `match`'s order operators (`$gt`/`$gte`/`$lt`/`$lte`) still exclude an absent field.
- `Query` is single-use and enforces it: any second operation on the same Query — or
  forking two chains from it — throws `Query already consumed` instead of silently
  returning an exhausted (empty) stream.

### Requirements

- Node.js >= 22 (iterator helpers, `Map.groupBy`).
- `@digitalsubstrate/dsviper` >= 1.2.2 (the `value.hashKey()` bridge).
