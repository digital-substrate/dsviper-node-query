// match — a declarative, Mongo-like filter compiled to a plain predicate.
//
// `match(spec)` returns `(doc) => boolean`. The spec maps a dotted field path to a
// literal (implicit $eq) or an operator object ($gt, $in, …), with $and/$or/$not/$nor
// at any level. It is pure and duck-typed: equality rides the runtime's total
// .equals() and ordering its total .compare() when a field is a wrapped Viper value,
// falling to native semantics otherwise — so the same spec filters wrapped documents
// and already-decoded plain objects alike, with no binding import.

import { canonicalKey } from './canonical.mjs';
import { compareValues } from './order.mjs';

// MARK: - value semantics (wrapped-aware, native-faithful)

// Equal by the runtime's total .equals() for a wrapped value (exact, type-aware),
// else by canonical token so 1, 1n and "1" stay distinct among natives.
function valuesEqual(a, b) {
    if (a != null && typeof a.equals === 'function') return a.equals(b);
    if (b != null && typeof b.equals === 'function') return b.equals(a);
    return canonicalKey(a) === canonicalKey(b);
}

// MARK: - field access (getIn for wrapped, nested for native)

// Resolve a dotted (or array) path against a document. A wrapped Viper value is read
// through getIn at its default projection (encoded=true) — so a scalar leaf comes back
// native. getIn is strict (it throws on a missing or wrong-type step), so the throw is
// caught and mapped to undefined. A plain object is walked property by property.
// Returns undefined on any miss.
export function getField(doc, path) {
    const parts = Array.isArray(path) ? path : String(path).split('.');
    if (doc != null && typeof doc.getIn === 'function') {
        try { return doc.getIn(parts); } catch { return undefined; }
    }
    let current = doc;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

// MARK: - operator table

// Each entry compiles (operand, field-getter) -> (fieldValue -> boolean). $not/$where
// take a sub-spec / function; the rest take a plain operand.
const OPERATORS = {
    $eq: (operand) => (value) => valuesEqual(value, operand),
    $ne: (operand) => (value) => !valuesEqual(value, operand),
    // Order comparisons require the field to be PRESENT and non-nil: a missing (or
    // null) field never matches `> / >= / < / <=` — decoupled from compareValues'
    // total order (where nils sort last) so `{score: {$gt: 5}}` excludes a score-less
    // document rather than treating undefined as a large value.
    $gt: (operand) => (value) => value != null && compareValues(value, operand) > 0,
    $gte: (operand) => (value) => value != null && compareValues(value, operand) >= 0,
    $lt: (operand) => (value) => value != null && compareValues(value, operand) < 0,
    $lte: (operand) => (value) => value != null && compareValues(value, operand) <= 0,
    $in: (operand) => {
        const tokens = new Set(Array.from(iterableOperand('$in', operand), canonicalKey));
        return (value) => tokens.has(canonicalKey(value));
    },
    $nin: (operand) => {
        const tokens = new Set(Array.from(iterableOperand('$nin', operand), canonicalKey));
        return (value) => !tokens.has(canonicalKey(value));
    },
    $exists: (operand) => (value) => (value !== undefined) === Boolean(operand),
    $regex: (operand) => {
        const re = operand instanceof RegExp ? operand : new RegExp(operand);
        return (value) => value != null && re.test(String(value));
    },
    $where: (operand) => {
        if (typeof operand !== 'function') throw new TypeError('match: $where expects a function');
        return operand;
    },
    $not: (operand, field) => {
        const sub = compileCondition(operand, field);
        return (value) => !sub(value);
    },
};

// MARK: - compilation

const isPlainObject = (x) =>
    x !== null && typeof x === 'object' && !Array.isArray(x) &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);

const isIterable = (x) => x != null && typeof x[Symbol.iterator] === 'function';

// Validate a combinator / operator operand up front, with a clear message — so a
// malformed spec fails loudly at compile time instead of silently matching nothing.
function arrayOperand(op, operand) {
    if (!Array.isArray(operand)) throw new TypeError(`match: ${op} expects an array of sub-specs`);
    return operand;
}
function iterableOperand(op, operand) {
    if (!isIterable(operand)) throw new TypeError(`match: ${op} expects an iterable of values`);
    return operand;
}

// Compile the condition attached to one field. A plain object whose keys are ALL
// operators ($…) -> AND of those operators; a plain object with NO operator keys (or a
// scalar, array, or wrapped Viper value) -> implicit $eq literal. A plain object that
// MIXES operator and plain keys is a malformed condition (usually a typo'd operator)
// and throws — never silently degrades to an equality that matches nothing.
function compileCondition(cond, field) {
    if (isPlainObject(cond)) {
        const keys = Object.keys(cond);
        const operators = keys.filter((key) => key.startsWith('$'));
        if (operators.length && operators.length !== keys.length)
            throw new TypeError(
                `match: a condition cannot mix operators and plain keys (${keys.join(', ')})`);
        if (operators.length) {
            const tests = keys.map((op) => {
                const build = OPERATORS[op];
                if (!build) throw new TypeError(`match: unknown operator ${op}`);
                return build(cond[op], field);
            });
            return (value) => tests.every((test) => test(value));
        }
    }
    return OPERATORS.$eq(cond);
}

const andOf = (preds) => (doc) => preds.every((p) => p(doc));
const orOf = (preds) => (doc) => preds.some((p) => p(doc));

// Compile a full spec (a field map with $and/$or/$nor/$not at the top) into a doc
// predicate. A function spec passes through unchanged (escape hatch). A top-level key
// starting with $ that is not a known combinator throws — it is never mistaken for a
// field name.
function compileSpec(spec, field) {
    if (typeof spec === 'function') return spec;
    if (!isPlainObject(spec))
        throw new TypeError('match(spec): spec must be a plain object or a function');
    const clauses = [];
    for (const [key, operand] of Object.entries(spec)) {
        switch (key) {
            case '$and': clauses.push(andOf(arrayOperand('$and', operand).map((s) => compileSpec(s, field)))); break;
            case '$or': clauses.push(orOf(arrayOperand('$or', operand).map((s) => compileSpec(s, field)))); break;
            case '$nor': { const any = orOf(arrayOperand('$nor', operand).map((s) => compileSpec(s, field))); clauses.push((doc) => !any(doc)); break; }
            case '$not': { const sub = compileSpec(operand, field); clauses.push((doc) => !sub(doc)); break; }
            default: {
                if (key.startsWith('$'))
                    throw new TypeError(`match: unknown top-level operator ${key}`);
                const test = compileCondition(operand, field);
                clauses.push((doc) => test(field(doc, key)));
            }
        }
    }
    return andOf(clauses);
}

// match(spec, { field }) -> (doc) => boolean. `field` overrides the path accessor
// (default getField); useful when documents are [key, doc] pairs (pass a getter that
// reaches into the doc half) or use a bespoke shape.
export function match(spec, { field = getField } = {}) {
    return compileSpec(spec, field);
}
