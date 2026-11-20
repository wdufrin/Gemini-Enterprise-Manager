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

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number | string;
  badge?: string;
  disabled?: boolean;
  title?: string;
  testId?: string;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  activeTab: NoInfer<T>;
  onChange: (tabId: NoInfer<T>) => void;
  ariaLabel?: string;
  /**
   * Optional URL query parameter name (e.g. 'tab') to keep activeTab synchronized with the URL.
   * Safe even when rendered outside a Router in isolated unit tests (no-ops gracefully).
   */
  syncSearchParam?: string;
  /** Optional right-aligned element along the tab baseline */
  rightSlot?: React.ReactNode;
  className?: string;
}

const RouterSearchParamBridge: React.FC<{
  paramName: string;
  validIdsRef: React.MutableRefObject<readonly string[]>;
  activeTabRef: React.MutableRefObject<string>;
  onSyncFromUrlRef: React.MutableRefObject<(id: string) => void>;
  writeUrlWriterRef: React.MutableRefObject<((id: string) => void) | null>;
}> = ({ paramName, validIdsRef, activeTabRef, onSyncFromUrlRef, writeUrlWriterRef }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlVal = searchParams.get(paramName);

  writeUrlWriterRef.current = (nextTabId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(paramName, nextTabId);
        return next;
      },
      { replace: true }
    );
  };

  // One-way reactive sync from URL -> state on initial mount & browser Back/Forward
  useEffect(() => {
    if (
      urlVal &&
      validIdsRef.current.includes(urlVal) &&
      urlVal !== activeTabRef.current
    ) {
      onSyncFromUrlRef.current(urlVal);
    }
  }, [urlVal, validIdsRef, activeTabRef, onSyncFromUrlRef]);

  return null;
};

export function Tabs<const T extends string>({
  items,
  activeTab,
  onChange,
  ariaLabel = 'Section Navigation',
  syncSearchParam,
  rightSlot,
  className = '',
}: TabsProps<T>): React.ReactElement {
  const baseId = useId();
  const inRouter = useInRouterContext();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const validIdsRef = useRef<readonly string[]>(items.map((item) => item.id));
  validIdsRef.current = items.map((item) => item.id);

  const activeTabRef = useRef<string>(activeTab);
  activeTabRef.current = activeTab;

  const onSyncFromUrlRef = useRef<(id: string) => void>((id) => onChange(id as T));
  onSyncFromUrlRef.current = (id: string) => onChange(id as T);

  const writeUrlWriterRef = useRef<((id: string) => void) | null>(null);

  const selectTab = useCallback(
    (nextId: T) => {
      onChange(nextId);
      if (syncSearchParam && writeUrlWriterRef.current) {
        writeUrlWriterRef.current(nextId);
      }
    },
    [onChange, syncSearchParam]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabledIndices = items
      .map((it, idx) => (!it.disabled ? idx : -1))
      .filter((idx) => idx !== -1);
    if (enabledIndices.length === 0) return;

    const pos = enabledIndices.indexOf(index);
    let nextIdx: number | null = null;

    if (e.key === 'ArrowRight') {
      nextIdx = enabledIndices[(pos + 1) % enabledIndices.length];
    } else if (e.key === 'ArrowLeft') {
      nextIdx = enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length];
    } else if (e.key === 'Home') {
      nextIdx = enabledIndices[0];
    } else if (e.key === 'End') {
      nextIdx = enabledIndices[enabledIndices.length - 1];
    }

    if (nextIdx !== null) {
      e.preventDefault();
      const target = items[nextIdx];
      tabRefs.current[nextIdx]?.focus();
      selectTab(target.id);
    }
  };

  return (
    <div
      className={`border-b border-gray-800 flex flex-wrap items-center justify-between gap-2 ${className}`.trim()}
    >
      {inRouter && syncSearchParam && (
        <RouterSearchParamBridge
          paramName={syncSearchParam}
          validIdsRef={validIdsRef}
          activeTabRef={activeTabRef}
          onSyncFromUrlRef={onSyncFromUrlRef}
          writeUrlWriterRef={writeUrlWriterRef}
        />
      )}

      <div
        role="tablist"
        aria-label={ariaLabel}
        className="-mb-px flex items-center gap-1 sm:gap-2 overflow-x-auto custom-scrollbar"
      >
        {items.map((item, idx) => {
          const isActive = item.id === activeTab;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={`${baseId}-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              disabled={item.disabled}
              title={item.title}
              data-testid={item.testId}
              onClick={() => !item.disabled && selectTab(item.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`group inline-flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm border-b-2 whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed ${
                isActive
                  ? 'border-blue-500 text-white font-semibold'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700 font-medium'
              }`}
            >
              {item.icon && (
                <span
                  className={isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-300'}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span
                  className={`px-1.5 py-0.5 text-[11px] font-mono rounded-full leading-none ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-gray-800 text-gray-400 border border-gray-700/80'
                  }`}
                >
                  {item.count}
                </span>
              )}
              {item.badge && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {rightSlot && <div className="pb-1.5 flex items-center gap-2 shrink-0">{rightSlot}</div>}
    </div>
  );
}

export interface SegmentedControlItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number | string;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  items: readonly SegmentedControlItem<T>[];
  value: NoInfer<T>;
  onChange: (value: NoInfer<T>) => void;
  ariaLabel?: string;
  size?: 'xs' | 'sm';
  className?: string;
}

export function SegmentedControl<const T extends string>({
  items,
  value,
  onChange,
  ariaLabel = 'View Mode',
  size = 'sm',
  className = '',
}: SegmentedControlProps<T>): React.ReactElement {
  const paddingClass = size === 'xs' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 p-1 rounded-lg bg-gray-900/90 border border-gray-800 ${className}`.trim()}
    >
      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={isActive}
            disabled={item.disabled}
            title={item.title}
            onClick={() => !item.disabled && onChange(item.id)}
            className={`inline-flex items-center gap-1.5 ${paddingClass} rounded-md font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/70'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full leading-none ${
                  isActive ? 'bg-blue-500/40 text-white' : 'bg-gray-800 text-gray-400'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
