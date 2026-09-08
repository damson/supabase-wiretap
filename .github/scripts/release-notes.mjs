// Prints the CHANGELOG section for one version, to be used as a GitHub Release
// body.
//
//   node .github/scripts/release-notes.mjs <version> [changelog-path]
//
// WHY THIS EXISTS. Publishing to npm and publishing a GitHub Release are two
// different acts, and only the first one was automated. v0.1.1 went to the
// registry, carried its provenance, and left the Releases tab saying v0.1.0 was
// the current version: every visitor to the repository read a stale answer,
// while nothing was red. A tag can exist with no Release, and the Releases tab
// is what people read.
//
// WHY IT READS THE CHANGELOG rather than generating notes from commits.
// `--generate-notes` writes a list of merged pull requests, which is a worse
// version of a file this repository already maintains by hand. Reading the
// changelog keeps one source of truth and makes the release fail when that
// source was not updated, which is the moment someone can still fix it.
//
// EXIT CODES:
//   0  the section was found; it is on stdout
//   1  no such section, or it is empty: the changelog was not updated

import { readFileSync } from 'node:fs';

/** Matches `## [1.2.3]`, with or without a trailing ` - 2026-09-08`. */
export function sectionHeading(version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^## \\[${escaped}\\](\\s|$)`);
}

/**
 * The lines of one version's section, from its heading to the next `## `
 * heading or the end of the file, with the heading itself dropped.
 *
 * Link-reference definitions (`[0.1.1]: https://...`) sit below every section,
 * so they fall outside the range by construction rather than by filtering.
 */
export function extractSection(changelog, version) {
  const heading = sectionHeading(version);
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body === '' ? null : body;
}

async function main() {
  const [version, path = 'CHANGELOG.md'] = process.argv.slice(2);

  if (!version) {
    console.error('usage: release-notes.mjs <version> [changelog-path]');
    process.exit(1);
  }

  // "Unreleased" is a section by design and is never a release body. Asking for
  // it means a version string was not resolved somewhere upstream.
  if (/^unreleased$/i.test(version)) {
    console.error('Refusing: "Unreleased" is not a version.');
    process.exit(1);
  }

  let changelog;
  try {
    changelog = readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`Could not read ${path}: ${error.message}`);
    process.exit(1);
  }

  const section = extractSection(changelog, version);
  if (section === null) {
    console.error(
      `No entry for ${version} in ${path}. The changelog has to be closed for a version before it is released, and this is the last point where that is still cheap to fix.`,
    );
    process.exit(1);
  }

  console.log(section);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
