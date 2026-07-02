// compareValues — the total ordering primitive, shared by orderBy and the match DSL.
//
// Total by construction: null/undefined sort LAST (deterministically), so a collection
// with missing/optional keys still orders coherently (no broken transitivity). Among
// present values, a wrapped Viper value rides the runtime's total instance .compare()
// (trans-type total order since 1.2.18 — a heterogeneous collection sorts, no static,
// no decode); otherwise it falls to native < >. Returns -1 / 0 / 1.

export function compareValues(a, b) {
    const aNil = a === null || a === undefined;
    const bNil = b === null || b === undefined;
    if (aNil || bNil) return aNil && bNil ? 0 : aNil ? 1 : -1;
    if (typeof a.compare === 'function') return Math.sign(a.compare(b));
    if (typeof b.compare === 'function') return -Math.sign(b.compare(a));
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}
