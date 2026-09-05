/**
 * A recording stand-in for the supabase-js query builder.
 *
 * It records the CALLS rather than simulating a database. Code that talks to
 * Supabase is usually untested for one reason: reaching it means standing up a
 * database. What such code actually needs from a test double is far less than a
 * database. It needs something that remembers what was asked of it and answers
 * with whatever the test decides, which is all this is.
 *
 * The discipline that follows from that stance: assert on what would flow
 * downstream, the row that would reach the table, the filter that would scope
 * the read. A double good enough to be queried back would just be a second,
 * wronger Postgres, and every hour spent making it more convincing is an hour
 * spent on a component that ships to nobody.
 */

/** One awaited query, as a table name plus the chain that was built on it. */
export interface Call {
  /** The table passed to `from()`, or `rpc:<name>` for a stored procedure. */
  table: string;
  /** `select` / `insert` / `eq` / ..., in the order they were chained. */
  ops: [string, ...unknown[]][];
}

/**
 * What a responder may answer with.
 *
 * `count` is here for the head queries: a tally is
 * `select('id', { count: 'exact', head: true })`, which returns no rows at all
 * and carries its number beside them.
 */
export interface Answer {
  data: unknown;
  error: unknown;
  count?: number | null | undefined;
}

/**
 * Decides what a call is answered with.
 *
 * Returning `undefined` means "no opinion", and the call is answered with
 * `{ data: null, error: null }`. THROWING stands for a transport failure, which
 * PostgREST signals by rejecting rather than by filling `error`.
 */
export type Responder = (call: Call) => Answer | undefined;

/**
 * The builder methods that are recorded.
 *
 * Exported because it is the honest statement of what this covers. A method
 * that is not here does not exist on the double, and the failure is a plain
 * `is not a function`, not a call that is silently dropped.
 */
export const CHAIN_METHODS = [
  'select',
  'insert',
  'upsert',
  'update',
  'delete',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'overlaps',
  'match',
  'not',
  'or',
  'filter',
  'order',
  'limit',
  'range',
  'single',
  'maybeSingle',
  'returns',
] as const;

export type ChainMethod = (typeof CHAIN_METHODS)[number];

/** Every recorded method, each returning the builder so calls chain. */
export type Chain = {
  [K in ChainMethod]: (...args: unknown[]) => QueryRecorder;
};

export interface QueryRecorder extends Chain {}

/**
 * The thenable the query methods return.
 *
 * It is a thenable rather than a promise so `await from(t).update(v).eq(...)`
 * resolves without the builder needing to know which call in the chain is the
 * last one. That is how PostgREST's own builder behaves, and copying it is what
 * keeps the code under test unchanged.
 */
export class QueryRecorder implements PromiseLike<Answer> {
  private readonly ops: [string, ...unknown[]][] = [];

  constructor(
    private readonly table: string,
    private readonly calls: Call[],
    private readonly responder: Responder,
  ) {
    for (const method of CHAIN_METHODS) {
      this[method] = (...args: unknown[]) => this.push(method, ...args);
    }
  }

  private push(op: string, ...args: unknown[]): this {
    this.ops.push([op, ...args]);
    return this;
  }

  then<R1 = Answer, R2 = never>(
    onfulfilled?: ((value: Answer) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const call: Call = { table: this.table, ops: this.ops };
    this.calls.push(call);
    return settle(this.responder, call).then(onfulfilled, onrejected);
  }
}

/**
 * A responder's verdict as a promise.
 *
 * A responder that throws rejects, because a transport failure and a returned
 * `error` are different paths in the code that guards them, and both have to be
 * reachable from a test.
 */
function settle(responder: Responder, call: Call): Promise<Answer> {
  try {
    return Promise.resolve(responder(call) ?? { data: null, error: null });
  } catch (err) {
    return Promise.reject(err);
  }
}

/** One recorded upload. */
export interface Upload {
  bucket: string;
  path: string;
  contentType?: string | undefined;
}

export interface StorageError {
  message: string;
}

/** One page of `auth.admin.listUsers`, as a caller consumes it. */
export interface AccountPage {
  users: { id: string; email?: string | null }[];
  error?: StorageError | null | undefined;
}

/**
 * Backs `auth.admin.listUsers`.
 *
 * Handed one page per call so a test can describe a short page (the last one),
 * a full page at the ceiling (truncation), or a failure, without knowing how
 * the code under test walks the pages.
 */
export type AccountLister = (page: number, perPage: number) => AccountPage;

export type WriteOp = 'insert' | 'upsert' | 'update' | 'delete';

export interface FakeClient {
  from(table: string): QueryRecorder;
  auth: {
    admin: {
      listUsers(args: { page: number; perPage: number }): Promise<
        { data: { users: AccountPage['users'] }; error: null } | { data: null; error: StorageError }
      >;
    };
  };
  rpc(fn: string, ...args: unknown[]): Promise<Answer>;
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: unknown,
        options?: { contentType?: string | undefined },
      ): Promise<{ data: { path: string }; error: null } | { data: null; error: StorageError }>;
    };
  };
}

export interface FakeSupabase {
  /** Every awaited query, in the order they resolved. */
  calls: Call[];
  /** Every upload that was accepted, in order. */
  uploads: Upload[];
  /** Which `listUsers` pages were asked for, in order. */
  listedPages: number[];
  /** The double itself. Pass this where the real client goes. */
  client: FakeClient;
  /**
   * The double, typed as whatever the code under test expects.
   *
   * A convenience for the cast that would otherwise be written at every call
   * site. It is still a cast: this records a subset of the client surface, and
   * the compiler is being told to stop pointing that out.
   */
  asClient<T>(): T;
  /** The argument of every call that wrote to `table` with `op`, in order. */
  writes(table: string, op: WriteOp): unknown[];
  /** Whether `table` was queried at all. */
  touched(table: string): boolean;
}

export interface FakeSupabaseOptions {
  responder?: Responder | undefined;
  /** When set, every upload fails with it and nothing is recorded. */
  storageError?: StorageError | null | undefined;
  lister?: AccountLister | null | undefined;
}

const NO_OPINION: Responder = () => undefined;

export function fakeSupabase(options?: FakeSupabaseOptions): FakeSupabase;
export function fakeSupabase(
  responder?: Responder,
  storageError?: StorageError | null,
  lister?: AccountLister | null,
): FakeSupabase;
export function fakeSupabase(
  first?: Responder | FakeSupabaseOptions,
  storageError: StorageError | null = null,
  lister: AccountLister | null = null,
): FakeSupabase {
  // `undefined` belongs with the positional form, not with the options one:
  // `fakeSupabase(undefined, null, lister)` is how a test that cares only
  // about accounts is written, and reading it as an absent options object
  // would silently drop the two arguments after it.
  const options: FakeSupabaseOptions =
    typeof first === 'function' || first === undefined
      ? { responder: first, storageError, lister }
      : first;
  const responder = options.responder ?? NO_OPINION;
  const uploadError = options.storageError ?? null;
  const listPage = options.lister ?? null;

  const calls: Call[] = [];
  const uploads: Upload[] = [];
  const listedPages: number[] = [];

  const client: FakeClient = {
    from: (table) => new QueryRecorder(table, calls, responder),
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          listedPages.push(page);
          const answer = listPage?.(page, perPage) ?? { users: [] };
          return answer.error
            ? { data: null, error: answer.error }
            : { data: { users: answer.users }, error: null };
        },
      },
    },
    // Recorded as a call like any other, so a test can answer an RPC, or make
    // it fail, without stubbing the helper that wraps it and losing the branch
    // that reads the answer.
    rpc: (fn, ...args) => {
      const call: Call = { table: `rpc:${fn}`, ops: [['rpc', ...args]] };
      calls.push(call);
      return settle(responder, call);
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, _body, options) => {
          if (uploadError) return { data: null, error: uploadError };
          uploads.push({ bucket, path, contentType: options?.contentType });
          return { data: { path }, error: null };
        },
      }),
    },
  };

  return {
    calls,
    uploads,
    listedPages,
    client,
    asClient: <T>() => client as T,
    writes(table, op) {
      return calls
        .filter((c) => c.table === table && c.ops.some(([o]) => o === op))
        .map((c) => c.ops.find(([o]) => o === op)![1]);
    },
    touched(table) {
      return calls.some((c) => c.table === table);
    },
  };
}
