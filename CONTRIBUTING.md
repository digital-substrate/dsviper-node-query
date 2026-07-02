# Contributing to dsviper-node-query

Thanks for your interest in contributing.

## Reporting issues

Use [GitHub Issues](https://github.com/digital-substrate/dsviper-node-query/issues).
Useful reports include:

- The `@digitalsubstrate/dsviper-query` and `@digitalsubstrate/dsviper`
  versions, and your platform / Node version.
- A minimal reproducer (typically a failing test).

## Submitting pull requests

1. Fork the repository and create a feature branch from the default branch
   (see the project's branch policy).
2. Keep the core modules **pure** — `src/source.mjs`, `src/canonical.mjs` and
   `src/verbs.mjs` duck-type on `hashKey`/`compare` and must NOT import the binding,
   so they unit-test without it. Only the integration tests touch
   `@digitalsubstrate/dsviper`.
3. Add tests under `test/` with the built-in `node:test` runner and `node:assert`;
   run `npm test` and make sure everything passes.

## Design notes

This is a **consumer-side** layer: it adds nothing to the binding. Native Node 22+
iterator-helper chaining is the query surface; the package supplies only the bridges
the stateful verbs need (`canonicalKey`/`hashKey` for grouping, dedup, join and
set-ops; the total `.compare()` for ordering).

`query()` accepts **only an immutable `CommitState`** — a database at a fixed
commitId, whose `keys()`/`get()` see one frozen snapshot. Mutable sources are
rejected by design (no consistent snapshot at this layer); snapshot to a
`CommitState` first.

## Requirements

Node.js >= 22 (iterator helpers, `Map.groupBy`); `@digitalsubstrate/dsviper` >= 1.2.2
(the `value.hashKey()` bridge).

## License

By contributing you agree your contributions are licensed under the project's MIT
License (inbound = outbound). No CLA required.
