# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- The release's provenance check no longer fails a release that worked. It
  waited 60 seconds against a read-through cache, and the `v0.1.1` release went
  red while the publish had in fact succeeded with correct provenance. It also
  could not distinguish "not visible on the registry yet" from "visible and
  unattested", and reported the second, which is a false supply-chain alarm. It
  now waits five minutes, asks the attestations endpoint directly, separates
  those two outcomes into different exit codes and messages, and additionally
  checks that the provenance names **this** repository and workflow rather than
  merely existing. It moved out of the workflow into
  `.github/scripts/verify-published-provenance.mjs` so it can be run by hand,
  which is the only way its outcomes get exercised anywhere but a release.

## [0.1.1] - 2026-09-08

No change to the package. Every line below is about how the tarball reaches the
registry, and the release exists so the new mechanism is exercised against the
real registry rather than only in review: a green workflow is not evidence that
a publish carried its provenance.

### Changed

- Releases publish over npm **trusted publishing**, not a stored token. The
  `NPM_TOKEN` secret is gone, and with it a long-lived credential that anything
  able to run a workflow in the `npm-publish` environment could have used.
  Nothing about the package changes: this is how the tarball gets to the
  registry, not what is in it.
- Provenance is generated automatically by a trusted publish, so `--provenance`
  came off both publish commands. The release now reads the attestation back off
  the registry afterwards and fails if it is missing, because a publish that
  succeeds unattested is the one outcome this change must not produce.
- The release job moves to Node 24 and installs a current npm. Trusted
  publishing needs npm 11.5.1 and Node 22.14.0, and Node 24.0.0 bundled npm
  11.3.0, so the version the runner happens to carry is not something to trust.
  The release guard now checks the npm version instead of checking for a token.

## [0.1.0]

First working version.

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

[Unreleased]: https://github.com/damson/supabase-wiretap/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/damson/supabase-wiretap/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/damson/supabase-wiretap/releases/tag/v0.1.0
