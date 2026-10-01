# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The Node floor the package publishes and the Node floor it is developed on are
  now separate numbers, and each is proved by the thing it is about. The
  published floor stays at 20: a job installs the packed tarball on Node 20 with
  none of this repository's tooling present, which is what a person installing
  the package actually does. The development floor is 22, because
  `@supabase/supabase-js` requires it and the test runner does too, and the test
  matrix had been running Node 20 against them while npm reduced the mismatch to
  a warning. A test now fails when any devDependency declares a Node the matrix
  does not run.

- Releasing a tag now publishes the GitHub Release too, in a separate job with
  only `contents: write`. Its body is the changelog section for the version, and
  the pre-publish gate reads that section as well, so a release whose changelog
  was never closed is refused while refusing still costs nothing. v0.1.1 reached
  npm and left the Releases tab announcing v0.1.0 as current.
- The two release scripts are covered by the test suite, so `npm run verify`
  checks them on every pull request. Until now their decisions were exercised
  only by running them by hand, and the outcomes that matter are the ones a
  release cannot rehearse: a live package that landed unattested, provenance
  naming somewhere else, a changelog that was never closed. The provenance
  check's exit codes and its poll loop are covered too, against a stub registry
  that answers late on purpose, because reporting a still-propagating publish as
  unattested is the specific way it failed before. The release's step ORDER is
  covered as well, which no test of a script can see: the changelog has to be
  read before the publish, and a reader added after it would be the same bug
  under a different name.

### Fixed

- The release's provenance check no longer fails a release that worked. It now
  waits five minutes instead of one, tells "not on the registry yet" apart from
  "on it and unattested", and checks the provenance names this repository and
  workflow. Moved to `.github/scripts/verify-published-provenance.mjs` so it can
  be run by hand.
- A first release's GitHub Release body no longer carries the changelog's
  link-reference definitions. The notes ran from a version's heading to the next
  one, and the oldest section has nothing after it but that block, so the whole
  of it was read as part of the body.

## [0.1.1] - 2026-09-08

No change to the package. Only how it reaches the registry.

### Changed

- Publishing uses npm trusted publishing over OIDC. No credential is stored
  anywhere; the `NPM_TOKEN` secret is gone.
- Provenance is now automatic, so `--provenance` came off. The release reads the
  attestation back off the registry and fails if it is missing.
- The release job runs Node 24 and a current npm. Trusted publishing needs npm
  11.5.1, and Node 24.0.0 bundles 11.3.0, so the guard checks the version rather
  than trusting the image.

## [0.1.0] - 2026-09-08

First working version.

### Added

- `fakeSupabase(responder, storageError, lister)`, and an options object form.
- A recording query builder over 28 PostgREST methods, exported as
  `CHAIN_METHODS`. Recorded in the order the chain is built, and not until the
  query is awaited.
- Responder-driven answers: return an `Answer`, return `undefined` for "no
  opinion", or throw to reject the way PostgREST does.
- `count` on an answer, for head queries that return a tally and no rows.
- `rpc`, recorded under `rpc:<function>`.
- `writes(table, op)` and `touched(table)` assertion helpers.
- Storage uploads, with a whole-bucket failure mode.
- `auth.admin.listUsers`, one page per call, with the requested pages recorded.
- `asClient<T>()`, so the cast to your client type lives at one call site.
- Types for everything, and no runtime dependencies.

[Unreleased]: https://github.com/damson/supabase-wiretap/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/damson/supabase-wiretap/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/damson/supabase-wiretap/releases/tag/v0.1.0
