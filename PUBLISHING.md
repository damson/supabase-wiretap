# Before this is published

The repository is private and nothing is on npm. `package.json` carries
`"private": true`, which makes `npm publish` refuse outright while leaving
`npm pack` working, so the build stays verifiable without a foot-gun next to it.

Settled already: the licence is MIT, the code and docs are written for strangers,
and CI runs on every push.

## Identities

The `author` field, which goes to the registry with the package, is
`devddagnet@gmail.com`. Git commits use `damson@users.noreply.github.com`, set
locally in this repository. The two are deliberately separate.

## Still open

1. **The name.** `supabase-call-recorder` is a working name, chosen because it
   states the design stance. It was unclaimed on the registry when this was
   written, which is worth rechecking, and a scoped name under an organisation
   may be preferable.
2. **Whether the origin project consumes this or keeps its own copy.** The
   extracted API is a superset of the original, so adopting it is an import
   change and the removal of one file. Keeping the copy is also fine, and costs
   only the drift.

Both are tracked as issues on this repository, along with everything else that
has to happen before the repository goes public.

## Publishing, when those are settled

```sh
npm run verify        # typecheck, 100% coverage, build
npm pack              # inspect the tarball contents
npm publish --dry-run # prints exactly what would be uploaded, uploads nothing
```

Then, and only then:

```sh
# remove "private": true from package.json first
npm publish --access public
```

`npm publish --dry-run` is the last checkpoint that still costs nothing. A
version published to the registry cannot be replaced, only deprecated.
