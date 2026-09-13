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

import { describe, it, expect } from 'vitest';
import { Page } from '../types';
import { pageToRoute, routeToPage, PAGE_ROUTES } from './routeUtils';

describe('routeUtils', () => {
  it('maps every Page enum member to a valid route string', () => {
    Object.values(Page).forEach((page) => {
      const route = pageToRoute(page);
      expect(route).toBeDefined();
      expect(route.startsWith('/')).toBe(true);
      expect(routeToPage(route)).toBe(page);
    });
  });

  it('normalizes trailing slashes and unknown routes', () => {
    expect(routeToPage('/licenses/')).toBe(Page.LICENSE);
    expect(routeToPage('/unknown-route')).toBe(Page.AGENTS);
    expect(routeToPage('')).toBe(Page.AGENTS);
  });

  it('strips query strings and hashes, and maps /v_* views to Page.OBSERVABILITY', () => {
    expect(routeToPage('/observability?view=v_admin_feedback_review')).toBe(Page.OBSERVABILITY);
    expect(routeToPage('/v_admin_feedback_review')).toBe(Page.OBSERVABILITY);
    expect(routeToPage('/v_consolidated_user_activity')).toBe(Page.OBSERVABILITY);
  });

  it('provides unique routes for all pages', () => {
    const routes = Object.values(PAGE_ROUTES);
    const uniqueRoutes = new Set(routes);
    expect(routes.length).toBe(uniqueRoutes.size);
  });
});
