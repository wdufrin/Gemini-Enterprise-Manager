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

import { UserLicense, SortKey, SortDirection } from './types';

export interface LicenseFilterCriteria {
  filterPrincipal: string;
  filterStatus: string;
  filterConfig: string;
  filterDateOperator: '>' | '<' | '=';
  filterDateValue: string;
}

export function filterUserLicenses(
  userLicenses: UserLicense[],
  criteria: LicenseFilterCriteria,
  licenseNames: Record<string, string>
): UserLicense[] {
  if (!userLicenses || userLicenses.length === 0) return [];

  const normalizeDateString = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  };

  const filterDateMs = criteria.filterDateValue ? normalizeDateString(criteria.filterDateValue) : null;

  return userLicenses.filter((l) => {
    if (criteria.filterPrincipal) {
      const principalLower = criteria.filterPrincipal.toLowerCase();
      if (!l.userPrincipal?.toLowerCase().includes(principalLower)) return false;
    }

    if (criteria.filterStatus) {
      if (l.licenseAssignmentState !== criteria.filterStatus) return false;
    }

    if (criteria.filterConfig) {
      const configLower = criteria.filterConfig.toLowerCase();
      const resourceName = l.licenseConfig || '';
      const friendlyName = licenseNames[resourceName] || resourceName.split('/').pop() || '';

      if (!resourceName.toLowerCase().includes(configLower) && !friendlyName.toLowerCase().includes(configLower)) {
        return false;
      }
    }

    if (filterDateMs !== null) {
      if (!l.lastLoginTime) return false;
      const userLoginMs = normalizeDateString(l.lastLoginTime);

      if (criteria.filterDateOperator === '>') {
        if (!(userLoginMs > filterDateMs)) return false;
      } else if (criteria.filterDateOperator === '<') {
        if (!(userLoginMs < filterDateMs)) return false;
      } else if (criteria.filterDateOperator === '=') {
        if (userLoginMs !== filterDateMs) return false;
      }
    }

    return true;
  });
}

export function sortUserLicenses(
  userLicenses: UserLicense[],
  sortConfig: { key: SortKey; direction: SortDirection },
  licenseNames: Record<string, string>
): UserLicense[] {
  if (!userLicenses || userLicenses.length === 0) return [];

  return [...userLicenses].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];

    if (sortConfig.key === 'lastLoginTime') {
      const dateA = aVal ? new Date(aVal).getTime() : 0;
      const dateB = bVal ? new Date(bVal).getTime() : 0;
      return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
    }

    if (sortConfig.key === 'licenseConfig') {
      const nameA = licenseNames[a.licenseConfig || ''] || a.licenseConfig || '';
      const nameB = licenseNames[b.licenseConfig || ''] || b.licenseConfig || '';
      if (nameA < nameB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (nameA > nameB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    }

    if ((aVal ?? '') < (bVal ?? '')) return sortConfig.direction === 'asc' ? -1 : 1;
    if ((aVal ?? '') > (bVal ?? '')) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });
}
