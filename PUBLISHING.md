# Before this is published

Nothing here is published, and nothing in the repository can publish itself.
`package.json` carries `"private": true`, which makes `npm publish` refuse
outright while leaving `npm pack` working, so the build stays verifiable without
a foot-gun next to it.

Four decisions are open, all of them the maintainer's:

1. **The name.** `supabase-call-recorder` is a working name, chosen because it
   states the design stance. It is unclaimed on the registry as of this writing,
   but that is worth rechecking, and a scoped name under an existing
   organisation may be preferable.
2. **The licence.** There is no `LICENSE` file and `package.json` says
   `UNLICENSED`, deliberately: picking between MIT and Apache-2.0 is a project
   decision, not a packaging one. Apache-2.0 carries an explicit patent grant;
   MIT is shorter and more common for a package this size.
3. **Whether the source project consumes it or keeps its copy.** The extracted
   API is a superset of the original: the same positional signature, plus an
   options object, plus `asClient<T>()`, plus a wider set of recorded builder
   methods. Adopting it is an import change and the removal of one file. Keeping
   the copy is also fine, and costs only the drift.
4. **Where it lives.** Personal account or organisation, and under which
   repository name.

## Identities

The `author` field, which goes to the registry with the package, is
`devddagnet@gmail.com`. Git commits use `damson@users.noreply.github.com`, set
locally in this repository. The two are deliberately separate, and neither is
the address the origin project's commits carry.

## The steps, in order, when those are settled

```sh
# 1. confirm the author address in package.json
# 2. add LICENSE, set the matching "license" field in package.json
# 3. remove "private": true
npm run verify        # typecheck, 100% coverage, build
npm pack              # inspect the tarball contents one more time
npm publish --dry-run # prints exactly what would be uploaded, uploads nothing
npm publish --access public
```

`npm publish --dry-run` is the last checkpoint that still costs nothing. A
version published to the registry cannot be replaced, only deprecated.
