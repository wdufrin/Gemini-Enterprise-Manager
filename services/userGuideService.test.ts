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
import {
  getGuideChapters,
  getAllGuideSections,
  getSectionById,
  searchGuide,
  getMasterGuideMarkdown,
  stripMarkdown,
  slugify,
} from './userGuideService';

describe('userGuideService', () => {
  it('loads and parses all 5 chapters', () => {
    const chapters = getGuideChapters();
    expect(chapters).toHaveLength(5);
    expect(chapters[0].title).toContain('Chapter 0');
    expect(chapters[1].title).toContain('Chapter 1');
    expect(chapters[2].title).toContain('Chapter 2');
    expect(chapters[3].title).toContain('Chapter 3');
    expect(chapters[4].title).toContain('Chapter 4');
  });

  it('parses sections with headings, word counts, and clean text', () => {
    const sections = getAllGuideSections();
    expect(sections.length).toBeGreaterThan(25);

    const firstSection = sections[0];
    expect(firstSection.id).toBeDefined();
    expect(firstSection.title).toBeDefined();
    expect(firstSection.content.length).toBeGreaterThan(50);
    expect(firstSection.wordCount).toBeGreaterThan(10);
    expect(firstSection.cleanText).not.toContain('## ');
  });

  it('maps tab names correctly to sidebar pages', () => {
    const sections = getAllGuideSections();
    const agentManagerSec = sections.find((s) => s.title.includes('GE Agent Manager'));
    expect(agentManagerSec?.tabName).toBe('GE Agent Manager');

    const modelArmorSec = sections.find((s) => s.title.includes('Model Armor'));
    expect(modelArmorSec?.tabName).toBe('Model Armor');

    const observabilitySec = sections.find((s) => s.title.includes('Observability'));
    expect(observabilitySec?.tabName).toBe('Observability');
  });

  it('retrieves section by ID', () => {
    const sections = getAllGuideSections();
    const target = sections[3];
    const retrieved = getSectionById(target.id);
    expect(retrieved).toEqual(target);
  });

  it('returns full master markdown for offline export', () => {
    const master = getMasterGuideMarkdown();
    expect(master).toContain('Gemini Enterprise Manager');
    expect(master.length).toBeGreaterThan(100000);
  });

  describe('searchGuide', () => {
    it('returns empty/all list on empty query', () => {
      const allResults = searchGuide('');
      const allSections = getAllGuideSections();
      expect(allResults.length).toBe(allSections.length);
    });

    it('filters by category when query is empty', () => {
      const secResults = searchGuide('', 'Security & Access');
      expect(secResults.length).toBeGreaterThan(0);
      expect(secResults.every((r) => r.section.category === 'Security & Access')).toBe(true);
    });

    it('ranks exact and title matches highest for "Model Armor"', () => {
      const results = searchGuide('Model Armor');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].section.title).toContain('Model Armor');
      expect(results[0].score).toBeGreaterThan(80);
      expect(results[0].matchedTerms).toContain('model');
    });

    it('finds cURL debugger section when searching "curl debugger"', () => {
      const results = searchGuide('curl debugger');
      expect(results.length).toBeGreaterThan(0);
      const curlSec = results.find((r) => r.section.title.toLowerCase().includes('curl'));
      expect(curlSec).toBeDefined();
    });

    it('finds permission error troubleshooting when searching "403"', () => {
      const results = searchGuide('403');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.snippet.includes('403'))).toBe(true);
    });

    it('respects category filter combined with search query', () => {
      const results = searchGuide('backup', 'System Operations');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.section.category === 'System Operations')).toBe(true);
    });
  });

  describe('utility functions', () => {
    it('stripMarkdown strips bold, links, code, and headings', () => {
      const raw = '## Hello **World** [Link](https://example.com) `code`\n> Quote';
      const clean = stripMarkdown(raw);
      expect(clean).toBe('Hello World Link code Quote');
    });

    it('slugify creates safe URL and ID slugs', () => {
      expect(slugify('GE Agent Manager: Step-by-Step!')).toBe('ge-agent-manager-step-by-step');
    });
  });
});
