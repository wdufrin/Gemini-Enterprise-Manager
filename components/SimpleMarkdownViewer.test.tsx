/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimpleMarkdownViewer, { sanitizeLinkUrl } from './SimpleMarkdownViewer';

/**
 * Every one of these produced a live `javascript:` href before the sanitizer
 * existed, or would have if the check had been a naive
 * `startsWith('javascript:')`. Each must come back null.
 *
 * The obfuscations are grouped by the mechanism they abuse, because the
 * defence differs: case folding is handled by lowercasing, control characters
 * by stripping what the browser itself strips, and entity/percent forms by
 * decoding before inspection.
 */
const SCHEME_BYPASS_VECTORS: ReadonlyArray<[label: string, payload: string]> = [
  ['plain javascript:', 'javascript:alert(document.cookie)'],
  ['mixed case', 'JavaScript:alert(1)'],
  ['upper case', 'JAVASCRIPT:alert(1)'],
  ['leading whitespace', '   javascript:alert(1)'],
  ['trailing whitespace', 'javascript:alert(1)   '],
  ['leading newline', '\njavascript:alert(1)'],
  ['embedded tab in scheme', 'java\tscript:alert(1)'],
  ['embedded newline in scheme', 'java\nscript:alert(1)'],
  ['embedded carriage return in scheme', 'java\rscript:alert(1)'],
  ['embedded NUL in scheme', 'java\u0000script:alert(1)'],
  ['embedded C0 control in scheme', 'java\u0001script:alert(1)'],
  ['decimal HTML entity', '&#106;avascript:alert(1)'],
  ['hex HTML entity', '&#x6a;avascript:alert(1)'],
  ['entity without semicolon', '&#106avascript:alert(1)'],
  ['double-encoded entity', '&amp;#106;avascript:alert(1)'],
  ['&colon; entity', 'javascript&colon;alert(1)'],
  ['&Tab; entity inside scheme', 'java&Tab;script:alert(1)'],
  ['percent-encoded first byte', '%6Aavascript:alert(1)'],
  ['case + whitespace + tab combined', '  Java\tScript:alert(1)'],
  ['vbscript:', 'vbscript:msgbox(1)'],
  ['VBScript: mixed case', 'VBScript:msgbox(1)'],
  ['data: html', 'data:text/html,<script>alert(1)</script>'],
  ['data: base64 html', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ['data: with tab', 'da\tta:text/html,<script>alert(1)</script>'],
  ['file:', 'file:///etc/passwd'],
  ['blob:', 'blob:https://untrusted.example.com/abc'],
  ['protocol-relative host', '//untrusted.example.com/payload'],
  ['protocol-relative with backslash-free path', '//untrusted.example.com'],
];

describe('sanitizeLinkUrl', () => {
  describe('rejects every known scheme-smuggling vector', () => {
    it.each(SCHEME_BYPASS_VECTORS)('rejects %s', (_label, payload) => {
      expect(sanitizeLinkUrl(payload)).toBeNull();
    });
  });

  it('rejects schemes that are merely unrecognised, not just dangerous ones', () => {
    // Allowlist, not denylist: anything outside http/https/mailto is out.
    expect(sanitizeLinkUrl('ftp://untrusted.example.com/x')).toBeNull();
    expect(sanitizeLinkUrl('tel:+15550100')).toBeNull();
    expect(sanitizeLinkUrl('sms:+15550100')).toBeNull();
    expect(sanitizeLinkUrl('about:blank')).toBeNull();
    expect(sanitizeLinkUrl('chrome://settings')).toBeNull();
    expect(sanitizeLinkUrl('intent://scan/#Intent;scheme=untrusted;end')).toBeNull();
  });

  it('rejects empty, whitespace-only and non-string input', () => {
    expect(sanitizeLinkUrl('')).toBeNull();
    expect(sanitizeLinkUrl('   ')).toBeNull();
    expect(sanitizeLinkUrl('\t\n')).toBeNull();
    // tsconfig has `strict: false`, so these are reachable at runtime.
    expect(sanitizeLinkUrl(null)).toBeNull();
    expect(sanitizeLinkUrl(undefined)).toBeNull();
    expect(sanitizeLinkUrl(42)).toBeNull();
    expect(sanitizeLinkUrl({ href: 'https://example.com' })).toBeNull();
  });

  it('rejects syntactically broken absolute URLs', () => {
    expect(sanitizeLinkUrl('http://')).toBeNull();
    expect(sanitizeLinkUrl('https://')).toBeNull();
  });

  it('allows ordinary http and https links', () => {
    expect(sanitizeLinkUrl('https://example.com/docs')).toBe('https://example.com/docs');
    expect(sanitizeLinkUrl('http://example.com/docs')).toBe('http://example.com/docs');
    expect(sanitizeLinkUrl('https://example.com/a?b=c#d')).toBe('https://example.com/a?b=c#d');
  });

  it('allows an external host: linking off-site is not the vulnerability', () => {
    // This viewer renders third-party markdown. A link to another origin is
    // normal content; only the scheme is a security decision here.
    expect(sanitizeLinkUrl('https://untrusted.example.com/page')).toBe(
      'https://untrusted.example.com/page',
    );
  });

  it('allows mailto links', () => {
    expect(sanitizeLinkUrl('mailto:owner@example.com')).toBe('mailto:owner@example.com');
    expect(sanitizeLinkUrl('MAILTO:owner@example.com')).toBe('mailto:owner@example.com');
  });

  it('allows relative references and returns them unchanged', () => {
    expect(sanitizeLinkUrl('/docs/page')).toBe('/docs/page');
    expect(sanitizeLinkUrl('./page.md')).toBe('./page.md');
    expect(sanitizeLinkUrl('../sibling/page.md')).toBe('../sibling/page.md');
    expect(sanitizeLinkUrl('page.md?q=1')).toBe('page.md?q=1');
    expect(sanitizeLinkUrl('#section-two')).toBe('#section-two');
  });

  it('trims surrounding whitespace from accepted URLs too', () => {
    expect(sanitizeLinkUrl('  https://example.com/docs  ')).toBe('https://example.com/docs');
    expect(sanitizeLinkUrl('\n/docs/page\n')).toBe('/docs/page');
  });

  it('strips control characters a browser would ignore from accepted URLs', () => {
    // The href must be exactly what the browser would act on, with nothing
    // left over for a later parser to reinterpret.
    expect(sanitizeLinkUrl('https://exa\tmple.com/docs')).toBe('https://example.com/docs');
  });
});

describe('SimpleMarkdownViewer link rendering', () => {
  it('renders a safe link as an anchor', () => {
    render(<SimpleMarkdownViewer content="See [the docs](https://example.com/docs) here." />);
    const anchor = screen.getByRole('link', { name: 'the docs' });
    expect(anchor).toHaveAttribute('href', 'https://example.com/docs');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a javascript: link as plain text, keeping the text and the surrounding prose', () => {
    render(<SimpleMarkdownViewer content="Before [click me](javascript:alert(document.cookie)) after." />);

    expect(screen.queryByRole('link')).toBeNull();
    // The author's words survive; only the navigation is removed.
    expect(screen.getByText(/click me/)).toBeTruthy();
    expect(screen.getByText(/Before/)).toBeTruthy();
    expect(screen.getByText(/after\./)).toBeTruthy();
  });

  it('emits no anchor with a dangerous href for any bypass vector', () => {
    const markdown = SCHEME_BYPASS_VECTORS.map(
      ([label, payload]) => `- [${label}](${payload})`,
    ).join('\n');

    const { container } = render(<SimpleMarkdownViewer content={markdown} />);

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href') ?? '',
    );
    for (const href of hrefs) {
      expect(href.toLowerCase()).not.toContain('javascript:');
      expect(href.toLowerCase()).not.toContain('vbscript:');
      expect(href.toLowerCase()).not.toContain('data:');
    }
  });
});
