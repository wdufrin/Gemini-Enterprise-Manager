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

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Page } from '../types';
import {
  ACTIVE_SIDEBAR_PAGES,
  GUIDE_CATEGORIES,
  getAllGuideSections,
  getGuideChapters,
  getMasterGuideMarkdown,
  getSectionById,
  getSectionForPage,
  PAGE_TO_SECTION_MAP,
  searchGuide,
  slugify,
  stripMarkdown,
  TAB_MAPPING,
} from './userGuideService';

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('userGuideService — Programmatic Verification Suite', () => {
  describe('1. Chapter & Section Integrity', () => {
    it('loads all 5 modular chapters (ch0 through ch4) with complete metadata and non-empty sections', () => {
      const chapters = getGuideChapters();
      expect(chapters).toHaveLength(5);

      const expectedIds = ['ch0', 'ch1', 'ch2', 'ch3', 'ch4'];
      expect(chapters.map((c) => c.id)).toEqual(expectedIds);
      expect(chapters.map((c) => c.number)).toEqual([0, 1, 2, 3, 4]);

      for (const chapter of chapters) {
        expect(chapter.title.trim().length).toBeGreaterThan(5);
        expect(chapter.shortTitle.trim().length).toBeGreaterThan(3);
        expect(GUIDE_CATEGORIES).toContain(chapter.category);
        expect(chapter.description.trim().length).toBeGreaterThan(10);
        expect(chapter.sections.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('parses all guide sections with unique IDs, non-empty cleanText, and positive wordCount', () => {
      const sections = getAllGuideSections();
      expect(sections.length).toBeGreaterThanOrEqual(40);

      const seenIds = new Set<string>();
      for (const section of sections) {
        expect(section.id).toMatch(/^ch[0-4]-[a-z0-9-]+$/);
        expect(seenIds.has(section.id)).toBe(false);
        seenIds.add(section.id);

        expect(section.title.trim().length).toBeGreaterThan(0);
        expect(section.content.trim().length).toBeGreaterThan(0);
        expect(section.cleanText.trim().length).toBeGreaterThan(0);
        expect(section.wordCount).toBeGreaterThan(0);
        expect(GUIDE_CATEGORIES).toContain(section.category);

        // Lookup by ID returns the exact same section
        const lookedUp = getSectionById(section.id);
        expect(lookedUp).toBeDefined();
        expect(lookedUp?.title).toBe(section.title);
      }
    });

    it('does not falsely assign a sidebar tabName to chapter overview sections', () => {
      const overviewSections = getAllGuideSections().filter((s) =>
        s.title.toLowerCase().includes('— overview')
      );
      expect(overviewSections).toHaveLength(5);
      for (const sec of overviewSections) {
        expect(sec.tabName).toBeUndefined();
      }
    });
  });

  describe('2. Sidebar Tab & Page Enum Coverage', () => {
    it('maps all 15 active sidebar items in ACTIVE_SIDEBAR_PAGES and TAB_MAPPING to valid GuideSections', () => {
      expect(ACTIVE_SIDEBAR_PAGES).toHaveLength(15);
      expect(new Set(ACTIVE_SIDEBAR_PAGES).size).toBe(15);
      expect(Object.keys(TAB_MAPPING)).toHaveLength(15);

      for (const page of ACTIVE_SIDEBAR_PAGES) {
        const mapping = TAB_MAPPING[page];
        expect(mapping).toBeDefined();
        expect(mapping.label.trim().length).toBeGreaterThan(0);

        const section = getSectionById(mapping.sectionId);
        expect(
          section,
          `Expected section "${mapping.sectionId}" for sidebar tab "${mapping.label}" (${page})`
        ).toBeDefined();
        expect(section?.tabName).toBe(mapping.label);
        expect(section?.wordCount).toBeGreaterThan(100);
      }
    });

    it('matches the live navCategories in components/Sidebar.tsx', () => {
      const sidebarSource = fs.readFileSync(
        path.join(PROJECT_ROOT, 'components', 'Sidebar.tsx'),
        'utf-8'
      );

      // Extract all uncommented { page: Page.XYZ, icon: ... } entries from Sidebar.tsx
      const itemRegex = /^\s*\{\s*page:\s*Page\.([A-Z0-9_]+)\s*,/gm;
      const liveItems: Array<{ page: Page; label: string }> = [];
      let match: RegExpExecArray | null;
      while ((match = itemRegex.exec(sidebarSource)) !== null) {
        const enumKey = match[1] as keyof typeof Page;
        const pageVal = Page[enumKey];
        liveItems.push({ page: pageVal, label: pageVal });
      }

      expect(liveItems).toHaveLength(15);
      expect(liveItems.map((i) => i.page)).toEqual([...ACTIVE_SIDEBAR_PAGES]);

      for (const item of liveItems) {
        expect(TAB_MAPPING[item.page].label).toBe(item.label);
        const section = getSectionForPage(item.page);
        expect(section).toBeDefined();
        expect(section?.tabName).toBe(item.label);
      }
    });

    it('maps all 20 Page enum values in types.ts to valid GuideSections via getSectionForPage', () => {
      const allPages = Object.values(Page);
      expect(allPages).toHaveLength(20);

      for (const page of allPages) {
        expect(PAGE_TO_SECTION_MAP[page]).toBeDefined();
        const section = getSectionForPage(page);
        expect(
          section,
          `Expected getSectionForPage(${page}) to return a valid section`
        ).toBeDefined();
        expect(section?.wordCount).toBeGreaterThan(50);
      }
    });
  });

  describe('3. Key Feature Searchability (R1 Verification)', () => {
    it.each([
      {
        query: 'BYOMCP Readiness',
        expectedSectionId: 'ch2-engines-assistants',
      },
      {
        query: 'BYOMCP Descriptions',
        expectedSectionId: 'ch2-engines-assistants',
      },
      {
        query: 'Recommended Query-Routing Skills',
        expectedSectionId: 'ch2-engines-assistants',
      },
      {
        query: 'MATCHING_SCOPE_PARTIAL_MATCH',
        expectedSectionId: 'ch3-model-armor',
      },
      {
        query: 'Evaluate for Exclusion',
        expectedSectionId: 'ch3-model-armor',
      },
      {
        query: 'RFC 6901',
        expectedSectionId: 'ch2-connectors-data-stores',
      },
      {
        query: '156',
        expectedSectionId: 'ch2-connectors-data-stores',
      },
      {
        query: '64 characters',
        expectedSectionId: 'ch1-skills-registry',
      },
      {
        query: 'dnsProjectId',
        expectedSectionId: 'ch2-engines-assistants',
      },
      {
        query: 'Grant Cloud Build IAM Roles',
        expectedSectionId: 'ch2-engines-assistants',
      },
    ])(
      'returns relevant results for "$query" including section $expectedSectionId',
      ({ query, expectedSectionId }) => {
        const results = searchGuide(query);
        expect(results.length).toBeGreaterThan(0);

        const matchingSectionIds = results.map((r) => r.section.id);
        expect(
          matchingSectionIds,
          `Expected searchGuide("${query}") results [${matchingSectionIds.join(', ')}] to include "${expectedSectionId}"`
        ).toContain(expectedSectionId);

        const targetResult = results.find((r) => r.section.id === expectedSectionId);
        expect(targetResult?.score).toBeGreaterThan(0);
        expect(targetResult?.snippet.length).toBeGreaterThan(10);
        expect(targetResult?.matchedTerms.length).toBeGreaterThan(0);
      }
    );
  });

  describe('4. Master Guide Parity (R2 Verification)', () => {
    const userGuidePath = path.join(PROJECT_ROOT, 'docs', 'USER_GUIDE.md');
    const geminiGuidePath = path.join(
      PROJECT_ROOT,
      'docs',
      'Gemini_Enterprise_Manager_User_Guide.md'
    );
    const chapterFiles = [
      '00-getting-started.md',
      '01-agent-management.md',
      '02-knowledge-and-testing.md',
      '03-security-and-observability.md',
      '04-system-and-appendices.md',
    ];

    it('keeps docs/USER_GUIDE.md, docs/Gemini_Enterprise_Manager_User_Guide.md, and getMasterGuideMarkdown() byte-for-byte identical', () => {
      const userGuideContent = fs.readFileSync(userGuidePath, 'utf-8');
      const geminiGuideContent = fs.readFileSync(geminiGuidePath, 'utf-8');
      const serviceMasterContent = getMasterGuideMarkdown();

      expect(userGuideContent.length).toBeGreaterThan(300_000);
      expect(userGuideContent).toBe(geminiGuideContent);
      expect(serviceMasterContent).toBe(userGuideContent);
    });

    it('includes every H2 section heading and every normalized chapter body from docs/guide/00 through 04 in docs/USER_GUIDE.md', () => {
      const masterContent = fs.readFileSync(userGuidePath, 'utf-8');

      // Every parsed H2 section title must appear in the master guide
      for (const chapter of getGuideChapters()) {
        for (const section of chapter.sections) {
          if (section.title.endsWith('— Overview')) continue;
          expect(
            masterContent.includes(`## ${section.title}`),
            `Missing "## ${section.title}" from ${chapter.id} in docs/USER_GUIDE.md`
          ).toBe(true);
        }
      }

      // Every normalized chapter file must appear verbatim inside docs/USER_GUIDE.md
      for (const file of chapterFiles) {
        const rawChapter = fs
          .readFileSync(path.join(PROJECT_ROOT, 'docs', 'guide', file), 'utf-8')
          .replace(/\]\(\.\.\/assets\//g, '](./assets/')
          .trim();

        expect(
          masterContent.includes(rawChapter),
          `Expected normalized content of docs/guide/${file} to be present in docs/USER_GUIDE.md`
        ).toBe(true);
      }
    });
  });

  describe('5. Negative, Adversarial & Boundary Cases', () => {
    it('returns all sections with score=1 when query is empty or whitespace-only, respecting categoryFilter', () => {
      const allSections = getAllGuideSections();
      const emptyAll = searchGuide('   ', 'All');
      expect(emptyAll).toHaveLength(allSections.length);
      expect(emptyAll.every((r) => r.score === 1 && r.matchedTerms.length === 0)).toBe(true);

      const securityOnly = searchGuide('', 'Security & Access');
      expect(securityOnly.length).toBeGreaterThan(0);
      expect(securityOnly.length).toBeLessThan(allSections.length);
      expect(securityOnly.every((r) => r.section.category === 'Security & Access')).toBe(true);
    });

    it('rejects single-character queries and non-existent tokens by returning an empty array', () => {
      expect(searchGuide('a')).toEqual([]);
      expect(searchGuide('x y z')).toEqual([]);
      expect(searchGuide('xyznonexistenttoken99999')).toEqual([]);
      expect(searchGuide('nonexistentterm1 nonexistentterm2 nonexistentterm3')).toEqual([]);
    });

    it('filters out matching sections when categoryFilter does not match the section category', () => {
      const wrongCategory = searchGuide('MATCHING_SCOPE_PARTIAL_MATCH', 'System Operations');
      expect(wrongCategory).toEqual([]);

      const rightCategory = searchGuide('MATCHING_SCOPE_PARTIAL_MATCH', 'Security & Access');
      expect(rightCategory.length).toBeGreaterThan(0);
      expect(rightCategory[0].section.id).toBe('ch3-model-armor');
    });

    it('handles hostile regex metacharacters and HTML/script payloads safely without throwing', () => {
      expect(() => searchGuide('[()*+?^$\\.|]')).not.toThrow();
      expect(searchGuide('[()*+?^$\\.|]')).toEqual([]);

      expect(() => searchGuide('<script>alert("xss")</script>')).not.toThrow();
    });

    it('returns undefined from getSectionById for empty or unknown section IDs', () => {
      expect(getSectionById('')).toBeUndefined();
      expect(getSectionById('ch99-nonexistent-section')).toBeUndefined();
      expect(getSectionById('../docs/USER_GUIDE.md')).toBeUndefined();
    });

    it('strips markdown formatting, fenced code blocks, HTML tags, and tables in stripMarkdown()', () => {
      const sample = [
        '# Heading 1',
        '> Blockquote note',
        'Text with **bold**, *italic*, `inline_code`, and [Link Label](https://example.com).',
        '```json',
        '{ "secret": "should_be_stripped_from_clean_text" }',
        '```',
        '<div>HTML Tag Content</div>',
      ].join('\n');

      const cleaned = stripMarkdown(sample);
      expect(cleaned).toContain('Heading 1');
      expect(cleaned).toContain('Blockquote note');
      expect(cleaned).toContain('bold');
      expect(cleaned).toContain('inline_code');
      expect(cleaned).toContain('Link Label');
      expect(cleaned).not.toContain('should_be_stripped_from_clean_text');
      expect(cleaned).not.toContain('<div>');
    });

    it('normalizes special characters and leading/trailing hyphens in slugify()', () => {
      expect(slugify('  Connectors & Data Stores! ')).toBe('connectors-data-stores');
      expect(slugify('---Multiple___Symbols---')).toBe('multiple-symbols');
      expect(slugify('')).toBe('');
    });
  });
});
