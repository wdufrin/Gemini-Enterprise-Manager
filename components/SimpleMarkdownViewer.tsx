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

import React from 'react';

/**
 * URL schemes an inline markdown link is allowed to use.
 *
 * - `http:` / `https:` -- ordinary web links; the overwhelming majority of
 *   markdown links, and the only thing this viewer's content realistically
 *   needs.
 * - `mailto:` -- common in documentation ("questions? mail the owners"), and
 *   handing a string to the user's mail client cannot execute script in this
 *   origin.
 *
 * Everything else is rejected. The ones that matter:
 * - `javascript:` / `vbscript:` -- execute script with this page's origin.
 * - `data:` -- `data:text/html,<script>...` is a script-execution and
 *   phishing carrier.
 * - `blob:` / `file:` -- reference in-page or local-disk resources.
 * - `tel:`, `sms:`, `ftp:`, everything else -- no use case here, and each
 *   scheme admitted is one more URL parser to reason about. Allowlist, not
 *   denylist: an unknown future scheme is rejected by default.
 */
const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);

/**
 * Schemes that must never survive decoding. This is a secondary check behind
 * the allowlist, for inputs whose scheme is obfuscated well enough that the
 * URL parser reads them as a *relative* reference (`&#106;avascript:...`
 * starts with `&`, so it has no scheme as far as the parser is concerned).
 */
const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'] as const;

/** Matches a leading RFC 3986 scheme, e.g. `https:`, `mailto:`, `x-foo.1+bar:`. */
const LEADING_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Base used solely to let the URL parser resolve relative references. It is
 * never emitted: relative input is returned unchanged.
 */
const RELATIVE_URL_BASE = 'https://relative.invalid/';

/**
 * Removes characters a browser discards before it parses the scheme.
 *
 * This matters: a browser strips TAB, LF and CR out of a URL, so
 * `java&#9;script:alert(1)` navigates as `javascript:alert(1)`. If the
 * sanitizer inspected the raw string it would be checking something the
 * browser never sees. C0 controls (including NUL) and DEL are removed for the
 * same reason -- none is legal in a URL, and each has been used to break up a
 * scheme name.
 */
const stripIgnoredCharacters = (value: string): string =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[\u0000-\u001F\u007F]/g, '');

/** `String.fromCodePoint` that yields '' instead of throwing on bad input. */
const codePointOrEmpty = (codePoint: number): string => {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return '';
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    // Lone surrogates (U+D800-U+DFFF) throw.
    return '';
  }
};

/**
 * Decodes the HTML entity forms that are actually used to hide a scheme.
 * Trailing semicolons are optional because HTML parsers accept them that way.
 */
const decodeEntities = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) =>
      codePointOrEmpty(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_match, decimal: string) =>
      codePointOrEmpty(parseInt(decimal, 10)),
    )
    .replace(/&colon;?/gi, ':')
    .replace(/&tab;?/gi, '\t')
    .replace(/&newline;?/gi, '\n')
    .replace(/&amp;/gi, '&');

/**
 * True when `value` resolves to a dangerous scheme under any layer of entity
 * or percent encoding.
 *
 * Decoding is repeated because `&amp;#106;avascript:` and `%256a...` only
 * reveal themselves on a second pass, and bounded so a crafted input cannot
 * spin here.
 */
const hasDangerousScheme = (value: string): boolean => {
  let candidate = value;

  for (let pass = 0; pass < 3; pass++) {
    let decoded = decodeEntities(candidate);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Malformed percent-encoding; keep the entity-decoded form.
    }
    decoded = stripIgnoredCharacters(decoded).trim();
    if (decoded === candidate) break;
    candidate = decoded;
  }

  const normalized = candidate.toLowerCase();
  return DANGEROUS_SCHEMES.some((scheme) => normalized.startsWith(scheme));
};

/**
 * Returns a URL safe to place in an `href`, or null when it must not be
 * linked at all.
 *
 * Callers must render the link text as plain text on null -- dropping the
 * content would lose information the author wrote.
 *
 * Accepts absolute URLs on an allowlisted scheme and ordinary relative
 * references (`/docs/x`, `./x`, `#section`). Protocol-relative `//host/path`
 * is rejected: it reads as relative but silently navigates off-origin, and
 * markdown authors essentially never mean it.
 *
 * Takes `unknown` because the markdown text is untrusted at runtime and this
 * file is compiled with `strict: false`, so a `string` annotation would not
 * actually guarantee a string.
 */
export const sanitizeLinkUrl = (rawUrl: unknown): string | null => {
  if (typeof rawUrl !== 'string') return null;

  const cleaned = stripIgnoredCharacters(rawUrl).trim();
  if (!cleaned) return null;

  if (cleaned.startsWith('//')) return null;
  if (hasDangerousScheme(cleaned)) return null;

  let parsed: URL;
  try {
    parsed = new URL(cleaned, RELATIVE_URL_BASE);
  } catch {
    return null;
  }

  // `parsed.protocol` is already lowercased by the URL parser, so
  // `JavaScript:` and `javascript:` compare equal here.
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return null;

  // The base supplied the protocol for a relative reference, so return the
  // author's original text rather than the placeholder origin.
  if (!LEADING_SCHEME.test(cleaned)) return cleaned;

  return parsed.href;
};

interface SimpleMarkdownViewerProps {
    content: string;
    className?: string;
}

const SimpleMarkdownViewer: React.FC<SimpleMarkdownViewerProps> = ({ content, className }) => {
    // Basic Markdown Processing
    const renderMarkdown = (text: string): React.ReactNode[] => {
        const lines = text.split('\n');
        const elements: React.ReactNode[] = [];
        let codeBlockActive = false;
        let codeBlockContent: string[] = [];
        let codeBlockLanguage = '';

        lines.forEach((line, index) => {
            // Code Blocks
            if (line.trim().startsWith('```')) {
                if (codeBlockActive) {
                    // End code block
                    elements.push(
                        <div key={`code-${index}`} className="my-4 bg-gray-900 rounded-lg p-4 overflow-x-auto border border-gray-700">
                             {codeBlockLanguage && <div className="text-xs text-gray-500 mb-1 select-none">{codeBlockLanguage}</div>}
                            <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">
                                {codeBlockContent.join('\n')}
                            </pre>
                        </div>
                    );
                    codeBlockActive = false;
                    codeBlockContent = [];
                    codeBlockLanguage = '';
                } else {
                    // Start code block
                    codeBlockActive = true;
                    codeBlockLanguage = line.trim().substring(3).trim();
                }
                return;
            }

            if (codeBlockActive) {
                codeBlockContent.push(line);
                return;
            }

            // Tables (Basic rendering as pre-formatted text for now, maybe improve later)
            if (line.trim().startsWith('|')) {
                 elements.push(
                    <div key={`table-row-${index}`} className="font-mono text-xs whitespace-pre overflow-x-auto text-gray-400">
                        {line}
                    </div>
                );
                return;
            }


            // Headers
            if (line.startsWith('# ')) {
                elements.push(<h1 key={index} className="text-3xl font-bold text-white mt-8 mb-4 border-b border-gray-700 pb-2">{line.substring(2)}</h1>);
                return;
            }
            if (line.startsWith('## ')) {
                elements.push(<h2 key={index} className="text-2xl font-bold text-gray-100 mt-6 mb-3">{line.substring(3)}</h2>);
                return;
            }
            if (line.startsWith('### ')) {
                elements.push(<h3 key={index} className="text-xl font-semibold text-gray-200 mt-5 mb-2">{line.substring(4)}</h3>);
                return;
            }
            if (line.startsWith('#### ')) {
                elements.push(<h4 key={index} className="text-lg font-semibold text-gray-300 mt-4 mb-2">{line.substring(5)}</h4>);
                return;
            }

            // Horizontal Rule
            if (line.trim() === '---' || line.trim() === '***') {
                elements.push(<hr key={index} className="my-6 border-gray-700" />);
                return;
            }

            // Blockquotes
            if (line.startsWith('> ')) {
                elements.push(
                    <div key={index} className="border-l-4 border-blue-500 pl-4 py-1 my-2 bg-gray-800/50 rounded-r text-gray-300 italic">
                        {line.substring(2)}
                    </div>
                );
                return;
            }

            // Lists
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                elements.push(
                    <li key={index} className="ml-4 list-disc text-gray-300 mb-1 pl-1">
                        {renderInline(line.trim().substring(2))}
                    </li>
                );
                return;
            }
            // Ordered Lists (basic support)
             if (/^\d+\.\s/.test(line.trim())) {
                const content = line.trim().replace(/^\d+\.\s/, '');
                elements.push(
                    <li key={index} className="ml-4 list-decimal text-gray-300 mb-1 pl-1">
                        {renderInline(content)}
                    </li>
                );
                return;
            }


            // Empty lines (paragraph breaks)
            if (line.trim() === '') {
                elements.push(<div key={index} className="h-2"></div>);
                return;
            }

            // Default Paragraph
            elements.push(<p key={index} className="text-gray-300 mb-2 leading-relaxed">{renderInline(line)}</p>);
        });

        return elements;
    };

    // Very basic inline parsing for bold, italic, code
    const renderInline = (text: string): React.ReactNode => {
        // Split by bold (**text**)
        // This is a naive implementation and won't handle nested styles deeply
        const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g); 
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={i} className="bg-gray-800 text-blue-300 px-1 py-0.5 rounded text-sm font-mono">{part.slice(1, -1)}</code>;
            }
            // Basic link detection (very naive) [text](url)
            const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
            if (linkMatch) {
                // Return text with link replaced (only supports one link per segment for now)
                const pre = part.substring(0, linkMatch.index);
                const linkText = linkMatch[1];
                const linkUrl = sanitizeLinkUrl(linkMatch[2]);
                const post = part.substring((linkMatch.index || 0) + linkMatch[0].length);

                // Unsafe or unparseable target: show the author's text, but
                // never turn it into a navigable link.
                if (linkUrl === null) {
                    return (
                        <span key={i}>
                            {pre}
                            {linkText}
                            {post}
                        </span>
                    );
                }

                return (
                    <span key={i}>
                        {pre}
                        <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                            {linkText}
                        </a>
                        {post}
                    </span>
                );
            }
            
            return part;
        });
    };

    return (
        <div className={`markdown-body space-y-1 ${className}`}>
            {content ? renderMarkdown(content) : <p className="text-gray-500 italic">No content selected.</p>}
        </div>
    );
};

export default SimpleMarkdownViewer;
