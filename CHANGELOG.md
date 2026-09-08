# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Releasing a tag now publishes the GitHub Release too, in a separate job with
  only `contents: write`. Its body is the changelog section for the version, so
  a release whose changelog was never closed fails before anything is published.
  v0.1.1 reached npm and left the Releases tab announcing v0.1.0 as current.

### Fixed

- The release's provenance check no longer fails a release that worked. It now
  waits five minutes instead of one, tells "not on the registry yet" apart from
  "on it and unattested", and checks the provenance names this repository and
  workflow. Moved to `.github/scripts/verify-published-provenance.mjs` so it can
  be run by hand.

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
