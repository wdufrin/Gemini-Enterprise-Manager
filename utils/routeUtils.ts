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

import { Page } from '../types';

export const PAGE_ROUTES: Record<Page, string> = {
  [Page.AGENTS]: '/agents',
  [Page.SKILLS_REGISTRY]: '/skills',
  [Page.ASSISTANT]: '/assistant',
  [Page.AUTHORIZATIONS]: '/authorizations',
  [Page.AGENT_PERMISSIONS]: '/permissions',
  [Page.AGENT_ENGINES]: '/runtimes',
  [Page.A2A_TESTER]: '/a2a-tester',
  [Page.AGENT_BUILDER]: '/builder',
  [Page.AGENT_CATALOG]: '/catalog',
  [Page.CLOUD_RUN_AGENTS]: '/cloud-run',
  [Page.DIALOGFLOW_AGENTS]: '/dialogflow',
  [Page.CHAT]: '/chat',
  [Page.DATA_STORES]: '/datastores',
  [Page.MCP_SERVERS]: '/mcp-servers',
  [Page.MODEL_ARMOR]: '/model-armor',
  [Page.OBSERVABILITY]: '/observability',
  [Page.BACKUP_RECOVERY]: '/backup',
  [Page.ARCHITECTURE]: '/architecture',
  [Page.LICENSE]: '/licenses',
  [Page.CONNECTORS]: '/connectors',
  [Page.GE_QUOTA_USAGE]: '/quota',
  [Page.VANITY_URLS]: '/vanity-urls',
  [Page.CONFIG_AUDIT]: '/config-audit',
};

const ROUTE_TO_PAGE: Record<string, Page> = Object.entries(PAGE_ROUTES).reduce(
  (acc, [page, route]) => {
    acc[route] = page as Page;
    return acc;
  },
  {} as Record<string, Page>
);

export function pageToRoute(page: Page): string {
  return PAGE_ROUTES[page] || '/agents';
}

export function routeToPage(pathname: string): Page {
  const pathOnly = (pathname || '').split('?')[0].split('#')[0];
  const normalized = pathOnly.replace(/\/$/, '') || '/agents';
  if (normalized.startsWith('/v_')) {
    return Page.OBSERVABILITY;
  }
  if (normalized === '/domains' || normalized === '/custom-domains') {
    return Page.VANITY_URLS;
  }
  return ROUTE_TO_PAGE[normalized] || Page.AGENTS;
}
