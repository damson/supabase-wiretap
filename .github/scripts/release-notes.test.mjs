// The release scripts guard a path that runs once per release and cannot be
// rehearsed there, so their decisions are pinned here instead.

import { describe, expect, it } from 'vitest';
import { extractSection, footerStart, sectionHeading } from './release-notes.mjs';

const CHANGELOG = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Added',
  '',
  '- Something not yet released.',
  '',
  '## [0.2.0] - 2026-09-30',
  '',
  '### Fixed',
  '',
  '- The newer thing.',
  '',
  '## [0.1.1]',
  '',
  '- The older thing.',
  '',
  '[Unreleased]: https://example.invalid/compare/v0.2.0...HEAD',
  '[0.2.0]: https://example.invalid/compare/v0.1.1...v0.2.0',
].join('\n');

describe('sectionHeading', () => {
  it('matches a heading with and without a date', () => {
    expect(sectionHeading('0.2.0').test('## [0.2.0] - 2026-09-30')).toBe(true);
    expect(sectionHeading('0.1.1').test('## [0.1.1]')).toBe(true);
  });

  it('does not match a version that merely starts the same', () => {
    // Without the `]` boundary, releasing 0.1 would publish 0.1.1's notes.
    expect(sectionHeading('0.1').test('## [0.1.1]')).toBe(false);
    expect(sectionHeading('0.1.1').test('## [0.1.10]')).toBe(false);
  });

  it('treats the dots as literals rather than as wildcards', () => {
    expect(sectionHeading('0x1x1').test('## [0.1.1]')).toBe(false);
  });
});

describe('extractSection', () => {
  it('returns the body without the heading, stopping at the next section', () => {
    expect(extractSection(CHANGELOG, '0.2.0')).toBe('### Fixed\n\n- The newer thing.');
  });

  it('stops before the link-reference definitions for the oldest section', () => {
    // The regression: nothing follows the oldest section but that block, so a
    // project's first release would otherwise carry it into its Release body.
    expect(extractSection(CHANGELOG, '0.1.1')).toBe('- The older thing.');
  });

  it('leaves a link-reference block out even when it is the whole remainder', () => {
    const onlySection = ['## [0.1.0]', '', '- First.', '', '[0.1.0]: https://example.invalid/v0.1.0'].join('\n');
    expect(extractSection(onlySection, '0.1.0')).toBe('- First.');
  });

  it('keeps a bracketed link used inside the prose', () => {
    const inline = ['## [0.1.0]', '', '- See [the docs](https://example.invalid).', '', '## [0.0.9]'].join('\n');
    expect(extractSection(inline, '0.1.0')).toBe('- See [the docs](https://example.invalid).');
  });

  it('keeps the entries below a definition an entry refers to', () => {
    // The footer is a property of the file. Stopping at the first definition
    // inside a section published only the first entry, with exit 0.
    const mid = [
      '## [0.3.0]',
      '',
      '- The first thing, see [#12].',
      '',
      '[#12]: https://example.invalid/issues/12',
      '',
      '- The second thing, which must not be dropped.',
      '',
      '## [0.2.0]',
      '',
      '- Older.',
      '',
      '[0.3.0]: https://example.invalid/compare/v0.2.0...v0.3.0',
    ].join('\n');
    expect(extractSection(mid, '0.3.0')).toContain('The second thing, which must not be dropped.');
    expect(extractSection(mid, '0.3.0')).toContain('[#12]: https://example.invalid/issues/12');
    expect(extractSection(mid, '0.3.0')).not.toContain('compare/v0.2.0');
  });

  it('reports a heading with no content as absent, because an empty body is not notes', () => {
    const empty = ['## [0.3.0]', '', '## [0.2.0]', '', '- Real.'].join('\n');
    expect(extractSection(empty, '0.3.0')).toBeNull();
  });

  it('reports a version with no heading at all as absent', () => {
    expect(extractSection(CHANGELOG, '9.9.9')).toBeNull();
  });
});

describe('footerStart', () => {
  it('cuts the trailing run of definitions and the blanks between them', () => {
    const lines = ['- Real.', '', '[a]: https://x.invalid', '[b]: https://y.invalid', ''];
    expect(footerStart(lines)).toBe(1);
  });

  it('cuts nothing when the file ends in content', () => {
    const lines = ['[a]: https://x.invalid', '', '- Real.'];
    expect(footerStart(lines)).toBe(3);
  });

  it('cuts everything when the file is nothing but a footer', () => {
    expect(footerStart(['[a]: https://x.invalid', ''])).toBe(0);
    expect(footerStart([])).toBe(0);
  });
});
