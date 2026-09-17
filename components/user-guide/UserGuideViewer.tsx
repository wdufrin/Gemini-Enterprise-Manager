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

import React, { useState } from 'react';
import { sanitizeLinkUrl } from '../SimpleMarkdownViewer';

interface UserGuideViewerProps {
  content: string;
  highlightQuery?: string;
  className?: string;
  onNavigateToSection?: (sectionId: string) => void;
}

export const UserGuideViewer: React.FC<UserGuideViewerProps> = ({
  content,
  highlightQuery = '',
  className = '',
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [activeImageZoom, setActiveImageZoom] = useState<{ src: string; alt: string } | null>(null);

  const handleCopyCode = async (code: string, index: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Helper to normalize image URLs from markdown
  const normalizeImageUrl = (rawUrl: string): string => {
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('../assets/')) {
      return '/docs/assets/' + trimmed.substring('../assets/'.length);
    }
    if (trimmed.startsWith('./assets/')) {
      return '/docs/assets/' + trimmed.substring('./assets/'.length);
    }
    if (trimmed.startsWith('assets/')) {
      return '/docs/assets/' + trimmed.substring('assets/'.length);
    }
    return trimmed;
  };

  // Query tokens for highlighting
  const searchTokens = highlightQuery
    ? highlightQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1)
    : [];

  const highlightText = (text: string): React.ReactNode => {
    if (searchTokens.length === 0 || !text) return text;

    const regexPattern = searchTokens
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const regex = new RegExp(`(${regexPattern})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (searchTokens.some((t) => t.toLowerCase() === part.toLowerCase())) {
        return (
          <mark key={i} className="bg-yellow-500/30 text-yellow-200 font-semibold px-0.5 rounded">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  // Render inline formatting: bold, italic, code, links
  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="text-white font-semibold">
            {highlightText(part.slice(2, -2))}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="bg-gray-800 text-blue-300 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-700">
            {highlightText(part.slice(1, -1))}
          </code>
        );
      }

      // Link match
      const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        const pre = part.substring(0, linkMatch.index);
        const linkText = linkMatch[1];
        const linkTarget = linkMatch[2];
        const post = part.substring((linkMatch.index || 0) + linkMatch[0].length);

        const safeUrl = sanitizeLinkUrl(linkTarget);
        if (!safeUrl) {
          return (
            <span key={i}>
              {highlightText(pre)}
              {highlightText(linkText)}
              {highlightText(post)}
            </span>
          );
        }

        const isInternalAnchor = linkTarget.startsWith('#');

        return (
          <span key={i}>
            {highlightText(pre)}
            <a
              href={safeUrl}
              target={isInternalAnchor ? '_self' : '_blank'}
              rel={isInternalAnchor ? undefined : 'noopener noreferrer'}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors font-medium"
            >
              {highlightText(linkText)}
            </a>
            {highlightText(post)}
          </span>
        );
      }

      return <span key={i}>{highlightText(part)}</span>;
    });
  };

  // Parse lines into structured elements
  const renderContent = (): React.ReactNode[] => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];

    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer: string[] = [];

    let inTable = false;
    let tableRows: string[][] = [];

    let inDetails = false;
    let detailsSummary = '';
    let detailsBuffer: string[] = [];

    const flushTable = (keyIdx: number) => {
      if (tableRows.length === 0) return;
      const headers = tableRows[0];
      const dataRows = tableRows.slice(1);

      elements.push(
        <div key={`tbl-${keyIdx}`} className="my-5 overflow-x-auto rounded-lg border border-gray-700 bg-gray-900/40">
          <table className="min-w-full divide-y divide-gray-700 text-left text-xs">
            <thead className="bg-gray-800/90 text-gray-200">
              <tr>
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3.5 py-2.5 font-semibold tracking-wider">
                    {renderInline(h.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {dataRows.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-gray-900/20' : 'bg-gray-850/40'}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2 text-xs align-top">
                      {renderInline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Check for <details> and <summary>
      if (trimmed.startsWith('<details>')) {
        inDetails = true;
        detailsSummary = 'Under the hood — the API call this makes';
        detailsBuffer = [];
        return;
      }
      if (inDetails && trimmed.startsWith('<summary>')) {
        detailsSummary = trimmed.replace(/<\/?summary>/g, '').trim();
        return;
      }
      if (inDetails && trimmed.startsWith('</details>')) {
        inDetails = false;
        elements.push(
          <details
            key={`details-${index}`}
            className="my-4 rounded-lg border border-purple-500/30 bg-purple-950/10 overflow-hidden group shadow-sm transition-all"
          >
            <summary className="px-4 py-2.5 bg-purple-900/20 text-purple-300 font-semibold cursor-pointer hover:bg-purple-900/30 transition-colors flex items-center justify-between text-xs select-none">
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                {detailsSummary}
              </span>
              <span className="text-[10px] text-purple-400 bg-purple-900/40 px-2 py-0.5 rounded border border-purple-800">
                Click to expand
              </span>
            </summary>
            <div className="p-4 space-y-2 border-t border-purple-500/20 bg-gray-900/70">
              <UserGuideViewer content={detailsBuffer.join('\n')} highlightQuery={highlightQuery} />
            </div>
          </details>
        );
        detailsBuffer = [];
        return;
      }
      if (inDetails) {
        detailsBuffer.push(line);
        return;
      }

      // Code blocks
      if (trimmed.startsWith('```')) {
        if (inTable) flushTable(index);

        if (inCodeBlock) {
          const rawCode = codeBuffer.join('\n');
          const codeIdx = index;
          const isCopied = copiedIndex === codeIdx;

          elements.push(
            <div key={`code-${codeIdx}`} className="my-4 rounded-lg border border-gray-700 bg-gray-950 shadow-md overflow-hidden group">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 text-[11px] font-mono text-gray-400 select-none">
                <span className="uppercase text-blue-400 font-semibold">
                  {codeLanguage || 'text'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(rawCode, codeIdx)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors"
                  title="Copy code"
                >
                  {isCopied ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-green-400 text-[11px]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      <span className="text-[11px]">Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 text-xs font-mono text-gray-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar">
                {highlightText(rawCode)}
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeBuffer = [];
          codeLanguage = '';
        } else {
          inCodeBlock = true;
          codeLanguage = trimmed.substring(3).trim();
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // Markdown Tables
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        // Skip separator row (e.g. |---|---|)
        const isSeparator = new RegExp('^\\|[\\-\\:\\s\\|]+\\|$').test(trimmed);
        if (isSeparator) {
          return;
        }
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        if (!inTable) {
          inTable = true;
          tableRows = [cells];
        } else {
          tableRows.push(cells);
        }
        return;
      } else if (inTable) {
        flushTable(index);
      }

      // Image: ![alt](url)
      const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (imgMatch) {
        const altText = imgMatch[1];
        const srcUrl = normalizeImageUrl(imgMatch[2]);

        elements.push(
          <figure key={`img-${index}`} className="my-6 rounded-lg overflow-hidden border border-gray-700 bg-gray-900/60 p-2 shadow-lg">
            <div
              className="relative group cursor-pointer overflow-hidden rounded"
              onClick={() => setActiveImageZoom({ src: srcUrl, alt: altText })}
              title="Click to enlarge"
            >
              <img
                src={srcUrl}
                alt={altText}
                loading="lazy"
                className="w-full h-auto max-h-[460px] object-contain rounded transition-transform duration-200 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <span className="bg-gray-900/90 text-white text-xs px-3 py-1.5 rounded-full border border-gray-600 flex items-center gap-1.5 shadow">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                  Click to enlarge screenshot
                </span>
              </div>
            </div>
            {altText && (
              <figcaption className="mt-2 text-center text-xs text-gray-400 italic px-4">
                {altText}
              </figcaption>
            )}
          </figure>
        );
        return;
      }

      // Callout Alerts: > [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT], > [!CAUTION]
      const alertMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\](.*)$/i);
      if (alertMatch) {
        const alertType = alertMatch[1].toUpperCase();
        const alertStyles = {
          NOTE: 'border-blue-500 bg-blue-950/20 text-blue-200',
          TIP: 'border-emerald-500 bg-emerald-950/20 text-emerald-200',
          WARNING: 'border-amber-500 bg-amber-950/20 text-amber-200',
          IMPORTANT: 'border-purple-500 bg-purple-950/20 text-purple-200',
          CAUTION: 'border-red-500 bg-red-950/20 text-red-200',
        }[alertType] || 'border-blue-500 bg-blue-950/20 text-blue-200';

        elements.push(
          <div key={`alert-${index}`} className={`my-3 p-3.5 rounded-r-lg border-l-4 ${alertStyles} text-xs leading-relaxed shadow-xs`}>
            <div className="font-bold text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>{alertType}</span>
            </div>
            <div>{renderInline(alertMatch[2] || '')}</div>
          </div>
        );
        return;
      }

      // Plain Blockquotes: > ...
      if (trimmed.startsWith('> ')) {
        elements.push(
          <blockquote key={`bq-${index}`} className="my-3 pl-3.5 py-1 border-l-2 border-gray-600 bg-gray-900/30 text-gray-300 italic text-xs">
            {renderInline(trimmed.substring(2))}
          </blockquote>
        );
        return;
      }

      // Headings
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${index}`} className="text-2xl font-bold text-white mt-6 mb-3 border-b border-gray-700 pb-2">
            {renderInline(line.substring(2))}
          </h1>
        );
        return;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={`h2-${index}`} className="text-xl font-bold text-gray-100 mt-5 mb-2.5">
            {renderInline(line.substring(3))}
          </h2>
        );
        return;
      }
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={`h3-${index}`} className="text-base font-semibold text-blue-300 mt-4 mb-2">
            {renderInline(line.substring(4))}
          </h3>
        );
        return;
      }
      if (line.startsWith('#### ')) {
        elements.push(
          <h4 key={`h4-${index}`} className="text-sm font-semibold text-purple-300 mt-3 mb-1.5">
            {renderInline(line.substring(5))}
          </h4>
        );
        return;
      }

      // Horizontal Rule
      if (trimmed === '---' || trimmed === '***') {
        elements.push(<hr key={`hr-${index}`} className="my-5 border-gray-700/80" />);
        return;
      }

      // Lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(
          <li key={`ul-${index}`} className="ml-5 list-disc text-gray-300 mb-1 pl-1 text-xs leading-relaxed">
            {renderInline(trimmed.substring(2))}
          </li>
        );
        return;
      }

      // Numbered Lists
      if (/^\d+\.\s/.test(trimmed)) {
        const itemContent = trimmed.replace(/^\d+\.\s/, '');
        elements.push(
          <li key={`ol-${index}`} className="ml-5 list-decimal text-gray-300 mb-1 pl-1 text-xs leading-relaxed">
            {renderInline(itemContent)}
          </li>
        );
        return;
      }

      // Empty Lines
      if (trimmed === '') {
        elements.push(<div key={`sp-${index}`} className="h-2"></div>);
        return;
      }

      // Default Paragraph
      elements.push(
        <p key={`p-${index}`} className="text-gray-300 mb-2 leading-relaxed text-xs">
          {renderInline(line)}
        </p>
      );
    });

    if (inTable) flushTable(lines.length);

    return elements;
  };

  return (
    <div className={`user-guide-content space-y-1 ${className}`}>
      {content ? renderContent() : <p className="text-gray-500 italic text-xs">No content selected.</p>}

      {/* Lightbox Zoom Modal */}
      {activeImageZoom && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveImageZoom(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setActiveImageZoom(null)}
              className="absolute -top-10 right-0 text-gray-300 hover:text-white p-1 rounded hover:bg-gray-800"
              aria-label="Close image zoom"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={activeImageZoom.src}
              alt={activeImageZoom.alt}
              className="max-w-full max-h-[82vh] object-contain rounded-lg border border-gray-700 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            {activeImageZoom.alt && (
              <p className="mt-3 text-sm text-gray-300 text-center max-w-2xl px-2">
                {activeImageZoom.alt}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserGuideViewer;
