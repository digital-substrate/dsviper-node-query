// canonicalKey — a primitive token for value-keyed native collections.
//
// JS Map/Set key by identity (SameValueZero) and call no custom hash/equals, so
// grouping, deduplicating or joining wrapped values BY VALUE needs a primitive token.
// For a wrapped Viper value, value.hashKey() (a type-aware bigint). For an already-
// decoded native scalar, a type-tagged string so 1, 1n and "1" do not collide.
//
// Duck-typed on hashKey, so this module carries no binding import and runs under a
// fake in unit tests. hashKey is a hash: collisions are possible (negligible at
// realistic cardinalities), unlike a lossless serialization.

export function canonicalKey(value) {
    if (value != null && typeof value.hashKey === 'function') return value.hashKey();
    return nativeToken(value);
}

function nativeToken(value) {
    if (value === null || value === undefined) return 'nil';
    switch (typeof value) {
        case 'bigint': return 'big:' + value;
        case 'number': return 'num:' + value;
        case 'string': return 'str:' + value;
        case 'boolean': return 'bool:' + value;
        default: return 'obj:' + String(value);
    }
}
