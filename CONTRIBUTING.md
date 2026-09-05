# Contributing

Thanks for being here. Issues, questions and pull requests are all welcome, and
so are the small ones: a missing builder method, a sentence in the README that
did not make sense, a use case that does not fit. If you are unsure whether
something is worth raising, it is.

## Getting set up

Three commands, and you need nothing beyond Node 20 or newer.

```sh
git clone https://github.com/damson/supabase-wiretap.git
cd supabase-wiretap
npm install
```

Then:

```sh
npm test           # run the suite
npm run test:watch # rerun as you edit
npm run verify     # typecheck, coverage thresholds, build. What CI runs.
```

`npm run verify` is the one to run before opening a pull request. If it passes
locally it will almost certainly pass in CI.

## Branching

Two long-lived branches, and neither is ever committed to directly.

- **`develop`** is the default branch and where everything integrates. Cut your
  branch from it, and open your pull request against it.
- **`main`** carries releases. It moves only through a release pull request from
  `develop`.

```sh
git switch develop
git pull
git switch -c my-change
```

Two rules follow from that, and both have cost real projects real time:

- **Ordinary pull requests into `develop` are squashed.** One commit per logical
  change keeps the history readable.
- **A release pull request, `develop` into `main`, is merged with a merge
  commit.** Never squashed, never rebased. A squash is not the commits it
  squashed, so squashing a release makes every commit in it look permanently
  unmerged, and the next release then conflicts with its own history.

## The one rule that shapes the code

**Record the calls. Never simulate a database.**

If a change would make this able to answer a query from rows it stored earlier,
it is out of scope, however convenient it looks. The reasoning is in the README
under [The idea behind it](README.md#the-idea-behind-it). Everything else is
open to discussion.

## Adding a builder method

The most common contribution, and the easiest. Add the name to `CHAIN_METHODS`
in `src/index.ts`, in roughly the order PostgREST documents it. The existing test
already loops over the whole list, so it is covered the moment you add it. Then
add a line to the method list in the README.

If you are adding it because your own code needed it, please also add a call
chain that uses it to `src/compat.test.ts`. That file is typed against the real
`SupabaseClient`, so it is the only place where "real code needs this" is
actually asserted rather than assumed.

## The two test files

- `src/index.test.ts` calls the recorder directly. Fast, exhaustive, and it
  agrees with itself by construction: it can only exercise methods the package
  already has.
- `src/compat.test.ts` writes the code a real project writes, typed with
  `SupabaseClient` from `@supabase/supabase-js`, and runs it against the
  recorder. This is where a gap between this package and the real API surfaces.
  `@supabase/supabase-js` is a devDependency for that file alone; the published
  package still has no dependencies of any kind.

## Coverage

The project holds 100% on statements, branches, functions and lines, and the
thresholds are enforced in `vitest.config.ts` rather than by convention. This is
not perfectionism for its own sake: the package is about 250 lines, so anything
uncovered is a branch someone chose not to look at.

If you add a branch, add the test that reaches it. If a branch genuinely cannot
be reached, that is usually a sign it should not exist.

## Style

There is no linter to argue with. Match the file you are editing.

Comments explain **why**, not what. The code says what it does; the comment is
for the reasoning that would otherwise be lost, especially where something looks
wrong until you know the reason.

Prose in this repository, including commit messages, avoids em-dashes. Colons,
commas and full stops do the same work.

## Commits and pull requests

- One logical change per commit.
- Write the subject line as what the change achieves, not how.
- No AI attribution or generated-with markers, please, in commits or pull request
  descriptions.
- Describe what you changed, why, and how you checked it. "Ran `npm run verify`"
  is a fine test plan for most changes.

## Reporting a bug

A failing test is the best bug report there is, and this package is small enough
that writing one is usually quicker than describing the problem. Otherwise the
issue template will ask for the version, the code you ran, what you expected and
what happened.

## Security

Please do not open a public issue for a security problem. See
[SECURITY.md](SECURITY.md).

## Code of Conduct

Everyone taking part is asked to follow the
[Code of Conduct](CODE_OF_CONDUCT.md). Be kind, assume good faith, and give
people room to be new at something.
