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

import React from 'react';

export type PageShellVariant = 'standard' | 'wide' | 'full' | 'locked';

export interface PageShellProps {
  /**
   * - 'wide' (default): fluid up to 1680px centered, uniform vertical spacing (`space-y-5`).
   * - 'standard': centered `max-w-7xl` for denser reading/form dashboards.
   * - 'full': 100% viewport width with uniform vertical spacing.
   * - 'locked': viewport-locked flex column for split-pane studios and interactive canvases.
   */
  variant?: PageShellVariant;
  className?: string;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<PageShellVariant, string> = {
  wide: 'w-full max-w-[1680px] mx-auto space-y-5',
  standard: 'w-full max-w-7xl mx-auto space-y-5',
  full: 'w-full space-y-5',
  locked: 'w-full flex flex-col xl:h-full min-h-[680px] space-y-5',
};

export const PageShell: React.FC<PageShellProps> = ({
  variant = 'wide',
  className = '',
  children,
}) => {
  return <div className={`${VARIANT_CLASSES[variant]} ${className}`.trim()}>{children}</div>;
};

export default PageShell;
