// The exit codes ARE the interface this script presents to the release, and the
// outcomes that matter only happen when the registry is late or lying. A stub
// registry produces both on demand, so the release path no longer has to be the
// first place any of them is seen.
//
// The case worth the whole file is `waits out a late attestation`: reporting a
// still-propagating publish as unattested is what failed the v0.1.1 release and
// raised a false supply-chain alarm while the publish had worked.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('./verify-published-provenance.mjs', import.meta.url));
const SLSA = 'https://slsa.dev/provenance/v1';
const NAME = 'supabase-wiretap';
const VERSION = '0.1.2';
const REPO = 'damson/supabase-wiretap';
const WORKFLOW = '.github/workflows/release.yml';

const provenance = (repository, path) => ({
  attestations: [
    {
      predicateType: SLSA,
      bundle: {
        dsseEnvelope: {
          payload: Buffer.from(
            JSON.stringify({
              predicate: {
                buildDefinition: {
                  externalParameters: { workflow: { repository, path, ref: `refs/tags/v${VERSION}` } },
                },
              },
            }),
          ).toString('base64'),
        },
      },
    },
  ],
});

/** A packument carrying the version, which is what makes a missing attestation real. */
const live = { versions: { [VERSION]: { dist: {} } } };
const absent = { versions: {} };

let open = [];
afterEach(async () => {
  await Promise.all(open.map((s) => new Promise((r) => s.close(r))));
  open = [];
});

/** Serves one scripted registry. `attestations` may be a function of the hit count. */
async function registry({ attestations, packument }) {
  let hits = 0;
  const server = createServer((req, res) => {
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body ?? {}));
    };
    if (req.url.startsWith('/-/npm/v1/attestations/')) {
      hits += 1;
      const body = typeof attestations === 'function' ? attestations(hits) : attestations;
      return body ? json(200, body) : json(404, null);
    }
    if (req.url === `/${NAME}`) return json(200, packument);
    json(404, null);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  open.push(server);
  return { url: `http://127.0.0.1:${server.address().port}`, attestationHits: () => hits };
}

function run(url, { args = [NAME, VERSION], window = '0.6', interval = '0.05', expected = true } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: {
        ...process.env,
        NPM_REGISTRY: url,
        PROVENANCE_WINDOW_S: window,
        PROVENANCE_INTERVAL_S: interval,
        ...(expected ? { GITHUB_REPOSITORY: REPO, EXPECTED_WORKFLOW_PATH: WORKFLOW } : {}),
      },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ code, output }));
  });
}

describe('verify-published-provenance exit codes', () => {
  it('exits 0 when the version is attested by the expected workflow', async () => {
    const r = await registry({ attestations: provenance(`https://github.com/${REPO}`, WORKFLOW), packument: live });
    const { code, output } = await run(r.url);
    expect(code).toBe(0);
    expect(output).toContain('names the expected repository and workflow');
  });

  it('exits 1 when the version is live and carries no provenance', async () => {
    const r = await registry({ attestations: null, packument: live });
    const { code, output } = await run(r.url);
    expect(code).toBe(1);
    expect(output).toContain('is on the registry and has no provenance');
  });

  it('exits 1 when the provenance names another repository', async () => {
    const r = await registry({
      attestations: provenance('https://github.com/attacker/elsewhere', WORKFLOW),
      packument: live,
    });
    const { code, output } = await run(r.url);
    expect(code).toBe(1);
    expect(output).toContain('attacker/elsewhere');
  });

  it('exits 2, not 1, when the version has not appeared at all', async () => {
    // The distinction the inline check could not make. Unknown is not bad, and
    // calling it bad is what sent someone hunting for a compromise.
    const r = await registry({ attestations: null, packument: absent });
    const { code, output } = await run(r.url);
    expect(code).toBe(2);
    expect(output).toContain('has not appeared on the registry at all');
    expect(output).not.toContain('has no provenance');
  });

  it('waits out a late attestation instead of calling the publish unattested', async () => {
    // 404 while it propagates, then the real thing. The window has to outlast
    // the delay, which is the whole reason it is 300s in the workflow.
    const r = await registry({
      attestations: (hit) => (hit < 4 ? null : provenance(`https://github.com/${REPO}`, WORKFLOW)),
      packument: live,
    });
    const { code, output } = await run(r.url, { window: '5', interval: '0.05' });
    expect(code).toBe(0);
    expect(output).toContain('names the expected repository and workflow');
    // Proves it actually polled rather than passing on the first answer.
    expect(r.attestationHits()).toBeGreaterThanOrEqual(4);
  });

  it('exits 2 on a usage error, which is unknown rather than a failed publish', async () => {
    const r = await registry({ attestations: null, packument: absent });
    const { code, output } = await run(r.url, { args: [NAME] });
    expect(code).toBe(2);
    expect(output).toContain('usage:');
  });
});
