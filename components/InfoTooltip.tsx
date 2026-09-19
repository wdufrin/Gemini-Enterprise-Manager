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

import React, { useState, useRef, useEffect } from 'react';

export interface InfoTooltipProps {
  text: string;
  title?: string;
  position?: 'top' | 'bottom';
  align?: 'left' | 'right' | 'center';
  className?: string;
  widthClass?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  title,
  position = 'top',
  align = 'center',
  className = '',
  widthClass = 'w-72 sm:w-80 max-w-[calc(100vw-2rem)]',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isVisible = isHovered || isPinned;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPinned(false);
        setIsHovered(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPinned(false);
        setIsHovered(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible]);

  // Alignment classes for tooltip container
  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'left'
      ? 'left-0'
      : 'left-1/2 transform -translate-x-1/2';

  // Position classes for tooltip container
  const positionClass = position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2';

  // Arrow alignment
  const arrowAlignClass =
    align === 'right'
      ? 'right-2.5'
      : align === 'left'
      ? 'left-2.5'
      : 'left-1/2 transform -translate-x-1/2';

  // Arrow rotation and borders
  const arrowPositionClass =
    position === 'bottom'
      ? 'bottom-full -mb-1.5 border-l border-t border-gray-700'
      : 'top-full -mt-1.5 border-r border-b border-gray-700';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ml-1.5 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span
        role="button"
        tabIndex={0}
        className={`cursor-help transition-colors focus:outline-none inline-flex items-center p-0.5 rounded ${
          isVisible ? 'text-blue-400 bg-gray-800/80' : 'text-gray-400 hover:text-blue-400'
        }`}
        aria-label="More information"
        aria-expanded={isVisible}
        onFocus={() => setIsHovered(true)}
        onBlur={() => {
          if (!isPinned) setIsHovered(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsPinned((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setIsPinned((prev) => !prev);
          }
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>

      {isVisible && (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${positionClass} ${alignClass} ${widthClass} p-3.5 bg-gray-900 text-gray-200 text-xs rounded-xl shadow-2xl border border-gray-700 z-50 text-left font-normal`}
        >
          {title && (
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                <span>{title}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPinned(false);
                  setIsHovered(false);
                }}
                className="text-gray-400 hover:text-white text-base leading-none px-1 rounded hover:bg-gray-800"
                aria-label="Close tooltip"
              >
                ×
              </button>
            </div>
          )}

          {!title && isPinned && (
            <div className="flex justify-end pb-1 -mt-1">
              <button
                type="button"
                onClick={() => {
                  setIsPinned(false);
                  setIsHovered(false);
                }}
                className="text-gray-400 hover:text-white text-xs leading-none p-0.5 rounded hover:bg-gray-800"
                aria-label="Close tooltip"
              >
                ✕
              </button>
            </div>
          )}

          <p className="leading-relaxed text-gray-300 select-text whitespace-normal break-words">{text}</p>

          {/* Pointing Arrow */}
          <div
            className={`absolute ${arrowPositionClass} ${arrowAlignClass} w-2.5 h-2.5 bg-gray-900 rotate-45`}
          ></div>
        </div>
      )}
    </div>
  );
};

export default InfoTooltip;
