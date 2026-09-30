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

/** Matches a link-reference definition: `[0.1.1]: https://...`. */
const LINK_DEFINITION = /^\[[^\]]+\]:\s/;

/**
 * Where the file's footer of link-reference definitions starts: one past the
 * last line that is neither blank nor a definition.
 *
 * The footer belongs to the FILE, not to any one section, so it is cut once
 * here rather than by stopping a section at the first definition it meets. A
 * definition an entry refers to sits INSIDE its section, and terminating there
 * drops every entry below it from the Release body, silently and with exit 0.
 */
export function footerStart(lines) {
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1].trim();
    if (line === '' || LINK_DEFINITION.test(line)) end -= 1;
    else break;
  }
  return end;
}

/**
 * The lines of one version's section, from its heading to the next `## `
 * heading or the end of the content, with the heading itself dropped.
 *
 * The footer is cut before the search, which is what keeps the OLDEST section
 * honest: nothing follows it but that block, so a project's first release would
 * otherwise have shipped `[0.1.0]: https://...` in the body of its own GitHub
 * Release.
 */
export function extractSection(changelog, version) {
  const all = changelog.split('\n');
  const lines = all.slice(0, footerStart(all));
  const heading = sectionHeading(version);
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
