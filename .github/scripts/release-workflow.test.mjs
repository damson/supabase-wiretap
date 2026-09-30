// Guards the ORDER of the release, which is the part no unit test of a script
// can see. `release-notes.mjs` is well covered on its own, and that says nothing
// about when it runs.
//
// The bug this exists to prevent: the GitHub Release job needs the publish job,
// so the changelog it reads was being read on the far side of the irreversible
// step. An unclosed changelog meant the version live on npm, the workflow red,
// no Release, and nothing that could be taken back. The gate has to read it too,
// and the gate has to come first.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(fileURLToPath(new URL('../workflows/release.yml', import.meta.url)), 'utf8');

/** The body of one `- name: <step>` block, up to the next step at the same indent. */
function step(name) {
  const start = workflow.indexOf(`      - name: ${name}`);
  if (start === -1) return null;
  const next = workflow.indexOf('\n      - ', start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
}

const at = (needle) => workflow.indexOf(needle);

describe('the release gate runs before the publish', () => {
  it('reads the changelog in the pre-publish gate', () => {
    const gate = step('Refuse a release the repository is not ready for');
    expect(gate).not.toBeNull();
    expect(gate).toContain('release-notes.mjs');
  });

  it('puts that gate ahead of both the dry run and the publish', () => {
    const gate = at('      - name: Refuse a release the repository is not ready for');
    const dryRun = at('npm publish --dry-run');
    const publish = at('\n        run: npm publish --access public');
    expect(gate).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(dryRun);
    expect(gate).toBeLessThan(publish);
  });

  it('reads the changelog nowhere but the gate before the publish happens', () => {
    // A second reader added after the publish would be the original bug wearing
    // a different name, so the FIRST mention has to be the gate's.
    expect(at('release-notes.mjs')).toBeLessThan(at('\n        run: npm publish --access public'));
  });

  it('still has the Release job depending on the publish, which is why the gate is needed', () => {
    // If this ever stops being true the gate is no longer load-bearing, and
    // whoever changed it should have to read this test and say so.
    //
    // Matched as a whole line. A substring match passes on `# needs: publish`,
    // which is how the first version of this assertion went green against a
    // commented-out dependency.
    const job = workflow.slice(workflow.indexOf('\n  github-release:'));
    expect(job).toContain('\n    needs: publish\n');
  });
});
