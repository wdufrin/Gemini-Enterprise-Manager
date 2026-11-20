/**
 * Copyright 2026 Google LLC
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

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RowActionMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  badge?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

export interface RowActionMenuProps {
  items: RowActionMenuItem[];
  ariaLabel?: string;
  buttonLabel?: string;
}

export const RowActionMenu: React.FC<RowActionMenuProps> = ({
  items,
  ariaLabel = 'More row actions',
  buttonLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleItems = items;

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimatedHeight = visibleItems.length * 36 + 16;
    const openUpward =
      window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
    setCoords({
      top: openUpward ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleScrollOrResize = () => setIsOpen(false);

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  if (visibleItems.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={ariaLabel}
        className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-medium text-gray-300 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {buttonLabel ? <span>{buttonLabel}</span> : null}
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={ariaLabel}
            style={{ top: `${coords.top}px`, right: `${coords.right}px` }}
            className="fixed z-[80] w-52 py-1 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl divide-y divide-gray-800/80"
          >
            <div className="py-0.5">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    item.onClick();
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium flex items-center justify-between gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:bg-gray-800 ${
                    item.danger
                      ? 'text-red-400 hover:bg-red-950/40 hover:text-red-300'
                      : 'text-gray-200 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-gray-800 text-gray-300 border border-gray-700">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default RowActionMenu;
