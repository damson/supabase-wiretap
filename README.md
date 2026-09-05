# supabase-call-recorder

A recording stand-in for the [supabase-js](https://github.com/supabase/supabase-js)
query builder. It records the calls your code makes, and answers them with
whatever the test decides. It never simulates a database.

Roughly 200 lines, no dependencies, no peer dependency on `@supabase/supabase-js`.

```ts
const fake = fakeSupabase(() => ({ data: [{ id: 'e1' }], error: null }));

await approve('r1', fake.asClient<SupabaseClient>());

expect(fake.writes('entries', 'insert')).toEqual([{ lemma: 'kaz', origins: ['fr'] }]);
expect(fake.touched('entry_revisions')).toBe(true);
```

## The stance: record the calls, never simulate a database

Server code that talks to Supabase tends to be the least tested code in a
project, and not because it is hard to reason about. It is untested because
reaching it means standing up a database. So the usual answers are to spin up a
container per suite, which is slow enough that people stop running it, or to
write a fake that stores rows in a Map and answers `select` out of them.

The second answer is the trap this package exists to refuse.

A fake that can be queried back has to grow filters, then operator precedence on
those filters, then ordering, then null sorting, then the count modes, then
foreign key expansion in `select('*, meanings(*)')`. Each addition is a guess
about PostgREST's semantics. When the guess is right the test passes and tells
you nothing you did not already believe. When the guess is wrong the test still
passes, because the code under test and the fake agree with each other while
both disagree with Postgres. You end up maintaining a second, wronger database
whose only user is your test suite.

**What a test can honestly assert is what the code would have sent.** The row
that would reach `entries`. The filter that would scope the read. The revision
snapshot that would be written alongside it, or the one that must not be written
when validation fails. Those are decisions your code makes, they are the reason
the function exists, and they are fully observable without a database anywhere.

So this records:

- **which table**, and the chain of operations built on it, in order,
- **in what order** the awaited queries resolved,
- **what was written**, as the payload your code passed,
- **which uploads** were attempted, and which pages of accounts were asked for.

And it answers every call from a single function you supply. That function is
the whole configuration surface: it sees the call and returns rows, an error, a
count, or nothing at all.

What it cannot tell you is whether the SQL means what you think, whether a
column name is real, or whether a constraint would reject the row. Nothing that
runs without Postgres can tell you that, and a fake that appears to is the
problem, not the solution. Keep one gate that runs migrations and a few queries
against a real database, and let it own the questions only a database can
answer. This owns the rest, which is most of them.

## Install

```sh
npm install --save-dev supabase-call-recorder
```

Node 20 or newer, and ESM only: there is no CommonJS build, so a runner that
cannot `import` an ES module cannot load this.

Nothing in it is Vitest-specific. It is a plain function returning a plain
object, so `node:test` and anything else use it the same way. Jest needs its own
ESM support turned on, or a transform, which is a Jest configuration problem
rather than anything this package can fix.

## The shape of it

```ts
import { fakeSupabase } from 'supabase-call-recorder';

const fake = fakeSupabase(responder, storageError, accountLister);
// or, when the positional form reads badly:
const fake = fakeSupabase({ responder, storageError, lister });
```

Everything is optional. `fakeSupabase()` answers every query with
`{ data: null, error: null }`, which is often all a test needs from the tables it
does not care about.

What comes back:

| Field | What it holds |
|---|---|
| `client` | The double. Pass it where the real client goes. |
| `asClient<T>()` | The same object, cast to the type your code expects. |
| `calls` | Every awaited query, in resolution order. |
| `writes(table, op)` | The payload of each `insert` / `upsert` / `update` / `delete` on `table`. |
| `touched(table)` | Whether `table` was reached at all. |
| `uploads` | Every accepted storage upload. |
| `listedPages` | Which `auth.admin.listUsers` pages were requested, in order. |

## The responder

One function answers every call. It receives the call and returns an `Answer`,
or `undefined` to mean "no opinion", which is answered with
`{ data: null, error: null }`.

```ts
import { fakeSupabase, type Responder } from 'supabase-call-recorder';

const responder: Responder = (call) => {
  if (call.table === 'review_items') return { data: [{ id: 'r1' }], error: null };
  if (call.table === 'profiles') return { data: null, error: { message: 'denied' } };
  return undefined;
};

const fake = fakeSupabase(responder);
```

Because the responder sees the whole call, it can answer on the filters too, not
only on the table:

```ts
const responder: Responder = (call) =>
  call.ops.some(([op, col, value]) => op === 'eq' && col === 'status' && value === 'pending')
    ? { data: [{ id: 'r1' }], error: null }
    : { data: [], error: null };
```

A test that needs several distinct answers in sequence is usually a test that
wants a queue, and a closure is enough:

```ts
const answers = [{ data: [{ id: 'r1' }], error: null }, { data: [], error: null }];
const fake = fakeSupabase(() => answers.shift());
```

### Asserting on the chain

```ts
await nextPendingId(fake.asClient<SupabaseClient>(), { sort: 'score', excludeId: 'r1' });

expect(fake.calls[0].table).toBe('review_queue');
expect(fake.calls[0].ops).toContainEqual(['neq', 'id', 'r1']);
expect(fake.calls[0].ops.filter(([op]) => op === 'order').map(([, col]) => col)).toEqual([
  'confidence_score',
  'created_at',
]);
```

The chain is recorded in the order it was built, so "orders by score, then breaks
the tie on `created_at`" is a real assertion rather than a comment. Nothing is
recorded until the chain is awaited, exactly as PostgREST only issues the request
on `await`.

## Transport failure

PostgREST reports a query error by filling `error`, and reports a dropped
connection by **rejecting**. Those are two different paths through any code that
guards them, and a test suite that can only reach the first one leaves the
second permanently unexercised.

A responder that throws produces the second:

```ts
it('shows the outage banner rather than an empty queue', async () => {
  const fake = fakeSupabase(() => {
    throw new Error('fetch failed');
  });

  await expect(loadQueue(fake.asClient<SupabaseClient>())).resolves.toEqual({ outage: true });
});
```

A responder that returns an error produces the first:

```ts
const fake = fakeSupabase(() => ({ data: null, error: { message: 'permission denied' } }));
```

The call is recorded either way, so an assertion that the query was attempted
still holds on the failing path.

## Counts

A tally is `select('id', { count: 'exact', head: true })`: no rows come back at
all, and the number arrives beside them. An `Answer` carries `count` for exactly
that case.

```ts
const fake = fakeSupabase((call) =>
  call.table === 'review_queue' ? { data: null, error: null, count: 544 } : undefined,
);

const page = await QueuePage({ searchParams: {} });
expect(screen.getByText('544 en attente')).toBeVisible();
```

## rpc

Stored procedure calls are recorded like any other call, under the table name
`rpc:<function>`, with the arguments as the single operation. That matters for
the common case of a role check: the test can answer it, or make it fail,
without stubbing the helper that wraps it and losing the branch that reads the
answer.

```ts
const fake = fakeSupabase((call) =>
  call.table === 'rpc:current_app_role' ? { data: 'reviewer', error: null } : undefined,
);

await expect(requireAdmin(fake.asClient<SupabaseClient>())).rejects.toThrow('insufficient role');
expect(fake.calls[0].ops).toEqual([['rpc']]);
```

A throwing responder rejects the RPC too, so the transport-failure path is
reachable there as well.

## writes() and touched()

`writes(table, op)` is the assertion that matters most often: not "the function
returned true" but "this exact row would have reached the table".

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

`touched(table)` answers the negative, which is otherwise unassertable: a
rejected submission leaves no row anywhere, so the only evidence that the guard
held is that the table was never reached.

```ts
it('writes nothing at all when the origin list is empty', async () => {
  const fake = fakeSupabase(() => ({ data: null, error: null }));

  await expect(submit({ lemma: 'kaz', origins: [] }, fake.asClient<SupabaseClient>())).rejects.toThrow();

  expect(fake.touched('entries')).toBe(false);
  expect(fake.touched('entry_revisions')).toBe(false);
});
```

## Storage and accounts

Uploads are recorded, and the whole bucket can be made to fail so the code that
runs when the object is not there is reachable:

```ts
const ok = fakeSupabase();
await handleUpload(file, ok.asClient<SupabaseClient>());
expect(ok.uploads).toEqual([{ bucket: 'imports', path: 'batch/1.csv', contentType: 'text/csv' }]);

const broken = fakeSupabase(undefined, { message: 'bucket not found' });
await expect(handleUpload(file, broken.asClient<SupabaseClient>())).resolves.toEqual({ saved: false });
expect(broken.uploads).toEqual([]);
```

`auth.admin.listUsers` is handed one page per call, so a test can describe a
short page, a full page at the ceiling, or a failure, without knowing how the
code under test walks the pager:

```ts
const fullThenShort: AccountLister = (page, perPage) =>
  page === 1
    ? { users: Array.from({ length: perPage }, (_, i) => ({ id: `u${i}` })) }
    : { users: [{ id: 'last' }] };

const fake = fakeSupabase(undefined, null, fullThenShort);
await collectAccounts(fake.asClient<SupabaseClient>());
expect(fake.listedPages).toEqual([1, 2]);
```

## Types

`client` is typed as the subset this actually implements, which is deliberately
not `SupabaseClient`. Use `asClient<T>()` at the boundary:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

await myServerAction(fake.asClient<SupabaseClient>());
```

It is a cast, and it is honest about being one: this records part of the client
surface, and the cast is where you accept that. Keeping it to a single call site
per test is the point.

## What is recorded

`from(table)` returns a recorder carrying these methods, each of which appends
to the call and returns the recorder:

`select` `insert` `upsert` `update` `delete` `eq` `neq` `gt` `gte` `lt` `lte`
`like` `ilike` `is` `in` `contains` `containedBy` `overlaps` `match` `not` `or`
`filter` `order` `limit` `range` `single` `maybeSingle` `returns`

The list is exported as `CHAIN_METHODS`. A method that is not on it does not
exist on the recorder, and calling it fails loudly rather than being silently
dropped: that is the intended behaviour, not an oversight. Adding one is a
one-word change plus a test.

## What it deliberately does not do

- **No query semantics.** Filters are recorded, never applied. `eq` does not
  narrow anything, because there is nothing to narrow.
- **No stored rows.** Nothing you insert can be selected back. If a test needs
  that, it is really testing the database, and it belongs in the suite that has
  one.
- **No realtime, no functions, no `storage.download` / `remove`.** They are
  absent rather than stubbed, so a gap surfaces as a missing method instead of
  as a silent success.
- **No assertion helpers beyond `writes` and `touched`.** `calls` is a plain
  array; your test framework already has better matchers than anything shipped
  here.

## Development

```sh
npm install
npm run verify   # typecheck, tests at 100% coverage, build
npm pack         # tarball, dry run of what publishing would ship
```

The coverage thresholds are set to 100% on all four measures. The package is
small enough that anything below that is a branch someone decided not to look
at.
