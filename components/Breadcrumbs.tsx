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
import { Page } from '../types';

interface BreadcrumbsProps {
  currentPage: Page;
  context?: unknown;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentPage, context }) => {
  const items = [
    { label: 'Agent Space', active: false },
    { label: currentPage, active: !context }
  ];

  if (context && typeof context === 'object') {
    const ctx = context as { displayName?: string; name?: string };
    if (ctx.displayName) {
        items.push({ label: ctx.displayName, active: true });
    } else if (ctx.name) {
        items.push({ label: ctx.name.split('/').pop() || '', active: true });
    }
  }

  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="inline-flex items-center space-x-1 md:space-x-3">
        {items.map((item, index) => (
          <li key={index} className="inline-flex items-center">
            {index > 0 && (
               <svg className="w-4 h-4 text-gray-400 mx-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
            )}
            <span className={`inline-flex items-center text-sm font-medium ${item.active ? 'text-white' : 'text-gray-400'}`}>
              {item.label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
