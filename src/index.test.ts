import { describe, expect, it } from 'vitest';

import { CHAIN_METHODS, fakeSupabase, type AccountLister, type Responder } from './index';

/** `calls[i]`, without a non-null assertion at every assertion site. */
function at(calls: { table: string; ops: [string, ...unknown[]][] }[], i: number) {
  const call = calls[i];
  if (!call) throw new Error(`expected a call at index ${i}, got ${calls.length} call(s)`);
  return call;
}

describe('recording a query', () => {
  it('records the table and the chain, in the order it was built', async () => {
    const fake = fakeSupabase();
    await fake.client.from('entries').select('id').eq('status', 'pending').limit(10);

    expect(at(fake.calls, 0).table).toBe('entries');
    expect(at(fake.calls, 0).ops).toEqual([
      ['select', 'id'],
      ['eq', 'status', 'pending'],
      ['limit', 10],
    ]);
  });

  it('records nothing until the chain is awaited', async () => {
    const fake = fakeSupabase();
    const pending = fake.client.from('entries').select('id');
    expect(fake.calls).toHaveLength(0);

    await pending;
    expect(fake.calls).toHaveLength(1);
  });

  it('records every method it claims to record', async () => {
    const fake = fakeSupabase();
    let builder = fake.client.from('entries');
    for (const method of CHAIN_METHODS) builder = builder[method]('arg');
    await builder;

    expect(at(fake.calls, 0).ops).toEqual(CHAIN_METHODS.map((m) => [m, 'arg']));
  });

  it('answers with what the responder decides', async () => {
    const fake = fakeSupabase(() => ({ data: [{ id: 'e1' }], error: null }));
    const answer = await fake.client.from('entries').select('id');

    expect(answer.data).toEqual([{ id: 'e1' }]);
    expect(answer.error).toBeNull();
  });

  it('answers with nothing when the responder has no opinion', async () => {
    // The default. A test that cares about one table should not have to
    // describe every other table the code under test happens to read.
    const fake = fakeSupabase();
    expect(await fake.client.from('anything').select('*')).toEqual({ data: null, error: null });
  });

  it('lets a responder answer one table and abstain on the rest', async () => {
    const fake = fakeSupabase((call) =>
      call.table === 'entries' ? { data: [{ id: 'e1' }], error: null } : undefined,
    );

    expect((await fake.client.from('entries').select('id')).data).toEqual([{ id: 'e1' }]);
    expect((await fake.client.from('audit').select('id')).data).toBeNull();
  });

  it('carries a count beside no rows at all, as a head query does', async () => {
    const fake = fakeSupabase(() => ({ data: null, error: null, count: 544 }));
    const answer = await fake.client
      .from('review_queue')
      .select('id', { count: 'exact', head: true });

    expect(answer.count).toBe(544);
    expect(answer.data).toBeNull();
  });

  it('rejects when the responder throws, which is how a transport failure arrives', async () => {
    // PostgREST signals a dropped connection by REJECTING, not by filling
    // `error`. Code that guards the two takes different paths, so both have to
    // be reachable from a test.
    const fake = fakeSupabase(() => {
      throw new Error('fetch failed');
    });

    await expect(fake.client.from('entries').select('id')).rejects.toThrow('fetch failed');
    expect(fake.calls).toHaveLength(1);
  });
});

describe('rpc', () => {
  it('records the function and its arguments as a call like any other', async () => {
    const fake = fakeSupabase((call) =>
      call.table === 'rpc:current_app_role' ? { data: 'admin', error: null } : undefined,
    );

    expect((await fake.client.rpc('current_app_role')).data).toBe('admin');
    expect(at(fake.calls, 0)).toEqual({ table: 'rpc:current_app_role', ops: [['rpc']] });
  });

  it('carries the arguments it was called with', async () => {
    const fake = fakeSupabase();
    await fake.client.rpc('grant_role', { user_id: 'u1', role: 'reviewer' });

    expect(at(fake.calls, 0).ops).toEqual([['rpc', { user_id: 'u1', role: 'reviewer' }]]);
  });

  it('answers with nothing when the responder has no opinion', async () => {
    const fake = fakeSupabase();
    expect(await fake.client.rpc('whatever')).toEqual({ data: null, error: null });
  });

  it('rejects when the responder throws', async () => {
    const fake = fakeSupabase(() => {
      throw new Error('fetch failed');
    });

    await expect(fake.client.rpc('current_app_role')).rejects.toThrow('fetch failed');
  });
});

describe('writes and touched', () => {
  const responder: Responder = () => ({ data: null, error: null });

  it('hands back the payload of every write to a table, in order', async () => {
    const fake = fakeSupabase(responder);
    await fake.client.from('entries').insert({ lemma: 'kaz' });
    await fake.client.from('entries').insert({ lemma: 'dlo' });

    expect(fake.writes('entries', 'insert')).toEqual([{ lemma: 'kaz' }, { lemma: 'dlo' }]);
  });

  it('separates the operations on one table', async () => {
    const fake = fakeSupabase(responder);
    await fake.client.from('entries').insert({ lemma: 'kaz' });
    await fake.client.from('entries').update({ lemma: 'kay' }).eq('id', 'e1');
    await fake.client.from('entries').delete().eq('id', 'e2');

    expect(fake.writes('entries', 'insert')).toEqual([{ lemma: 'kaz' }]);
    expect(fake.writes('entries', 'update')).toEqual([{ lemma: 'kay' }]);
    expect(fake.writes('entries', 'delete')).toEqual([undefined]);
  });

  it('ignores writes to other tables, and reads to this one', async () => {
    const fake = fakeSupabase(responder);
    await fake.client.from('audit').insert({ note: 'elsewhere' });
    await fake.client.from('entries').select('id');

    expect(fake.writes('entries', 'insert')).toEqual([]);
  });

  it('says which tables were reached at all', async () => {
    const fake = fakeSupabase(responder);
    await fake.client.from('entries').select('id');

    expect(fake.touched('entries')).toBe(true);
    // The assertion worth having: an action that must NOT write the revision
    // table when a validation fails leaves no trace to assert on otherwise.
    expect(fake.touched('entry_revisions')).toBe(false);
  });
});

describe('storage', () => {
  it('records the bucket, the path and the content type', async () => {
    const fake = fakeSupabase();
    const result = await fake.client.storage
      .from('uploads')
      .upload('batch/1.csv', 'a,b\n', { contentType: 'text/csv' });

    expect(result.data).toEqual({ path: 'batch/1.csv' });
    expect(fake.uploads).toEqual([
      { bucket: 'uploads', path: 'batch/1.csv', contentType: 'text/csv' },
    ]);
  });

  it('records an upload that named no content type', async () => {
    const fake = fakeSupabase();
    await fake.client.storage.from('uploads').upload('batch/2.csv', 'a,b\n');

    expect(fake.uploads).toEqual([
      { bucket: 'uploads', path: 'batch/2.csv', contentType: undefined },
    ]);
  });

  it('fails every upload when the test asked for a failing bucket', async () => {
    const fake = fakeSupabase(undefined, { message: 'bucket not found' });
    const result = await fake.client.storage.from('uploads').upload('batch/3.csv', 'a,b\n');

    expect(result).toEqual({ data: null, error: { message: 'bucket not found' } });
    // Nothing recorded: the point of the failure path is the code that runs
    // when the object is not there.
    expect(fake.uploads).toEqual([]);
  });
});

describe('auth.admin.listUsers', () => {
  const twoPages: AccountLister = (page) =>
    page === 1
      ? { users: [{ id: 'u1', email: 'first@example.test' }] }
      : { users: [{ id: 'u2', email: 'second@example.test' }] };

  it('answers one page per call and records which were asked for', async () => {
    const fake = fakeSupabase(undefined, null, twoPages);

    const first = await fake.client.auth.admin.listUsers({ page: 1, perPage: 1 });
    const second = await fake.client.auth.admin.listUsers({ page: 2, perPage: 1 });

    expect(first.data?.users).toEqual([{ id: 'u1', email: 'first@example.test' }]);
    expect(second.data?.users).toEqual([{ id: 'u2', email: 'second@example.test' }]);
    expect(fake.listedPages).toEqual([1, 2]);
  });

  it('answers an empty page when the test described no accounts', async () => {
    const fake = fakeSupabase();
    const page = await fake.client.auth.admin.listUsers({ page: 1, perPage: 50 });

    expect(page.data).toEqual({ users: [] });
    expect(page.error).toBeNull();
  });

  it('fails the page when the lister says so', async () => {
    const fake = fakeSupabase(undefined, null, () => ({
      users: [],
      error: { message: 'not allowed' },
    }));
    const page = await fake.client.auth.admin.listUsers({ page: 1, perPage: 50 });

    expect(page).toEqual({ data: null, error: { message: 'not allowed' } });
  });
});

describe('construction', () => {
  it('takes an options object when the positional form would read badly', async () => {
    const fake = fakeSupabase({
      responder: () => ({ data: [{ id: 'e1' }], error: null }),
      storageError: { message: 'bucket not found' },
      lister: () => ({ users: [{ id: 'u1' }] }),
    });

    expect((await fake.client.from('entries').select('id')).data).toEqual([{ id: 'e1' }]);
    expect((await fake.client.storage.from('uploads').upload('a', 'b')).error).toEqual({
      message: 'bucket not found',
    });
    const page = await fake.client.auth.admin.listUsers({ page: 1, perPage: 50 });
    expect(page.data?.users).toEqual([{ id: 'u1' }]);
  });

  it('defaults every part of the options object', async () => {
    const fake = fakeSupabase({});

    expect(await fake.client.from('entries').select('id')).toEqual({ data: null, error: null });
    expect((await fake.client.storage.from('uploads').upload('a', 'b')).data).toEqual({ path: 'a' });
    expect((await fake.client.auth.admin.listUsers({ page: 1, perPage: 1 })).data).toEqual({
      users: [],
    });
  });

  it('hands the double back typed as whatever the code under test expects', async () => {
    interface NarrowClient {
      from(table: string): PromiseLike<{ data: unknown; error: unknown }>;
    }
    const fake = fakeSupabase(() => ({ data: 'ok', error: null }));

    const client = fake.asClient<NarrowClient>();
    expect((await client.from('entries')).data).toBe('ok');
  });
});
