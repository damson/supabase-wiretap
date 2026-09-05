# Security policy

## Supported versions

The project is at `0.x`. Fixes go onto the latest release, and there are no
backports yet.

## Reporting a vulnerability

Please do not open a public issue.

Use GitHub's private vulnerability reporting on this repository: go to the
**Security** tab, then **Report a vulnerability**. It creates a private thread
visible only to the maintainers.

If that is unavailable to you, email `devddagnet@gmail.com` with the details and
a way to reach you.

Expect an acknowledgement within a week. You will be credited in the release
notes for the fix unless you would rather not be.

## Scope, honestly

This is a test double. It runs in test suites, holds no credentials, opens no
sockets, reads no files and has no dependencies, so the realistic attack surface
is small. The things worth reporting anyway:

- anything that would let this package execute code a test did not ask it to
  execute;
- anything that could make it reach a real database or network, which it should
  never do;
- a supply chain problem with the published tarball, such as content that does
  not match this repository.

Reports about the behaviour of Supabase itself belong with
[Supabase](https://github.com/supabase/supabase/security/policy) rather than
here.
