# @digitalsubstrate/dsviper-query

A consumer-side query layer over the [`@digitalsubstrate/dsviper`](https://www.npmjs.com/package/@digitalsubstrate/dsviper)
Node.js binding. It adds **nothing to the binding** — native Node 22+ iterator-helper
chaining is already expressive over the Viper value model; this package supplies the
small set of bridges the stateful verbs need.

## The idea

A value reaching a JS chain is either a **native scalar** (already decoded — `number`,
`bigint`, `string`, …) or a **wrapped** Viper value (containers, keys, ids). The
stateless spine works on both with stock helpers and needs no library:

```js
import { query } from '@digitalsubstrate/dsviper-query';

// rows() is a lazy [key, document] source; native helpers chain over it directly.
const top = query(state, attachment)
    .filter(([, doc]) => doc.at('score') > 1000)
    .map(([key]) => key)
    .take(10)
    .toArray();
```

The **stateful / relational** verbs (`distinct`, `groupBy`, `join`, `union`/`intersect`/
`except`, `toMap`) all hit one wall: JS `Map`/`Set` key by **identity**, not by value.
That closes with two bridges:

- **Ordering** rides the binding's total instance `.compare()` — `orderBy` sorts wrapped
  values directly, even heterogeneous ones.
- **Grouping / dedup / join** key a native collection on `value.hashKey()` — a type-aware
  primitive token (via `canonicalKey`), so value-equal values collapse.

```js
import { distinct, groupBy, orderBy, join } from '@digitalsubstrate/dsviper-query';

const unique   = distinct(values).toArray();
const byKind   = groupBy(values, (v) => v.at('kind'));        // Map<token, items[]>
const sorted   = orderBy(values, (v) => v.at('score'));       // total .compare()
const enriched = join(left, right, l => l.at('id'), r => r.at('id'), (l, r) => ({ l, r }));
```

## The DSL

On top of the verbs sits an ergonomic layer — pure sugar over the same bridges and
native helpers, adding no power, only reach.

**`from(iterable)` — a fluent, lazy chain.** Wrap any iterable (typically `query(...)`)
and chain the spine and the verbs; `keys()`/`values()` project the `[key, doc]` halves;
terminals (`toArray`, `groupBy`, `first`, `count`, …) consume it. A `Query` is
**single-use** — every operation consumes the underlying lazy iterator, so a second
operation on the same `Query` (or forking two chains from it) throws `Query already
consumed` rather than silently yielding an empty stream. Re-derive a fresh `Query` from
the source per chain.

```js
import { from, query } from '@digitalsubstrate/dsviper-query';

const names = from(query(state, attachment))
    .values()                              // drop the key half
    .where({ dept: 'eng', age: { $gte: 30 } })
    .orderBy((doc) => doc.at('age', false)) // total .compare()
    .map((doc) => doc.at('name'))
    .take(5)
    .toArray();
```

**`match(spec)` — a declarative, Mongo-like filter** compiled to a `(doc) => boolean`
predicate (also accepted directly by `.where`). Implicit equality per field, operators
`$eq $ne $gt $gte $lt $lte $in $nin $exists $regex $not $where`, and combinators
`$and $or $nor $not`. Dotted paths resolve through `getIn` for wrapped documents (missing
paths are simply unmatched, never throw) and nested properties for plain objects.
Equality rides the runtime's total `.equals()`, ordering its `.compare()`.

```js
import { match } from '@digitalsubstrate/dsviper-query';

const wanted = match({
    $or: [{ status: 'active' }, { score: { $gt: 1000 } }],
    'addr.city': { $in: ['paris', 'london'] },
});
const hits = from(query(state, attachment)).values().where(wanted).toArray();
```

`match` is **strict** — a malformed spec throws at compile time rather than silently
matching nothing: an unknown operator, an unknown top-level `$`-combinator, a condition
mixing an operator and a plain key (a typo'd `$op`), or an ill-typed operand
(`$and`/`$or`/`$nor` want an array, `$in`/`$nin` an iterable, `$where` a function). An
absent field never matches an order comparison (`$gt`/`$gte`/`$lt`/`$lte`); use
`$exists` to test presence. Fields are read through `getIn` at its default projection
(`encoded=true`), so scalar leaves arrive native and compare with native semantics,
while composite leaves (sub-structures, containers) stay wrapped and ride the total
`.equals()`/`.compare()` — the match result is the same either way, since a wrapped
scalar's `.equals()`/`.compare()` deduce the native operand.

The ambition is deliberately minimal: the operators above, the combinators
`$and`/`$or`/`$nor`/`$not`, and a `$where` escape hatch — no `$options`, `$elemMatch`,
`$size`, or `$type`. Reach for a `$where` (or a plain predicate) beyond that.

## API

| Export | Kind | Notes |
|---|---|---|
| `query(state, attachment, opts?)` | source | a lazy `[key, document]` iterator over an **immutable `CommitState`**; nil-skipped; `keyPred` pushes down before `get()` |
| `from(iterable)` / `Query` | fluent | chainable, lazy wrapper over the verbs and iterator helpers; single-use |
| `match(spec, opts?)` | filter | compiles a Mongo-like spec to a `(doc) => boolean` predicate |
| `getField(doc, path)` | accessor | dotted-path read (`getIn` for wrapped, nested for native), `undefined` on a miss |
| `canonicalKey(value)` | primitive | `value.hashKey()` for wrapped, a type-tagged token for native scalars |
| `compareValues(a, b)` | primitive | total order — `.compare()` for wrapped, native `< >` otherwise |
| `distinct`, `orderBy`, `groupBy`, `join`, `union`, `intersect`, `except`, `toMap` | verbs | over stock iterator helpers |

`query` accepts **only an immutable `CommitState`** (a database at a fixed commitId) —
its `keys()`/`get()` see one frozen snapshot, so the lazy scan is consistent. Mutable
sources (`CommitMutableState`, `Database`) are rejected: their store can change between
`keys()` and `get()`. To query live state, snapshot first —
`CommitState.state(commitDatabase, commitId)` — then query that.

## Requirements

- Node.js **>= 22** (iterator helpers, `Map.groupBy`).
- `@digitalsubstrate/dsviper` **>= 1.2.2** (the `value.hashKey()` bridge).

## Status

Experimental (0.x). The surface may change. The `match`/`from` DSL is pure sugar over the
verbs — the native helpers plus the bridges already express the whole algebra; the DSL only
makes common shapes terser.

## License

MIT

## Runtime dependency

At runtime, this project depends on the `@digitalsubstrate/dsviper` package
(distributed on npm), which is **proprietary** (`license` field
`LicenseRef-DigitalSubstrate-Commercial-1.2`). See
[https://www.npmjs.com/package/@digitalsubstrate/dsviper](https://www.npmjs.com/package/@digitalsubstrate/dsviper)
for the package's licensing posture and contact information.
