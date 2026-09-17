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

import ch0Raw from '../docs/guide/00-getting-started.md?raw';
import ch1Raw from '../docs/guide/01-agent-management.md?raw';
import ch2Raw from '../docs/guide/02-knowledge-and-testing.md?raw';
import ch3Raw from '../docs/guide/03-security-and-observability.md?raw';
import ch4Raw from '../docs/guide/04-system-and-appendices.md?raw';
import masterGuideRaw from '../docs/USER_GUIDE.md?raw';

export interface GuideSection {
  id: string;
  title: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  category: string;
  tabName?: string;
  content: string;
  headings: string[];
  cleanText: string;
  wordCount: number;
}

export interface GuideChapter {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  category: string;
  description: string;
  sections: GuideSection[];
}

export interface SearchResult {
  section: GuideSection;
  score: number;
  matchType: 'title' | 'heading' | 'tab' | 'category' | 'body';
  snippet: string;
  matchedTerms: string[];
}

export const GUIDE_CATEGORIES = [
  'All',
  'Getting Started',
  'Agent Management',
  'Knowledge & Testing',
  'Security & Access',
  'System Operations',
  'Appendices',
] as const;

export type GuideCategory = typeof GUIDE_CATEGORIES[number];

// Chapter configurations mapping file raw strings to categories
const CHAPTER_METADATA: Array<{
  id: string;
  number: number;
  raw: string;
  category: string;
  shortTitle: string;
  description: string;
}> = [
  {
    id: 'ch0',
    number: 0,
    raw: ch0Raw,
    category: 'Getting Started',
    shortTitle: 'Getting Started & UI',
    description: 'Authentication, OAuth SSO, pasted tokens, pre-flight checks, and console chrome.',
  },
  {
    id: 'ch1',
    number: 1,
    raw: ch1Raw,
    category: 'Agent Management',
    shortTitle: 'Agent Management',
    description: 'GE Agent Manager, Skills Registry, ADK Studio, and Vertex AI Agent Runtimes.',
  },
  {
    id: 'ch2',
    number: 2,
    raw: ch2Raw,
    category: 'Knowledge & Testing',
    shortTitle: 'Knowledge & Testing',
    description: 'Connectors & Data Stores, Quota & Cost Estimator, Engines & Assistants, and Architecture.',
  },
  {
    id: 'ch3',
    number: 3,
    raw: ch3Raw,
    category: 'Security & Access',
    shortTitle: 'Security & Access',
    description: 'Authorizations, Agent Permissions IAM scanner, Model Armor, and BigQuery Observability.',
  },
  {
    id: 'ch4',
    number: 4,
    raw: ch4Raw,
    category: 'System Operations',
    shortTitle: 'System & Appendices',
    description: 'Backup & Recovery, App Config Audit, Licenses, Error Message Index, and IAM Matrix.',
  },
];

// Helper to strip markdown symbols for clean text indexing & snippet extraction
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#+\s+/gm, '') // headings
    .replace(/^>\s*/gm, '') // blockquotes
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/```[\s\S]*?```/g, ' ') // code blocks
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/[|─┌┐└┘├┤┬┴┼]/g, ' ') // tables
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

// Map section titles to specific sidebar tabs where applicable
function mapTabName(title: string): string | undefined {
  const lower = title.toLowerCase();
  if (lower.includes('ge agent manager') || lower === 'agent manager') return 'GE Agent Manager';
  if (lower.includes('skills registry')) return 'Skills Registry';
  if (lower.includes('adk studio') || lower.includes('agent builder')) return 'Agent Builder';
  if (lower.includes('agent runtimes') || lower.includes('engines')) return 'Agent Engines';
  if (lower.includes('connectors') && lower.includes('data stores')) return 'Data Stores';
  if (lower.includes('quota') || lower.includes('cost estimator')) return 'GE Quota Usage';
  if (lower.includes('engines & assistants') || lower.includes('assistants')) return 'Assistant';
  if (lower.includes('architecture')) return 'Architecture';
  if (lower.includes('authorizations')) return 'Authorizations';
  if (lower.includes('agent permissions')) return 'Agent Permissions';
  if (lower.includes('model armor')) return 'Model Armor';
  if (lower.includes('observability')) return 'Observability';
  if (lower.includes('backup & recovery')) return 'Backup & Recovery';
  if (lower.includes('config audit')) return 'Config Audit';
  if (lower.includes('licenses')) return 'Licenses';
  return undefined;
}

// Generate URL slug from title
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

// Parse markdown chapters into structured data
function parseChapters(): GuideChapter[] {
  return CHAPTER_METADATA.map((meta) => {
    const raw = meta.raw || '';
    const lines = raw.split('\n');
    const h1Line = lines.find((l) => l.startsWith('# ')) || `# Chapter ${meta.number}`;
    const chapterFullTitle = h1Line.replace(/^#\s+/, '').trim();

    // Split markdown by '## ' (H2 sections)
    const rawSections: Array<{ title: string; content: string }> = [];
    const sectionBlocks = raw.split(/\n(?=##\s+)/);

    sectionBlocks.forEach((block, idx) => {
      const trimmed = block.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('## ')) {
        const firstLineEnd = trimmed.indexOf('\n');
        const titleLine = firstLineEnd === -1 ? trimmed : trimmed.substring(0, firstLineEnd);
        const sectionTitle = titleLine.replace(/^##\s+/, '').trim();
        const sectionBody = firstLineEnd === -1 ? '' : trimmed.substring(firstLineEnd + 1);
        rawSections.push({ title: sectionTitle, content: sectionBody });
      } else if (idx === 0) {
        // Chapter overview before first ##
        rawSections.push({
          title: `${chapterFullTitle} — Overview`,
          content: trimmed,
        });
      }
    });

    const parsedSections: GuideSection[] = rawSections.map((sec, secIdx) => {
      const secId = `ch${meta.number}-${slugify(sec.title) || `sec-${secIdx}`}`;
      const subheadings: string[] = [];
      const headingRegex = /^###+\s+(.+)$/gm;
      let match;
      while ((match = headingRegex.exec(sec.content)) !== null) {
        subheadings.push(match[1].trim());
      }

      // Determine category for appendix items
      let sectionCategory = meta.category;
      if (sec.title.toLowerCase().startsWith('appendix')) {
        sectionCategory = 'Appendices';
      }

      const clean = stripMarkdown(sec.content);
      const words = clean.split(/\s+/).filter(Boolean).length;

      return {
        id: secId,
        title: sec.title,
        chapterId: meta.id,
        chapterNumber: meta.number,
        chapterTitle: chapterFullTitle,
        category: sectionCategory,
        tabName: mapTabName(sec.title),
        content: sec.content,
        headings: subheadings,
        cleanText: clean,
        wordCount: words,
      };
    });

    return {
      id: meta.id,
      number: meta.number,
      title: chapterFullTitle,
      shortTitle: meta.shortTitle,
      category: meta.category,
      description: meta.description,
      sections: parsedSections,
    };
  });
}

// Cached parsed data
let cachedChapters: GuideChapter[] | null = null;
let cachedSections: GuideSection[] | null = null;

export function getGuideChapters(): GuideChapter[] {
  if (!cachedChapters) {
    cachedChapters = parseChapters();
  }
  return cachedChapters;
}

export function getAllGuideSections(): GuideSection[] {
  if (!cachedSections) {
    const chapters = getGuideChapters();
    cachedSections = chapters.flatMap((c) => c.sections);
  }
  return cachedSections;
}

export function getSectionById(id: string): GuideSection | undefined {
  return getAllGuideSections().find((s) => s.id === id);
}

export function getMasterGuideMarkdown(): string {
  return masterGuideRaw;
}

// Create highlighted search excerpt
function extractSnippet(text: string, queryTokens: string[], maxLen = 220): string {
  if (!text || queryTokens.length === 0) {
    return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '');
  }

  const lowerText = text.toLowerCase();
  let bestPos = -1;

  for (const token of queryTokens) {
    const pos = lowerText.indexOf(token);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
    }
  }

  if (bestPos === -1) {
    return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '');
  }

  const start = Math.max(0, bestPos - 60);
  const end = Math.min(text.length, start + maxLen);

  let snippet = text.substring(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Full-text in-memory search across all sections of the User Guide
 */
export function searchGuide(
  query: string,
  categoryFilter: string = 'All'
): SearchResult[] {
  const trimmed = query.trim().toLowerCase();
  const allSections = getAllGuideSections();

  if (!trimmed) {
    // If no query, return sections filtered by category
    const filtered = categoryFilter === 'All'
      ? allSections
      : allSections.filter((s) => s.category === categoryFilter);

    return filtered.map((section) => ({
      section,
      score: 1,
      matchType: 'title',
      snippet: extractSnippet(section.cleanText, []),
      matchedTerms: [],
    }));
  }

  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (const section of allSections) {
    // Apply category filter if set
    if (categoryFilter !== 'All' && section.category !== categoryFilter) {
      continue;
    }

    const titleLower = section.title.toLowerCase();
    const cleanLower = section.cleanText.toLowerCase();
    const chapterLower = section.chapterTitle.toLowerCase();
    const tabLower = section.tabName?.toLowerCase() || '';

    let score = 0;
    let matchType: SearchResult['matchType'] = 'body';
    const matchedTerms: string[] = [];

    // Exact full query match in title
    if (titleLower === trimmed) {
      score += 150;
      matchType = 'title';
      matchedTerms.push(trimmed);
    } else if (titleLower.includes(trimmed)) {
      score += 80;
      matchType = 'title';
      matchedTerms.push(trimmed);
    }

    // Tab name match
    if (tabLower && tabLower.includes(trimmed)) {
      score += 60;
      if (matchType !== 'title') matchType = 'tab';
      matchedTerms.push(tabLower);
    }

    // Check individual tokens
    let tokensMatched = 0;
    for (const token of tokens) {
      let tokenHit = false;

      if (titleLower.includes(token)) {
        score += 35;
        tokenHit = true;
        if (matchType !== 'title') matchType = 'title';
      }

      if (tabLower.includes(token)) {
        score += 25;
        tokenHit = true;
        if (matchType === 'body') matchType = 'tab';
      }

      // Subheading check
      const headingHit = section.headings.some((h) => h.toLowerCase().includes(token));
      if (headingHit) {
        score += 20;
        tokenHit = true;
        if (matchType === 'body') matchType = 'heading';
      }

      // Body text frequency
      let count = 0;
      let pos = cleanLower.indexOf(token);
      while (pos !== -1 && count < 8) {
        count++;
        pos = cleanLower.indexOf(token, pos + token.length);
      }

      if (count > 0) {
        score += Math.min(count * 4, 30);
        tokenHit = true;
      }

      if (chapterLower.includes(token)) {
        score += 10;
        tokenHit = true;
      }

      if (tokenHit) {
        tokensMatched++;
        matchedTerms.push(token);
      }
    }

    // Require either single token hit or at least 50% tokens matched for multi-word queries
    const minRequired = tokens.length > 2 ? Math.ceil(tokens.length * 0.6) : 1;
    if (tokensMatched >= minRequired && score > 0) {
      // Bonus if all tokens are present
      if (tokensMatched === tokens.length) {
        score += 25;
      }

      const snippet = extractSnippet(section.cleanText, tokens);

      results.push({
        section,
        score,
        matchType,
        snippet,
        matchedTerms: Array.from(new Set(matchedTerms)),
      });
    }
  }

  // Sort descending by relevance score
  return results.sort((a, b) => b.score - a.score);
}
