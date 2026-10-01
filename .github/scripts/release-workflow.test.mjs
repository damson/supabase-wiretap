// Guards the ORDER of the release, which is the part no unit test of a script
// can see. `release-notes.mjs` is well covered on its own, and that says nothing
// about when it runs.
//
// The bug this exists to prevent: the GitHub Release job needs the publish job,
// so the changelog it reads was being read on the far side of the irreversible
// step. An unclosed changelog meant the version live on npm, the workflow red,
// no Release, and nothing that could be taken back. The gate has to read it too,
// and the gate has to come first.
//
// Every assertion here runs against the workflow with its COMMENTS STRIPPED.
// Asserting on the raw text is how a guard passes against a gate somebody
// commented out, which is the same defect as the thing being guarded: present
// in the file, absent from the run.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raw = readFileSync(fileURLToPath(new URL('../workflows/release.yml', import.meta.url)), 'utf8');

/**
 * The workflow with every comment line removed: YAML comments and, inside a
 * `run:` block, shell comments. Both are lines whose first non-space character
 * is `#`, and neither runs.
 */
export const executable = raw
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

/** The body of one `- name: <step>` block, up to the next step at the same indent. */
function step(name) {
  const start = executable.indexOf(`      - name: ${name}`);
  if (start === -1) return null;
  const next = executable.indexOf('\n      - ', start + 1);
  return executable.slice(start, next === -1 ? undefined : next);
}

const at = (needle) => executable.indexOf(needle);
const GATE = 'Refuse a release the repository is not ready for';
const PUBLISH = '\n        run: npm publish --access public';

describe('the release gate runs before the publish', () => {
  it('strips comments, so a commented-out line is not evidence of anything', () => {
    // The assertion that makes the rest of this file mean what it says.
    expect(raw).toContain('# It cannot fire by accident.');
    expect(executable).not.toContain('# It cannot fire by accident.');
  });

  it('actually invokes the changelog reader in the pre-publish gate', () => {
    const gate = step(GATE);
    expect(gate).not.toBeNull();
    // An invocation, not a mention: `node <path>` with the version argument.
    expect(gate).toMatch(/node\s+\.github\/scripts\/release-notes\.mjs\s+"\$version"/);
  });

  it('fails the gate on that invocation rather than ignoring its exit code', () => {
    // A call whose result is discarded refuses nothing. The gate collects
    // failures in `fail`, so the invocation has to feed it.
    const gate = step(GATE);
    expect(gate).toMatch(/if !\s*message="\$\(node\s+\.github\/scripts\/release-notes\.mjs[\s\S]*?fail=1/);
  });

  it('puts that gate ahead of both the dry run and the publish', () => {
    const gate = at(`      - name: ${GATE}`);
    const dryRun = at('npm publish --dry-run');
    const publish = at(PUBLISH);
    expect(gate).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(dryRun);
    expect(gate).toBeLessThan(publish);
  });

  it('reads the changelog nowhere but the gate before the publish happens', () => {
    // A second reader added after the publish would be the original bug wearing
    // a different name, so the FIRST executable mention has to be the gate's.
    const first = at('release-notes.mjs');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(at(PUBLISH));
  });

  it('still has the Release job depending on the publish, which is why the gate is needed', () => {
    // If this ever stops being true the gate is no longer load-bearing, and
    // whoever changed it should have to read this test and say so.
    //
    // Matched as a whole line. A substring match passes on `# needs: publish`,
    // which is how the first version of this assertion went green against a
    // commented-out dependency.
    const job = executable.slice(executable.indexOf('\n  github-release:'));
    expect(job).toContain('\n    needs: publish\n');
  });
});
