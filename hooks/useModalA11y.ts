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

  // Track the element focused prior to modal open
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Set initial focus after DOM render
      const focusTimer = setTimeout(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (containerRef.current) {
          const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            containerRef.current.focus();
          }
        }
      }, 30);

      return () => {
        clearTimeout(focusTimer);
        document.body.style.overflow = originalOverflow;
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, initialFocusRef, containerRef]);

  // Handle keyboard events (Escape and Tab focus trap)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!preventClose) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        if (!containerRef.current) return;

        const focusables = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => {
          if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-hidden') === 'true') {
            return false;
          }
          if (el.style.display === 'none' || el.style.visibility === 'hidden') {
            return false;
          }
          return true;
        });

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !containerRef.current.contains(document.activeElement)) {
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
