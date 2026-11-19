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

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex^="-"])'
].join(', ');

// Track stacked open modal containers so only the topmost dialog traps Tab and handles Escape
const activeModalStack: HTMLElement[] = [];

function isElementVisible(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if (el.classList.contains('hidden') || el.closest('.hidden') || el.closest('[aria-hidden="true"]')) {
    return false;
  }
  if (el.style.display === 'none' || el.style.visibility === 'hidden') {
    return false;
  }
  return true;
}

export interface UseModalA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  preventClose?: boolean;
}

/**
 * Hook providing WCAG 2.1 Level AA modal accessibility:
 * - Escape key dismissal
 * - Tab key focus trapping
 * - Initial focus placement
 * - Return focus restoration on close
 * - Body scroll locking
 */
export function useModalA11y({
  isOpen,
  onClose,
  containerRef,
  initialFocusRef,
  preventClose = false
}: UseModalA11yOptions): void {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Track the element focused prior to modal open & register on activeModalStack
  useEffect(() => {
    if (isOpen) {
      const containerEl = containerRef.current;
      if (containerEl && !activeModalStack.includes(containerEl)) {
        activeModalStack.push(containerEl);
      }
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Set initial focus after DOM render
      const focusTimer = setTimeout(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (containerRef.current) {
          const focusable = Array.from(
            containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
          ).filter(isElementVisible);
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            containerRef.current.focus();
          }
        }
      }, 30);

      return () => {
        clearTimeout(focusTimer);
        if (containerEl) {
          const idx = activeModalStack.lastIndexOf(containerEl);
          if (idx !== -1) activeModalStack.splice(idx, 1);
        }
        if (activeModalStack.length === 0) {
          document.body.style.overflow = originalOverflow;
        }
        if (
          previousActiveElementRef.current &&
          document.contains(previousActiveElementRef.current) &&
          typeof previousActiveElementRef.current.focus === 'function'
        ) {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, initialFocusRef, containerRef]);

  // Handle keyboard events (Escape and Tab focus trap — topmost modal only)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentContainer = containerRef.current;
      const topmostModal = activeModalStack[activeModalStack.length - 1];
      if (currentContainer && topmostModal && topmostModal !== currentContainer) {
        return;
      }

      if (e.key === 'Escape') {
        if (!preventClose) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        if (!currentContainer) return;

        const focusables = Array.from(
          currentContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(isElementVisible);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !currentContainer.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !currentContainer.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, preventClose, containerRef]);
}
