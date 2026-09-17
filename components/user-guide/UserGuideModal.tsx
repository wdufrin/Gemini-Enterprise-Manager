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

import React, { useState, useEffect, useRef, useId, useMemo } from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  getGuideChapters,
  getAllGuideSections,
  searchGuide,
  getMasterGuideMarkdown,
  GUIDE_CATEGORIES,
  GuideCategory,
  GuideSection,
} from '../../services/userGuideService';
import UserGuideViewer from './UserGuideViewer';
import { Page } from '../../types';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSectionId?: string;
  onNavigateToPage?: (page: Page) => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({
  isOpen,
  onClose,
  initialSectionId,
  onNavigateToPage,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const chapters = useMemo(() => getGuideChapters(), []);
  const allSections = useMemo(() => getAllGuideSections(), []);

  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => {
    return initialSectionId || (allSections.length > 0 ? allSections[0].id : '');
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<GuideCategory>('All');
  const [isMaximized, setIsMaximized] = useState(false);
  const [expandedChapterIds, setExpandedChapterIds] = useState<Record<string, boolean>>({
    ch0: true,
    ch1: true,
    ch2: true,
    ch3: true,
    ch4: true,
  });

  // Sync initialSectionId if it changes
  useEffect(() => {
    if (initialSectionId) {
      setSelectedSectionId(initialSectionId);
    }
  }, [initialSectionId]);

  // Modal accessibility hooks
  useModalA11y({
    isOpen,
    onClose,
    containerRef,
  });

  // Global shortcut to focus search when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Search results
  const searchResults = useMemo(() => {
    return searchGuide(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const selectedSection: GuideSection | undefined = useMemo(() => {
    return allSections.find((s) => s.id === selectedSectionId) || allSections[0];
  }, [allSections, selectedSectionId]);

  // Index for Prev/Next navigation
  const currentSectionIndex = useMemo(() => {
    return allSections.findIndex((s) => s.id === selectedSection?.id);
  }, [allSections, selectedSection]);

  const prevSection = currentSectionIndex > 0 ? allSections[currentSectionIndex - 1] : null;
  const nextSection = currentSectionIndex < allSections.length - 1 ? allSections[currentSectionIndex + 1] : null;

  if (!isOpen) return null;

  const toggleChapter = (chapterId: string) => {
    setExpandedChapterIds((prev) => ({
      ...prev,
      [chapterId]: !prev[chapterId],
    }));
  };

  const handleDownloadOfflineGuide = () => {
    const markdown = getMasterGuideMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Gemini_Enterprise_Manager_User_Guide.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleNavigateToTab = (tabName: string) => {
    if (onNavigateToPage) {
      onNavigateToPage(tabName as Page);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex justify-center items-center z-[100] p-2 md:p-4 animate-fade-in"
      aria-modal="true"
      role="dialog"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`bg-gray-850 rounded-xl shadow-2xl flex flex-col border border-gray-700/80 overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'w-[98vw] h-[96vh] max-w-none'
            : 'w-full max-w-6xl h-[88vh]'
        }`}
      >
        {/* Header Bar */}
        <header className="px-5 py-3.5 border-b border-gray-700/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base font-bold text-white tracking-tight">
                  Gemini Enterprise Manager
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/50">
                  User Guide v0.0914.338
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Official Administrator Manual • 18 Tabs • cURL Reference • Troubleshooting
              </p>
            </div>
          </div>

          {/* Search Box */}
          <div className="flex-1 max-w-md relative">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics, tabs, cURL commands, error codes..."
                className="w-full pl-9 pr-16 py-1.5 bg-gray-950/80 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800 text-xs"
                    title="Clear search"
                  >
                    ✕
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-800 border border-gray-700 rounded">
                    Ctrl+K
                  </kbd>
                )}
              </div>
            </div>
          </div>

          {/* Top Window Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadOfflineGuide}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs rounded-lg border border-gray-700 transition-colors"
              title="Download entire guide as Markdown for offline use"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="hidden sm:inline">Offline .md</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors"
              title={isMaximized ? 'Restore window' : 'Maximize window'}
              aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            >
              {isMaximized ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5m-6 11l-5 5m0 0h4m-4 0v-4m16 4v-4m0 4h-4m4 0l-5-5" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors"
              aria-label="Close dialog"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Category Filter Pills & Match Status */}
        <div className="px-5 py-2 bg-gray-900/40 border-b border-gray-700/60 flex items-center justify-between overflow-x-auto gap-2 text-xs shrink-0 custom-scrollbar">
          <div className="flex items-center gap-1.5">
            {GUIDE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-gray-400 whitespace-nowrap pl-2">
            {searchQuery ? (
              <span className="text-yellow-400 font-medium">
                {searchResults.length} match{searchResults.length === 1 ? '' : 'es'} found
              </span>
            ) : (
              <span>Browsing {allSections.length} topics</span>
            )}
          </div>
        </div>

        {/* Main Split Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Sidebar */}
          <aside className="w-80 bg-gray-900/50 border-r border-gray-700/80 flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 border-b border-gray-800 text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex justify-between items-center">
              <span>{searchQuery ? 'Search Results' : 'Table of Contents'}</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-blue-400 hover:text-blue-300 normal-case font-normal"
                >
                  View full index
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {searchQuery ? (
                /* Search Results List */
                searchResults.length > 0 ? (
                  searchResults.map((res) => (
                    <button
                      key={res.section.id}
                      type="button"
                      onClick={() => setSelectedSectionId(res.section.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                        selectedSection?.id === res.section.id
                          ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-xs'
                          : 'bg-gray-850/60 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                          {res.section.category}
                        </span>
                        {res.section.tabName && (
                          <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60 truncate max-w-[120px]">
                            {res.section.tabName}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-semibold text-gray-100 line-clamp-1 mb-1">
                        {res.section.title}
                      </h4>
                      <p className="text-[11px] text-gray-400 line-clamp-2 leading-tight">
                        {res.snippet}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-gray-400">
                    <p className="font-semibold text-gray-300 mb-1">No matching topics found</p>
                    <p>Try searching for a different keyword, tab name, error code (e.g. 403), or clear the category filter.</p>
                  </div>
                )
              ) : (
                /* Chapter Accordion Navigation */
                chapters.map((chapter) => {
                  const isExpanded = !!expandedChapterIds[chapter.id];
                  const hasActiveSection = chapter.sections.some((s) => s.id === selectedSection?.id);

                  return (
                    <div key={chapter.id} className="mb-2">
                      <button
                        type="button"
                        onClick={() => toggleChapter(chapter.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                          hasActiveSection
                            ? 'bg-gray-800 text-blue-300 border border-blue-500/20'
                            : 'text-gray-300 hover:bg-gray-800/70 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{chapter.title}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isExpanded && (
                        <div className="mt-1 ml-2 pl-2 border-l border-gray-800 space-y-0.5">
                          {chapter.sections.map((section) => {
                            const isCurrent = selectedSection?.id === section.id;
                            return (
                              <button
                                key={section.id}
                                type="button"
                                onClick={() => setSelectedSectionId(section.id)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between group ${
                                  isCurrent
                                    ? 'bg-blue-600/20 text-blue-300 font-medium border border-blue-500/30'
                                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                                }`}
                              >
                                <span className="truncate">{section.title}</span>
                                {section.tabName && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-gray-800 text-gray-500 group-hover:text-gray-400 shrink-0 ml-1">
                                    tab
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Reader Area */}
          <main className="flex-1 flex flex-col overflow-hidden bg-gray-900/30">
            {selectedSection ? (
              <>
                {/* Section Top Meta Bar */}
                <div className="px-6 py-3 border-b border-gray-800/80 bg-gray-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                    <span className="text-gray-500">Guide</span>
                    <span>›</span>
                    <span className="text-gray-400">{selectedSection.chapterTitle}</span>
                    <span>›</span>
                    <span className="text-blue-300 font-medium">{selectedSection.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedSection.tabName && onNavigateToPage && (
                      <button
                        type="button"
                        onClick={() => handleNavigateToTab(selectedSection.tabName!)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-900/30 text-purple-300 hover:bg-purple-900/50 border border-purple-700/50 rounded-md text-xs transition-colors font-medium"
                        title={`Navigate directly to ${selectedSection.tabName} tab`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Open {selectedSection.tabName}</span>
                      </button>
                    )}

                    <span className="text-[11px] text-gray-500 hidden sm:inline">
                      {Math.max(1, Math.round(selectedSection.wordCount / 200))} min read • {selectedSection.wordCount} words
                    </span>
                  </div>
                </div>

                {/* Markdown Content Viewer */}
                <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar">
                  <div className="max-w-4xl mx-auto pb-12">
                    <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 border-b border-gray-800 pb-3">
                      {selectedSection.title}
                    </h1>

                    <UserGuideViewer
                      content={selectedSection.content}
                      highlightQuery={searchQuery}
                      onNavigateToSection={(id) => setSelectedSectionId(id)}
                    />

                    {/* Bottom Prev / Next Navigation Footer */}
                    <div className="mt-12 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                      {prevSection ? (
                        <button
                          type="button"
                          onClick={() => setSelectedSectionId(prevSection.id)}
                          className="w-full sm:w-auto flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-colors text-left"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          <div className="truncate">
                            <div className="text-[10px] text-gray-500 uppercase">Previous Topic</div>
                            <div className="font-semibold text-gray-200 truncate">{prevSection.title}</div>
                          </div>
                        </button>
                      ) : (
                        <div></div>
                      )}

                      {nextSection && (
                        <button
                          type="button"
                          onClick={() => setSelectedSectionId(nextSection.id)}
                          className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-colors text-right"
                        >
                          <div className="truncate text-left sm:text-right">
                            <div className="text-[10px] text-gray-500 uppercase">Next Topic</div>
                            <div className="font-semibold text-gray-200 truncate">{nextSection.title}</div>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-gray-500 text-xs">
                Select a topic from the sidebar to view documentation.
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default UserGuideModal;
