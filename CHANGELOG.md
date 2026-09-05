# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0]

First working version. Not published to npm.

### Added

- `fakeSupabase(responder, storageError, lister)`, and an equivalent options
  object form.
- A recording query builder covering 28 PostgREST methods, exported as
  `CHAIN_METHODS`. The chain is recorded in the order it is built, and nothing is
  recorded until the query is awaited.
- Responder-driven answers: return an `Answer`, return `undefined` for "no
  opinion", or throw to simulate a dropped connection, which rejects the way
  PostgREST does.
- `count` on an answer, for head queries that return a tally and no rows.
- `rpc`, recorded as an ordinary call under `rpc:<function>`.
- `writes(table, op)` and `touched(table)` assertion helpers.
- Storage uploads, with a whole-bucket failure mode.
- `auth.admin.listUsers`, handed one page per call, with the requested pages
  recorded.
- `asClient<T>()`, so the cast to your client type lives at one call site.
- Types for everything, and no runtime dependencies.

[Unreleased]: https://github.com/damson/supabase-wiretap/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/damson/supabase-wiretap/releases/tag/v0.1.0
