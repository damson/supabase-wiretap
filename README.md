# supabase-call-recorder

[![CI](https://github.com/damson/supabase-call-recorder/actions/workflows/ci.yml/badge.svg)](https://github.com/damson/supabase-call-recorder/actions/workflows/ci.yml)
[![coverage 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](#how-it-is-tested)
[![licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![node >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](#requirements)
[![types included](https://img.shields.io/badge/types-included-blue)](#typescript)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

**Test the code that talks to your Supabase database, without a database.**

You give it the answers your test wants. It gives you back a list of everything
your code asked for, so you can check that the right row was written, with the
right values, to the right table.

No container to start. No fixtures to reset. Tests run in milliseconds.

```ts
import { fakeSupabase } from 'supabase-call-recorder';

// 1. Decide what the database "says" back.
const fake = fakeSupabase(() => ({ data: [{ id: 'e1' }], error: null }));

// 2. Run your code against it.
await approveEntry('e1', fake.asClient<SupabaseClient>());

// 3. Check what your code tried to do.
expect(fake.writes('entries', 'insert')).toEqual([{ lemma: 'kaz', approved: true }]);
expect(fake.touched('audit_log')).toBe(true);
```

New here? Jump to [Your first test](#your-first-test). It assumes nothing.

---

## Contents

- [Why you might want this](#why-you-might-want-this)
- [Requirements](#requirements)
- [Install](#install)
- [Your first test](#your-first-test)
- [The idea behind it](#the-idea-behind-it)
- [Cookbook](#cookbook)
- [API reference](#api-reference)
- [TypeScript](#typescript)
- [What it deliberately does not do](#what-it-deliberately-does-not-do)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Licence](#licence)

## Why you might want this

If your project uses Supabase, there is probably a layer of code that reads and
writes rows: server actions, route handlers, background jobs. It is often the
least tested code in the whole repository, and usually for one reason. Testing it
seems to need a database.

Here is what changes when it does not.

**Your tests get fast.** No container to boot, no schema to load, no rows to
clean up between cases. Every example in this README runs in under a
millisecond.

**You can test the failure paths.** The interesting cases are the ones that are
awkward to arrange for real: the network drops, the row is missing, permission is
denied, the storage bucket is gone. Here each of them is one line.

**You assert on the decision, not the round trip.** "Did it write the reviewer's
id onto the entry?" is a question about your code. It does not need Postgres to
answer, and answering it against Postgres mostly tests Postgres.

**You can assert that something did NOT happen.** When your validation rejects a
submission, nothing is written anywhere, so there is no row to look for. Being
able to say "this table was never touched" turns an untestable guarantee into a
one-line check.

**It stays out of your way.** One function, no configuration file, no global
setup, no dependencies, and it works with whichever test runner you already use.

## Requirements

Node 20 or newer, and ESM only: there is no CommonJS build, so a test runner that
cannot `import` an ES module cannot load this.

Nothing in it is tied to a particular runner. It is a plain function returning a
plain object, so Vitest and `node:test` use it as is. Jest needs its own ESM
support turned on, which is a Jest configuration matter rather than anything this
package can fix.

You do not need `@supabase/supabase-js` installed for this to work. It is not a
dependency, and not a peer dependency.

## Install

```sh
npm install --save-dev supabase-call-recorder
```

## Your first test

Say you have a function that approves an entry. It writes a row and updates
another one.

```ts
// src/approve.ts
export async function approveEntry(id: string, client: SupabaseClient) {
  const { data, error } = await client.from('review_items').select('*').eq('id', id).single();
  if (error) throw new Error('could not load the item');

  await client.from('entries').insert({ lemma: data.lemma, approved: true });
  await client.from('review_items').update({ status: 'approved' }).eq('id', id);
}
```

A test for it, step by step.

**Step 1: make a recorder, and tell it what to answer.**

The function you pass is called for every query. It receives the call, and
returns what the database should reply with.

```ts
import { fakeSupabase } from 'supabase-call-recorder';

const fake = fakeSupabase(() => ({ data: { lemma: 'kaz' }, error: null }));
```

**Step 2: run your code against `fake.asClient()`.**

```ts
await approveEntry('r1', fake.asClient<SupabaseClient>());
```

`asClient<T>()` hands you the recorder typed as whatever your function expects.
There is more on that in [TypeScript](#typescript), and you can ignore it
entirely if you are not using TypeScript.

**Step 3: check what your code did.**

```ts
expect(fake.writes('entries', 'insert')).toEqual([{ lemma: 'kaz', approved: true }]);
expect(fake.writes('review_items', 'update')).toEqual([{ status: 'approved' }]);
```

That is a complete test. Put together:

```ts
import { describe, expect, it } from 'vitest';
import { fakeSupabase } from 'supabase-call-recorder';
import { approveEntry } from './approve';

describe('approveEntry', () => {
  it('writes the entry and marks the review item approved', async () => {
    const fake = fakeSupabase(() => ({ data: { lemma: 'kaz' }, error: null }));

    await approveEntry('r1', fake.asClient<SupabaseClient>());

    expect(fake.writes('entries', 'insert')).toEqual([{ lemma: 'kaz', approved: true }]);
    expect(fake.writes('review_items', 'update')).toEqual([{ status: 'approved' }]);
  });

  it('gives up when the item cannot be loaded', async () => {
    const fake = fakeSupabase(() => ({ data: null, error: { message: 'not found' } }));

    await expect(approveEntry('r1', fake.asClient<SupabaseClient>())).rejects.toThrow();

    // Nothing was written. There is no row to go looking for, so this is the
    // only way to state it.
    expect(fake.touched('entries')).toBe(false);
  });
});
```

## The idea behind it

There is a fork in the road when you write a test double for a database, and
this package takes the less obvious branch on purpose.

The tempting branch is to build something that behaves like a small database:
keep the rows you insert in a Map, and answer `select` out of them. It feels
right, and it works for about a week. Then it has to grow filters. Then operator
precedence on those filters. Then ordering, then null sorting, then the count
modes, then joined selects like `select('*, meanings(*)')`.

Every one of those additions is a guess about what PostgREST and Postgres would
have done. When the guess is right, your test passes and confirms something you
already believed. When the guess is wrong, **your test still passes**, because
your code and your fake agree with each other while both of them disagree with
the real database. You now maintain a second, less correct database whose only
user is your test suite.

So this one does not store anything and cannot be queried back. It records what
your code asked for, and answers from the function you gave it.

What that leaves you asserting on is the part that is actually yours: the row
that would reach `entries`, the filter that would scope the read, the audit
record that would be written alongside it, and the write that must not happen
when validation fails. Those are decisions your code makes. They are worth
testing, and none of them needs a database to be true.

What it cannot tell you is whether a column name is real, whether your SQL means
what you think, or whether a constraint would reject the row. Nothing that runs
without Postgres can tell you that, and a double that appears to is the problem
rather than the solution. Keep one slower suite, or one CI job, that runs against
a real database and owns those questions. This owns the rest, which is most of
them.

## Cookbook

### The responder: one function answers everything

The responder is called once per query, with the call. Return an answer, or
return nothing to mean "no opinion", which is answered with
`{ data: null, error: null }`.

```ts
import { fakeSupabase, type Responder } from 'supabase-call-recorder';

const responder: Responder = (call) => {
  if (call.table === 'review_items') return { data: [{ id: 'r1' }], error: null };
  if (call.table === 'profiles') return { data: null, error: { message: 'denied' } };
  return undefined; // everything else answers with nothing, and that is fine
};

const fake = fakeSupabase(responder);
```

Because the responder sees the whole call, it can answer on the filters too:

```ts
const responder: Responder = (call) =>
  call.ops.some(([op, col, value]) => op === 'eq' && col === 'status' && value === 'pending')
    ? { data: [{ id: 'r1' }], error: null }
    : { data: [], error: null };
```

Need different answers in sequence? A closure is enough:

```ts
const answers = [{ data: [{ id: 'r1' }], error: null }, { data: [], error: null }];
const fake = fakeSupabase(() => answers.shift());
```

### Asserting on the query itself

Every awaited query is recorded in `fake.calls`, in the order it resolved, with
the chain in the order it was built.

```ts
await nextPendingId(fake.asClient<SupabaseClient>(), { sort: 'score', excludeId: 'r1' });

expect(fake.calls[0].table).toBe('review_queue');
expect(fake.calls[0].ops).toContainEqual(['neq', 'id', 'r1']);
expect(fake.calls[0].ops.filter(([op]) => op === 'order').map(([, col]) => col)).toEqual([
  'confidence_score',
  'created_at',
]);
```

That last assertion says "it orders by score, then breaks ties on `created_at`",
which is the kind of thing that is usually written as a comment and then quietly
stops being true.

Nothing is recorded until the chain is awaited, which is also when PostgREST
actually issues the request.

### When the connection drops

Supabase reports a query error by filling in `error`, and reports a dropped
connection by rejecting the promise. Those are two different paths through your
code, and most test suites can only ever reach the first one.

A responder that throws gives you the second:

```ts
it('shows the outage banner instead of an empty queue', async () => {
  const fake = fakeSupabase(() => {
    throw new Error('fetch failed');
  });

  await expect(loadQueue(fake.asClient<SupabaseClient>())).resolves.toEqual({ outage: true });
});
```

A responder that returns an error gives you the first:

```ts
const fake = fakeSupabase(() => ({ data: null, error: { message: 'permission denied' } }));
```

The call is recorded either way, so "it did try" still holds on the failing path.

### Counting rows

A count query is `select('id', { count: 'exact', head: true })`. It returns no
rows at all, and the number arrives beside them, so an answer can carry `count`:

```ts
const fake = fakeSupabase((call) =>
  call.table === 'review_queue' ? { data: null, error: null, count: 544 } : undefined,
);

render(await QueuePage({ searchParams: {} }));
expect(screen.getByText('544 waiting')).toBeVisible();
```

### Stored procedures (`rpc`)

An `rpc` call is recorded like any other, under the table name `rpc:<function>`,
with its arguments as the single operation. This matters most for role checks:
you can answer one, or make it fail, without stubbing the helper that wraps it
and losing the branch that reads the answer.

```ts
const fake = fakeSupabase((call) =>
  call.table === 'rpc:current_app_role' ? { data: 'reviewer', error: null } : undefined,
);

await expect(requireAdmin(fake.asClient<SupabaseClient>())).rejects.toThrow('insufficient role');
expect(fake.calls[0].ops).toEqual([['rpc']]);
```

A throwing responder rejects the `rpc` too, so the connection-failure path is
reachable there as well.

### `writes()` and `touched()`

`writes(table, op)` gives you the payload of every write, in order. This is the
assertion that earns its keep most often: not "the function returned true", but
"this exact row would have reached the table".

```ts
it('records the reviewer and the reason on the entry it writes', async () => {
  const fake = fakeSupabase(() => ({ data: [{ id: 'e1' }], error: null }));

  await approve('r1', 'u-reviewer', fake.asClient<SupabaseClient>());

  expect(fake.writes('entries', 'insert')).toEqual([
    { lemma: 'kaz', origins: ['fr'], approved_by: 'u-reviewer' },
  ]);
  expect(fake.writes('review_items', 'update')).toEqual([{ status: 'approved' }]);
});
```

`touched(table)` answers the negative, which is otherwise very hard to test. A
rejected submission leaves no row anywhere, so the only evidence the guard held
is that the table was never reached.

```ts
it('writes nothing at all when the origin list is empty', async () => {
  const fake = fakeSupabase(() => ({ data: null, error: null }));

  await expect(
    submit({ lemma: 'kaz', origins: [] }, fake.asClient<SupabaseClient>()),
  ).rejects.toThrow();

  expect(fake.touched('entries')).toBe(false);
  expect(fake.touched('entry_revisions')).toBe(false);
});
```

### Storage uploads

Uploads are recorded, and the whole bucket can be made to fail so the code that
runs when the object is not there becomes reachable:

```ts
const ok = fakeSupabase();
await handleUpload(file, ok.asClient<SupabaseClient>());
expect(ok.uploads).toEqual([{ bucket: 'imports', path: 'batch/1.csv', contentType: 'text/csv' }]);

const broken = fakeSupabase(undefined, { message: 'bucket not found' });
await expect(handleUpload(file, broken.asClient<SupabaseClient>())).resolves.toEqual({
  saved: false,
});
expect(broken.uploads).toEqual([]);
```

### Listing accounts (`auth.admin.listUsers`)

Handed one page per call, so you can describe a short page, a full page at the
ceiling, or a failure, without knowing how your code walks the pager:

```ts
const fullThenShort: AccountLister = (page, perPage) =>
  page === 1
    ? { users: Array.from({ length: perPage }, (_, i) => ({ id: `u${i}` })) }
    : { users: [{ id: 'last' }] };

const fake = fakeSupabase(undefined, null, fullThenShort);
await collectAccounts(fake.asClient<SupabaseClient>());
expect(fake.listedPages).toEqual([1, 2]);
```

## API reference

### `fakeSupabase(responder?, storageError?, lister?)`

Also accepts a single options object, which reads better when you only care about
one of them:

```ts
const fake = fakeSupabase({ lister: myLister });
```

Everything is optional. `fakeSupabase()` answers every query with
`{ data: null, error: null }`, which is often all you need from the tables your
test does not care about.

| Argument | Type | What it does |
|---|---|---|
| `responder` | `(call) => Answer \| undefined` | Answers every query and `rpc`. Return `undefined` for "no opinion". Throw to simulate a dropped connection. |
| `storageError` | `{ message } \| null` | When set, every upload fails with it and none are recorded. |
| `lister` | `(page, perPage) => AccountPage` | Backs `auth.admin.listUsers`, one page per call. |

### What comes back

| Field | Type | What it holds |
|---|---|---|
| `client` | object | The recorder. Pass it where the real client goes. |
| `asClient<T>()` | `() => T` | The same object, typed as whatever your code expects. |
| `calls` | `Call[]` | Every awaited query, in resolution order. |
| `writes(table, op)` | `unknown[]` | The payload of each `insert`, `upsert`, `update` or `delete` on `table`. |
| `touched(table)` | `boolean` | Whether `table` was reached at all. |
| `uploads` | `Upload[]` | Every accepted storage upload. |
| `listedPages` | `number[]` | Which `listUsers` pages were requested, in order. |

### `Call`

```ts
interface Call {
  table: string;                    // the table, or `rpc:<function>`
  ops: [string, ...unknown[]][];    // the chain, in the order it was built
}
```

### `Answer`

```ts
interface Answer {
  data: unknown;
  error: unknown;
  count?: number | null;   // for head queries
}
```

### Which builder methods are recorded

`select` `insert` `upsert` `update` `delete` `eq` `neq` `gt` `gte` `lt` `lte`
`like` `ilike` `is` `in` `contains` `containedBy` `overlaps` `match` `not` `or`
`filter` `order` `limit` `range` `single` `maybeSingle` `returns`

Exported as `CHAIN_METHODS`. A method that is not on the list does not exist on
the recorder, so calling it fails loudly rather than being silently dropped. That
is on purpose. If you need one that is missing, it is a one-word change plus a
test, and a [pull request](CONTRIBUTING.md) is very welcome.

## TypeScript

Types ship with the package, so there is nothing to install alongside it.

`client` is typed as the subset this actually implements, which is deliberately
not `SupabaseClient`. Use `asClient<T>()` at the boundary:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

await myServerAction(fake.asClient<SupabaseClient>());
```

It is a cast, and it is honest about being one. This records part of the client
surface, and the cast is where you accept that. Keeping it to a single call site
per test is the whole point of the helper.

## What it deliberately does not do

- **No query semantics.** Filters are recorded, never applied. `eq` does not
  narrow anything, because there is nothing to narrow.
- **No stored rows.** Nothing you insert can be selected back. A test that needs
  that is really testing the database, and belongs in the suite that has one.
- **No realtime, no edge functions, no `storage.download` or `remove`.** They are
  absent rather than stubbed, so a gap shows up as a missing method instead of as
  a silent success.
- **No assertion helpers beyond `writes` and `touched`.** `calls` is a plain
  array, and your test framework already has better matchers than anything that
  could ship here.

## FAQ

**Do I need Supabase installed?**
No. This has no dependencies at all, and does not import `@supabase/supabase-js`.

**Will it work with Jest?**
The API will. The loading might need work, because this package is ESM only and
Jest needs its ESM support enabled. Vitest and `node:test` need nothing.

**My code calls a method that is not recorded and the test explodes.**
That is the intended behaviour rather than a bug: silently dropping a call would
make your test pass for the wrong reason. Open an issue, or add the method to
`CHAIN_METHODS` and send a pull request.

**Can I check that a query was NOT made?**
Yes, that is what `touched(table)` is for. For something finer, `calls` is a
plain array and `some`, `filter` and `find` all work on it.

**How do I simulate a slow query or a timeout?**
Return a rejected promise from the code under test's perspective by throwing in
the responder. For an actual delay, wrap the call site in your runner's fake
timers. This package is synchronous by design.

**Is this an official Supabase project?**
No. It is an independent package, not affiliated with or endorsed by Supabase.

### How it is tested

The suite covers 100% of statements, branches, functions and lines, and the
threshold is enforced in the Vitest config rather than checked by hand, so it
cannot quietly slip. CI additionally packs the tarball, installs it into a clean
directory and imports it, so "it builds" means the published artefact was
actually loaded and run.

## Contributing

Contributions are genuinely welcome, including the small ones: a missing builder
method, a confusing sentence in this README, a use case that does not fit. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to get set up, which is three commands.

Everyone taking part is asked to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

[MIT](LICENSE). Copyright 2026 Damien D.
