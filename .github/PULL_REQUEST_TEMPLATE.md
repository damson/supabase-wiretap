<!--
    ┌─────────────────────────────────────────────────────────────────────┐
    │  Base this on `develop`, not `main`. `main` carries releases and    │
    │  moves only through a release pull request. CONTRIBUTING.md has the │
    │  branching, the conventions, and how to run everything locally.     │
    └─────────────────────────────────────────────────────────────────────┘

    ALWAYS PRESENT, four sections, however small the change:
        🔭 High level summary · 📋 What changed · ✅ Test plan · 🔍 Review

    CONDITIONAL, two sections. Each is wrapped in its own comment block
    below. If it does not apply, DELETE the block outright, header and all.
    Never leave "N/A":
        🖼 Visual changes   (only if a person can see it)
        🎯 Scope            (only if it touches what the package is for)

    Small pull requests are welcome and so are draft ones. If you are unsure
    about an approach, open it early and ask.
-->

## 🔭 High level summary

<!--
    The shape of the change in a few sentences: what it does, why it is here,
    and anything a reviewer needs to know before the detail below makes sense.

    Aim at the level someone wants before opening the diff, not a restatement of
    it:
    "Records calls in order rather than keeping only the last one, so a test can
    assert on a sequence. Additive: nothing already written against the package
    changes behaviour."
-->

## 📋 What changed

<!--
    The change itself, grouped if it touches several things. Link the issue it
    closes.
-->

<!--
    ═══ CONDITIONAL, DELETE THIS BLOCK IF NOTHING VISIBLE CHANGED ═══

## 🖼 Visual changes

    For the README banner or the social preview card. Both come from
    `.github/social-preview/`, and one file does both jobs, so a change to one
    is a change to the other.

    | Before | After |
    |---|---|
    | ![before](url) | ![after](url) |
-->

## ✅ Test plan

<!--
    Say what you ran and what it said, not just that it passed. A number that
    moved is worth more than a tick.
-->

- [ ] `npm run verify` passes locally (typecheck, tests, coverage thresholds)
- [ ] New behaviour has a test that **fails without the change**, and I watched
      it fail
- [ ] Coverage is still 100%, or this says which line is uncovered and why
- [ ] README updated, if the change is visible to someone using the package

<!--
    ═══ CONDITIONAL, DELETE THIS BLOCK IF IT DOES NOT APPLY ═══

## 🎯 Scope

    The package records the calls a test can assert on. It does not simulate a
    database, and that is a design stance rather than an unfinished feature.

- [ ] This does not make the package store rows and answer queries from them
- [ ] If it adds a builder method, `CHAIN_METHODS` and `compat.test.ts` both
      know about it
-->

## 🔍 Review

- [ ] CI is green, or this names the check that is red and why
- [ ] Review comments re-read after each push, and each one either addressed or
      answered with a reason
- [ ] Docs updated where behaviour changed, in the same pull request

<!--
    Thank you for this. Corrections to the reasoning are welcome and do not need
    code attached.
-->
