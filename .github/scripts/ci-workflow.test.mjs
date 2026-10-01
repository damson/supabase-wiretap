// Keeps the two Node floors apart, and keeps each one honest.
//
// The package ships no runtime dependencies and supports Node 20 for the people
// who install it. The toolchain that builds and tests it needs 22, because
// `@supabase/supabase-js` requires `>=22.0.0` and the test runner has since
// joined it. Those are different numbers about different audiences, and the CI
// matrix used to state only one of them.
//
// What went wrong without this: the matrix ran Node 20 while a devDependency
// said it needed 22. npm reports that as a warning rather than an error without
// `engine-strict`, so the leg stayed green while proving nothing, and the first
// patch release to use a 22-only API would have turned it red with no change
// here.
//
// Comments are stripped before anything is matched. A commented-out line is not
// evidence, which this repository has now learned twice.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, root)), 'utf8');

const workflow = read('.github/workflows/ci.yml')
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

const manifest = JSON.parse(read('package.json'));

/** The job block for `  <key>:`, up to the next job at the same indent. */
function job(key) {
  const start = workflow.indexOf(`\n  ${key}:`);
  if (start === -1) return null;
  const next = workflow.indexOf('\n  ', start + 3 + key.length);
  const end = workflow.slice(start + 1).search(/\n {2}\w[\w-]*:/);
  return end === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + end);
}

/** The Node majors the `verify` matrix runs, as numbers. */
export function matrixMajors(text) {
  const m = text.match(/node:\s*\[([^\]]+)\]/);
  if (!m) throw new Error('no node matrix found in the verify job');
  return m[1].split(',').map((v) => Number(v.trim().replace(/['"]/g, '')));
}

/**
 * Whether an npm `engines.node` range admits a Node major.
 *
 * Deliberately narrow: it understands `^X`, `>=X` and `>X`, which is every
 * shape these dependencies actually use, and THROWS on anything else. An
 * engines range nobody can parse is a reason to look at it, not a reason to
 * assume either answer.
 */
export function supportsMajor(range, major) {
  return range
    .split('||')
    .map((clause) => clause.trim())
    .some((clause) => {
      let m = clause.match(/^\^(\d+)\./) ?? clause.match(/^\^(\d+)$/);
      if (m) return major === Number(m[1]);
      m = clause.match(/^>=\s*v?(\d+)/);
      if (m) return major >= Number(m[1]);
      m = clause.match(/^>\s*v?(\d+)/);
      if (m) return major > Number(m[1]);
      throw new Error(`unparsed engines clause "${clause}" in "${range}"`);
    });
}

/** The floor a `>=X` style engines range declares. */
export function declaredFloor(range) {
  const m = range.match(/>=\s*v?(\d+)/);
  if (!m) throw new Error(`cannot read a floor out of "${range}"`);
  return Number(m[1]);
}

describe('supportsMajor', () => {
  it('reads the shapes these dependencies use', () => {
    expect(supportsMajor('^22.12.0 || ^24.0.0 || >=26.0.0', 20)).toBe(false);
    expect(supportsMajor('^22.12.0 || ^24.0.0 || >=26.0.0', 22)).toBe(true);
    expect(supportsMajor('^22.12.0 || ^24.0.0 || >=26.0.0', 24)).toBe(true);
    expect(supportsMajor('^22.12.0 || ^24.0.0 || >=26.0.0', 26)).toBe(true);
    expect(supportsMajor('>=22.0.0', 20)).toBe(false);
    expect(supportsMajor('>=16.20.0', 22)).toBe(true);
  });

  it('throws on a shape it does not understand, rather than guessing', () => {
    // Guessing here would answer a question about what CI supports with a coin
    // flip, and the answer would be reported as a passing test.
    expect(() => supportsMajor('~22.1.0', 22)).toThrow(/unparsed engines clause/);
  });
});

describe('the development floor', () => {
  const majors = matrixMajors(job('verify'));

  it('runs the suite on more than one Node', () => {
    expect(majors.length).toBeGreaterThan(1);
  });

  it.each(Object.keys(manifest.devDependencies))(
    'is high enough for %s',
    (name) => {
      const range = JSON.parse(read(`node_modules/${name}/package.json`)).engines?.node;
      if (!range) return; // declares nothing, so it constrains nothing
      for (const major of majors) {
        expect(
          supportsMajor(range, major),
          `${name} declares engines.node "${range}", which does not admit Node ${major}. ` +
            'Either raise the matrix or hold that dependency back: npm only warns, so ' +
            'CI would stay green while testing on a runtime nobody supports.',
        ).toBe(true);
      }
    },
  );
});

describe('the published floor', () => {
  const consume = job('package');

  it('is proved on exactly the Node the package claims in engines', () => {
    const floor = declaredFloor(manifest.engines.node);
    expect(consume).toContain(`node-version: '${floor}'`);
  });

  it('installs nothing but the tarball, the way a consumer does', () => {
    // The old job ran `npm ci` first, so it proved the published floor by
    // installing the entire devDependency tree on it. That is how a
    // devDependency needing Node 22 ended up being installed on Node 20.
    expect(consume).not.toContain('npm ci');
    expect(consume).not.toContain('actions/checkout');
    expect(consume).toMatch(/npm install[^\n]*"\$tarball"/);
  });

  it('takes the tarball from the job that packed it', () => {
    expect(consume).toMatch(/needs:\s*pack/);
    expect(consume).toContain('actions/download-artifact');
  });
});
