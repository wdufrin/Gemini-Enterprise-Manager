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

export const CollapsibleSection: React.FC<React.PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-t border-gray-700 pt-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center text-left"
      >
        <h3 className="text-md font-semibold text-white">{title}</h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </div>
  );
};

export default CollapsibleSection;
