// The stateful / relational verbs, over stock Node 22+ iterator helpers.
//
// Two Viper primitives carry the whole family: ordering rides the total instance
// .compare() (no canonicalKey); grouping / dedup / join / set-ops key native
// Map/Set on canonicalKey (a primitive token, since JS collections key by identity).
// The stateless spine (filter/map/take/find/reduce/…) needs nothing here — it is
// stock iterator helpers straight on rows()/query().

import { canonicalKey } from './canonical.mjs';
import { compareValues } from './order.mjs';

// MARK: - distinct (lazy)

// A seen-set of canonical keys filters as it pulls, so distinct stays lazy: a
// downstream take(n) stops once n distinct items have been seen.
export function distinct(iterable, keyOf = canonicalKey) {
    const seen = new Set();
    return Iterator.from(iterable).filter((item) => {
        const token = keyOf(item);
        if (seen.has(token)) return false;
        seen.add(token);
        return true;
    });
}

// MARK: - ordering (barrier)

// orderBy(iterable, sel1, sel2, …) — sort by one or more key selectors (thenBy is just
// a further selector). With no selector, orders the items themselves. Materialises
// (sort is a barrier). Stable (Array.prototype.sort is stable). Ordering rides the
// runtime's total .compare() when a key is a wrapped value (compareValues), else native.
export function orderBy(iterable, ...selectors) {
    const keys = selectors.length ? selectors : [(item) => item];
    return [...iterable].sort((a, b) => {
        for (const select of keys) {
            const c = compareValues(select(a), select(b));
            if (c !== 0) return c;
        }
        return 0;
    });
}

// MARK: - grouping (barrier)

// groupBy(iterable, keyOf) — buckets by canonicalKey(keyOf(item)). Returns a
// Map<token, item[]>: value-equal group keys merge. The bucket VALUES stay as the
// items (wrapped); the Map key is the primitive token (a ValueKey can't be a native
// Map key by value). Read the original key off the first item if needed.
export function groupBy(iterable, keyOf) {
    return Map.groupBy(iterable, (item) => canonicalKey(keyOf(item)));
}

// MARK: - join (barrier on the right, lazy on the left)

// Builds a lookup Map<token, right[]> over the right side (the barrier), then streams
// the left side, emitting result(left, right) for each match. An inner join.
export function join(left, right, leftKey, rightKey, result) {
    const index = new Map();
    for (const r of right) {
        const token = canonicalKey(rightKey(r));
        const bucket = index.get(token);
        if (bucket) bucket.push(r);
        else index.set(token, [r]);
    }
    return Iterator.from(left).flatMap((l) => {
        const matches = index.get(canonicalKey(leftKey(l)));
        return matches ? matches.map((r) => result(l, r)) : [];
    });
}

// MARK: - set operations (by value)

// union — every distinct item across both, by value. Lazy (distinct's seen-set).
export function union(a, b) {
    return distinct((function* () { yield* a; yield* b; })());
}

// intersect — distinct items of `a` whose value also appears in `b`.
export function intersect(a, b) {
    const inB = new Set(Array.from(b, canonicalKey));
    const seen = new Set();
    return Iterator.from(a).filter((item) => {
        const token = canonicalKey(item);
        if (!inB.has(token) || seen.has(token)) return false;
        seen.add(token);
        return true;
    });
}

// except — distinct items of `a` whose value does NOT appear in `b`.
export function except(a, b) {
    const inB = new Set(Array.from(b, canonicalKey));
    const seen = new Set();
    return Iterator.from(a).filter((item) => {
        const token = canonicalKey(item);
        if (inB.has(token) || seen.has(token)) return false;
        seen.add(token);
        return true;
    });
}

// MARK: - toMap (barrier)

// Builds a native Map<token, value> keyed by canonicalKey(keyOf(item)). Because a
// ValueKey stays wrapped, the native Map key must be the canonical token; keep the
// original key as the value if you need it (valueOf returns the item by default).
export function toMap(iterable, keyOf, valueOf = (item) => item) {
    const map = new Map();
    for (const item of iterable) map.set(canonicalKey(keyOf(item)), valueOf(item));
    return map;
}
