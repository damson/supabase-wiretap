// Confirms that a version just published to npm carries provenance, and that
// the provenance names the workflow that is supposed to have built it.
//
//   node .github/scripts/verify-published-provenance.mjs <name> <version>
//
// WHY THIS EXISTS. Trusted publishing attaches provenance without being asked,
// so `--provenance` is no longer the thing that produces it. The failure worth
// catching is therefore a publish that SUCCEEDS and lands unattested: the
// package is live, the workflow is green, and nothing says the supply-chain
// link is missing. A publish step's own exit code cannot see that.
//
// WHY IT IS A SCRIPT AND NOT SIX LINES OF YAML. The first version of this check
// was inline in the workflow, waited 60 seconds, and failed the v0.1.1 release
// while the publish had in fact worked perfectly. Two bugs, and the second is
// the worse one:
//
//   1. It was impatient. npm's metadata document is a read-through cache and had
//      not caught up within a minute of the publish.
//   2. It could not tell "not visible yet" from "visible and unattested", and
//      reported the second. So it announced that a package was on the registry
//      unattested at a moment when that package was not on that document at all.
//      A false supply-chain alarm sends someone hunting for a compromise.
//
// Inline shell in a release path is where that kind of bug lives, because it
// cannot be run anywhere except a release. This file can be run by hand against
// any published version, which is how all three of its outcomes were exercised.
//
// EXIT CODES, which are the whole interface:
//   0  attested, and the provenance names the expected repository and workflow
//   1  visible on the registry WITHOUT provenance: the real alarm
//   2  could not be confirmed in time: unknown, not proven bad

const REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';
const SLSA = 'https://slsa.dev/provenance/v1';

/** Total seconds to keep asking. The registry took over a minute once. */
const WINDOW_S = Number(process.env.PROVENANCE_WINDOW_S ?? 300);
const INTERVAL_S = Number(process.env.PROVENANCE_INTERVAL_S ?? 10);

/**
 * The SLSA statement inside an attestations response, or null.
 *
 * npm returns two attestations: its own publish attestation and the SLSA
 * provenance. Only the second says who built the tarball, so picking by
 * `predicateType` matters rather than taking the first.
 */
export function slsaStatement(attestations) {
  const found = (attestations ?? []).find((a) => a.predicateType === SLSA);
  const payload = found?.bundle?.dsseEnvelope?.payload;
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** What the provenance claims built this: repository, workflow path, ref. */
export function buildSource(statement) {
  const workflow = statement?.predicate?.buildDefinition?.externalParameters?.workflow;
  if (!workflow) return null;
  return {
    repository: workflow.repository ?? null,
    path: workflow.path ?? null,
    ref: workflow.ref ?? null,
  };
}

/**
 * Whether the provenance was produced by the workflow we expect.
 *
 * An attestation that merely EXISTS proves less than it appears to: what makes
 * it worth anything is that it names this repository and this workflow file. A
 * check that stops at "some attestation is present" would pass on provenance
 * pointing anywhere.
 */
export function matchesExpected(source, expected) {
  if (!source) return { ok: false, why: 'the provenance carries no workflow reference' };
  const repo = expected.repository ? `https://github.com/${expected.repository}` : null;
  if (repo && source.repository !== repo) {
    return { ok: false, why: `provenance names ${source.repository}, expected ${repo}` };
  }
  if (expected.path && source.path !== expected.path) {
    return { ok: false, why: `provenance names workflow ${source.path}, expected ${expected.path}` };
  }
  return { ok: true, why: null };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: await res.json() };
}

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

async function main() {
  const [name, version] = process.argv.slice(2);
  if (!name || !version) {
    console.error('usage: verify-published-provenance.mjs <name> <version>');
    process.exit(2);
  }

  const expected = {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    path: process.env.EXPECTED_WORKFLOW_PATH ?? null,
  };

  const spec = `${encodeURIComponent(name)}@${version}`;
  const deadline = Date.now() + WINDOW_S * 1000;
  let sawVersion = false;

  while (Date.now() < deadline) {
    // The attestations endpoint is the direct answer. A 404 here is not proof of
    // absence while the publish is still propagating, which is why the loop asks
    // the metadata document as well: that is what tells us the version EXISTS,
    // and therefore that a missing attestation is real rather than early.
    const att = await getJson(`${REGISTRY}/-/npm/v1/attestations/${spec}`);
    const statement = slsaStatement(att.body?.attestations);
    if (statement) {
      const source = buildSource(statement);
      const verdict = matchesExpected(source, expected);
      console.log(`provenance found for ${name}@${version}`);
      console.log(`  repository: ${source?.repository}`);
      console.log(`  workflow:   ${source?.path}`);
      console.log(`  ref:        ${source?.ref}`);
      if (!verdict.ok) {
        console.error(`::error::${name}@${version} carries provenance, but ${verdict.why}.`);
        process.exit(1);
      }
      console.log('and it names the expected repository and workflow.');
      process.exit(0);
    }

    const doc = await getJson(`${REGISTRY}/${encodeURIComponent(name)}`);
    const entry = doc.body?.versions?.[version];
    if (entry) {
      sawVersion = true;
      if (entry.dist?.attestations) {
        // Present on the packument but the attestations endpoint has not caught
        // up. Keep waiting: this is the same propagation, seen from the other
        // side, not a different outcome.
        console.log('attestations listed on the metadata document; waiting for the endpoint.');
      }
    }

    await sleep(INTERVAL_S);
  }

  if (sawVersion) {
    console.error(
      `::error::${name}@${version} is on the registry and has no provenance after ${WINDOW_S}s. ` +
        'A trusted publish attaches it automatically, so this means the publish did not go through ' +
        'trusted publishing. The version cannot be replaced, only deprecated: publish a patch once ' +
        'the trusted publisher is configured correctly.',
    );
    process.exit(1);
  }

  console.error(
    `::error::could not confirm ${name}@${version} within ${WINDOW_S}s: it has not appeared on the ` +
      'registry at all. This is unknown rather than bad. Check the registry by hand before assuming ' +
      'the publish failed, and do not re-run the publish step, which would fail on a version conflict ' +
      'if it did succeed.',
  );
  process.exit(2);
}

// Importable for testing without running the poll loop.
if (import.meta.url === `file://${process.argv[1]}`) await main();
