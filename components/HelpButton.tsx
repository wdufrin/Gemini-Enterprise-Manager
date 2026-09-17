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

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Page } from '../types';

// Lazy-load the documentation modal bundle so initial app load stays lean
const UserManualModal = lazy(() => import('./UserManualModal'));

interface HelpButtonProps {
  onNavigateToPage?: (page: Page) => void;
}

const HelpButton: React.FC<HelpButtonProps> = ({ onNavigateToPage }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Global keyboard shortcut to open User Guide from anywhere (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user presses Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // Prevent default browser search focus
        e.preventDefault();
        setIsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors relative group focus:outline-none focus:ring-2 focus:ring-blue-500 border border-transparent hover:border-gray-600"
        title="Open User Guide & Documentation (Ctrl+K)"
        aria-label="Open User Guide & Documentation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="hidden lg:inline text-xs font-medium text-gray-300">Docs</span>
        <kbd className="hidden xl:inline-block px-1 py-0.2 text-[10px] font-mono text-gray-400 bg-gray-800 border border-gray-700 rounded ml-0.5">
          Ctrl+K
        </kbd>
      </button>

      {isModalOpen && (
        <Suspense fallback={null}>
          <UserManualModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onNavigateToPage={onNavigateToPage}
          />
        </Suspense>
      )}
    </>
  );
};

export default HelpButton;
