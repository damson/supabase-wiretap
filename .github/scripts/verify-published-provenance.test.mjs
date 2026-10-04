// What this check decides cannot be rehearsed during a release: the bad
// outcomes need a registry that is lying or late. The pure decisions are pinned
// here; the poll loop and the exit codes it reports through live in
// `verify-published-provenance.exit.test.mjs`, over a stub registry.

import { describe, expect, it } from 'vitest';
import { buildSource, matchesExpected, slsaStatement } from './verify-published-provenance.mjs';

const SLSA = 'https://slsa.dev/provenance/v1';
const REPO = 'https://github.com/damson/supabase-wiretap';
const WORKFLOW = '.github/workflows/release.yml';

const envelope = (statement) => ({
  bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } },
});

const provenance = (workflow) => ({
  predicateType: SLSA,
  ...envelope({ predicate: { buildDefinition: { externalParameters: { workflow } } } }),
});

describe('slsaStatement', () => {
  it('picks the SLSA provenance out of npm\'s two attestations', () => {
    // npm returns its own publish attestation alongside the provenance, and
    // only the second says who built the tarball. Taking the first would read
    // the wrong document and find no workflow in it.
    const attestations = [
      { predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1', ...envelope({ predicate: {} }) },
      provenance({ repository: REPO, path: WORKFLOW, ref: 'refs/tags/v0.1.1' }),
    ];
    expect(buildSource(slsaStatement(attestations))?.repository).toBe(REPO);
  });

  it('returns null when no attestation is SLSA provenance', () => {
    expect(slsaStatement([{ predicateType: 'something/else', ...envelope({}) }])).toBeNull();
  });

  it('returns null rather than throwing on an unreadable payload', () => {
    expect(slsaStatement([{ predicateType: SLSA, bundle: { dsseEnvelope: { payload: 'not base64 json' } } }])).toBeNull();
  });

  it('returns null for a missing or empty attestations list', () => {
    expect(slsaStatement(undefined)).toBeNull();
    expect(slsaStatement([])).toBeNull();
  });
});

describe('buildSource', () => {
  it('reads the repository, workflow path and ref the provenance claims', () => {
    const statement = slsaStatement([provenance({ repository: REPO, path: WORKFLOW, ref: 'refs/tags/v0.1.1' })]);
    expect(buildSource(statement)).toEqual({ repository: REPO, path: WORKFLOW, ref: 'refs/tags/v0.1.1' });
  });

  it('returns null when the statement carries no workflow reference', () => {
    expect(buildSource({ predicate: { buildDefinition: { externalParameters: {} } } })).toBeNull();
    expect(buildSource(null)).toBeNull();
  });
});

describe('matchesExpected', () => {
  const expected = { repository: 'damson/supabase-wiretap', path: WORKFLOW };

  it('accepts provenance naming the expected repository and workflow', () => {
    expect(matchesExpected({ repository: REPO, path: WORKFLOW, ref: null }, expected).ok).toBe(true);
  });

  it('rejects provenance produced by another repository', () => {
    const verdict = matchesExpected({ repository: 'https://github.com/attacker/elsewhere', path: WORKFLOW }, expected);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('attacker/elsewhere');
  });

  it('rejects provenance produced by another workflow in this repository', () => {
    // The repository half passing is not enough: a second workflow with
    // id-token permission would otherwise publish under the same name.
    const verdict = matchesExpected({ repository: REPO, path: '.github/workflows/rogue.yml' }, expected);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('rogue.yml');
  });

  it('rejects an attestation that exists but names nothing', () => {
    expect(matchesExpected(null, expected).ok).toBe(false);
  });

  it('degrades to existence-only when nothing is expected, and says so by passing', () => {
    // Run outside Actions there is no GITHUB_REPOSITORY, so the check can only
    // assert that provenance exists. Pinned because it is the weak mode: it
    // must stay reachable only when the expectation is genuinely absent.
    expect(matchesExpected({ repository: REPO, path: WORKFLOW }, { repository: null, path: null }).ok).toBe(true);
  });
});
