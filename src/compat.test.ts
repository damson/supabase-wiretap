/**
 * The recorder, used the way a real project uses the real client.
 *
 * Every function below is typed with `SupabaseClient` from
 * `@supabase/supabase-js`, so the compiler checks these call chains against the
 * genuine API rather than against this package's idea of it. Then each one is
 * run against the double.
 *
 * That combination is the point, and it catches the failure the rest of the
 * suite cannot. `index.test.ts` calls the recorder directly, so it can only
 * ever exercise methods this package already has: it agrees with itself by
 * construction. Here the call chain has to satisfy the real types first, so a
 * builder method that real code needs and `CHAIN_METHODS` is missing compiles
 * fine and then fails at runtime with `is not a function`, which is exactly
 * where the gap should surface.
 *
 * `@supabase/supabase-js` is a devDependency for this file alone. The package
 * itself still has no dependencies, runtime or peer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { fakeSupabase, type AccountLister, type Responder } from './index';

/* ────────────────────────────────────────────────────────────────────────────
 * Code under test: written against the real client, with no knowledge of this
 * package. This is what a project's `lib/` actually looks like.
 * ──────────────────────────────────────────────────────────────────────────── */

interface QueueRow {
  id: string;
  lemma: string;
  confidence_score: number;
}

async function loadFastLane(client: SupabaseClient, limit: number): Promise<QueueRow[]> {
  const { data, error } = await client
    .from('review_queue')
    .select('id, lemma, confidence_score')
    .eq('status', 'pending')
    .gte('confidence_score', 0.9)
    .order('confidence_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as QueueRow[];
}

async function countPending(client: SupabaseClient): Promise<number | null> {
  const { count, error } = await client
    .from('review_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return error ? null : (count ?? null);
}

async function findOne(client: SupabaseClient, id: string): Promise<QueueRow | null> {
  const { data, error } = await client.from('review_queue').select('*').eq('id', id).maybeSingle();
  return error ? null : (data as QueueRow | null);
}

async function searchByOrigin(client: SupabaseClient, origin: string, term: string) {
  return client
    .from('entries')
    .select('id, lemma')
    .contains('origins', [origin])
    .or(`lemma.ilike.%${term}%,definition.ilike.%${term}%`)
    .range(0, 24);
}

/** Approve a card: write the entry, snapshot it, and mark the card decided. */
async function approve(client: SupabaseClient, id: string, reviewer: string): Promise<boolean> {
  const { data, error } = await client.from('review_items').select('*').eq('id', id).single();
  if (error || !data) return false;

  const row = data as { lemma: string; origins: string[] };

  const written = await client
    .from('entries')
    .insert({ lemma: row.lemma, origins: row.origins, approved_by: reviewer })
    .select('id')
    .single();
  if (written.error) return false;

  await client.from('entry_revisions').insert({ entry_id: (written.data as { id: string }).id });
  await client.from('review_items').update({ status: 'approved' }).eq('id', id);
  return true;
}

async function currentRole(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.rpc('current_app_role');
  return error ? null : (data as string | null);
}

async function storeImport(client: SupabaseClient, path: string, body: string) {
  const { error } = await client.storage.from('imports').upload(path, body, {
    contentType: 'text/csv',
  });
  return { saved: !error };
}

async function collectAccounts(client: SupabaseClient, perPage: number): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < perPage) break;
  }
  return ids;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The same code, run against the double.
 * ──────────────────────────────────────────────────────────────────────────── */

const asClient = (fake: ReturnType<typeof fakeSupabase>) => fake.asClient<SupabaseClient>();

describe('a chain the real types accept', () => {
  it('records every link of a realistic queue read', async () => {
    const fake = fakeSupabase(() => ({ data: [{ id: 'r1', lemma: 'kaz', confidence_score: 1 }], error: null }));

    const rows = await loadFastLane(asClient(fake), 20);

    expect(rows).toEqual([{ id: 'r1', lemma: 'kaz', confidence_score: 1 }]);
    expect(fake.calls[0]?.ops).toEqual([
      ['select', 'id, lemma, confidence_score'],
      ['eq', 'status', 'pending'],
      ['gte', 'confidence_score', 0.9],
      ['order', 'confidence_score', { ascending: false, nullsFirst: false }],
      ['order', 'created_at', { ascending: true }],
      ['limit', 20],
    ]);
  });

  it('carries the count of a head query back through the real signature', async () => {
    const fake = fakeSupabase(() => ({ data: null, error: null, count: 544 }));

    expect(await countPending(asClient(fake))).toBe(544);
    expect(fake.calls[0]?.ops[0]).toEqual(['select', 'id', { count: 'exact', head: true }]);
  });

  it('supports maybeSingle, which resolves to a row rather than an array', async () => {
    const fake = fakeSupabase(() => ({ data: { id: 'r1', lemma: 'kaz', confidence_score: 1 }, error: null }));

    expect(await findOne(asClient(fake), 'r1')).toEqual({ id: 'r1', lemma: 'kaz', confidence_score: 1 });
  });

  it('supports the filters a search screen actually uses', async () => {
    const fake = fakeSupabase(() => ({ data: [], error: null }));

    await searchByOrigin(asClient(fake), 'fr', 'kaz');

    expect(fake.calls[0]?.ops).toContainEqual(['contains', 'origins', ['fr']]);
    expect(fake.calls[0]?.ops).toContainEqual(['or', 'lemma.ilike.%kaz%,definition.ilike.%kaz%']);
    expect(fake.calls[0]?.ops).toContainEqual(['range', 0, 24]);
  });

  it('records a multi-table write in the order it happened', async () => {
    const responder: Responder = (call) =>
      call.table === 'review_items'
        ? { data: { lemma: 'kaz', origins: ['fr'] }, error: null }
        : { data: { id: 'e1' }, error: null };
    const fake = fakeSupabase(responder);

    expect(await approve(asClient(fake), 'r1', 'u-reviewer')).toBe(true);

    expect(fake.writes('entries', 'insert')).toEqual([
      { lemma: 'kaz', origins: ['fr'], approved_by: 'u-reviewer' },
    ]);
    expect(fake.writes('entry_revisions', 'insert')).toEqual([{ entry_id: 'e1' }]);
    expect(fake.writes('review_items', 'update')).toEqual([{ status: 'approved' }]);
    expect(fake.calls.map((c) => c.table)).toEqual([
      'review_items',
      'entries',
      'entry_revisions',
      'review_items',
    ]);
  });

  it('leaves the downstream tables untouched when the read fails', async () => {
    const fake = fakeSupabase(() => ({ data: null, error: { message: 'not found' } }));

    expect(await approve(asClient(fake), 'r1', 'u-reviewer')).toBe(false);
    expect(fake.touched('entries')).toBe(false);
    expect(fake.touched('entry_revisions')).toBe(false);
  });

  it('answers an rpc through the real signature', async () => {
    const fake = fakeSupabase(() => ({ data: 'reviewer', error: null }));

    expect(await currentRole(asClient(fake))).toBe('reviewer');
    expect(fake.calls[0]?.table).toBe('rpc:current_app_role');
  });

  it('accepts a storage upload the real types accept', async () => {
    const ok = fakeSupabase();
    expect(await storeImport(asClient(ok), 'batch/1.csv', 'a,b\n')).toEqual({ saved: true });
    expect(ok.uploads).toEqual([
      { bucket: 'imports', path: 'batch/1.csv', contentType: 'text/csv' },
    ]);

    const broken = fakeSupabase(undefined, { message: 'bucket not found' });
    expect(await storeImport(asClient(broken), 'batch/1.csv', 'a,b\n')).toEqual({ saved: false });
  });

  it('walks the account pager the way the real admin API is walked', async () => {
    const lister: AccountLister = (page, perPage) =>
      page === 1
        ? { users: Array.from({ length: perPage }, (_, i) => ({ id: `u${i}` })) }
        : { users: [{ id: 'last' }] };
    const fake = fakeSupabase(undefined, null, lister);

    expect(await collectAccounts(asClient(fake), 2)).toEqual(['u0', 'u1', 'last']);
    expect(fake.listedPages).toEqual([1, 2]);
  });

  it('rejects, rather than resolving, when the transport fails mid-chain', async () => {
    const fake = fakeSupabase(() => {
      throw new Error('fetch failed');
    });

    await expect(loadFastLane(asClient(fake), 20)).rejects.toThrow('fetch failed');
  });
});
