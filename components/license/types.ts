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

export interface UserLicense {
  name?: string;
  userPrincipal: string;
  licenseAssignmentState?: 'ASSIGNED' | 'UNASSIGNED' | string;
  licenseConfig?: string;
  lastLoginTime?: string;
  createTime?: string;
  updateTime?: string;
}

export interface LicenseConfig {
  name: string;
  displayName?: string;
  state?: string;
  endDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  licenseCount?: number | string;
  subscriptionTier?: string;
  startDate?: string;
  renewalTime?: string;
  userLicenseCount?: number;
  source?: string;
}

export interface BillingAccount {
  name: string;
  displayName?: string;
}

export interface BillingAccountLicenseConfig {
  name: string;
  displayName?: string;
  licenseCount?: number | string;
  subscriptionTier?: string;
  state?: string;
  startDate?: string;
  endDate?: string;
  renewalTime?: string;
  licenseConfigDistributions?: Record<string, string>;
}

export interface CloudRunServiceItem {
  name: string;
  template?: {
    containers?: Array<{
      env?: Array<{ name: string; value?: string }>;
    }>;
  };
  labels?: Record<string, string>;
  status?: {
    url?: string;
  };
}

export type SortKey = 'userPrincipal' | 'licenseAssignmentState' | 'licenseConfig' | 'lastLoginTime';
export type SortDirection = 'asc' | 'desc';
