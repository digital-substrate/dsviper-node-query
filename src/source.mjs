// query — the lazy [key, document] source over an IMMUTABLE CommitState.
//
// A CommitState is a database at a fixed commitId: frozen, content-addressed,
// referentially transparent. The query is therefore lazy AND consistent — keys() and
// get() see the same frozen snapshot, so a downstream take(n) pulls only what it needs
// and nothing can change underneath.
//
// Mutable sources (CommitMutableState, Database) are intentionally NOT accepted: their
// store can change between keys() and get() — a document deleted in between would be
// silently dropped — and there is no atomic snapshot at this layer. To query live
// state, take a CommitState first (CommitState.state(commitDatabase, commitId), the
// runtime's atomic snapshot) and query that.

export function query(state, attachment, { keyPred = null, encoded = true } = {}) {
    if (state == null || typeof state.attachmentGetting !== 'function' || typeof state.commitId !== 'function')
        throw new TypeError(
            'query(state, attachment): state must be an immutable CommitState. ' +
            'Snapshot a mutable source first — CommitState.state(commitDatabase, commitId).');
    return Iterator.from(rows(state.attachmentGetting(), attachment, { keyPred, encoded }));
}

// Internal lazy generator over the frozen read surface. Not exported: the public
// contract is query(CommitState), so a mutable AttachmentGetting cannot sneak in.
// keyPred rejects a key BEFORE its get() (key-pushdown: zero get() on a rejected key);
// nil documents are skipped, the same shape as enumerate().
function* rows(attachmentGetting, attachment, { keyPred, encoded }) {
    for (const key of attachmentGetting.keys(attachment)) {
        if (keyPred && !keyPred(key)) continue;
        const document = attachmentGetting.get(attachment, key);
        if (!document.isNil()) yield [key, document.unwrap(encoded)];
    }
}
