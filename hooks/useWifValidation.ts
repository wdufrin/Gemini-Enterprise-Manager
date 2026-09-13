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

import { useState, useEffect } from 'react';
import * as api from '../services/apiService';
import { AdkAgentConfig } from '../services/adkTemplates';

export function useWifValidation(adkConfig: AdkAgentConfig, projectNumber: string) {
  const [serviceAccounts, setServiceAccounts] = useState<any[]>([]);
  const [wifProviders, setWifProviders] = useState<any[]>([]);
  const [validationStatus, setValidationStatus] = useState<
    'unchecked' | 'testing' | 'valid' | 'invalid'
  >('unchecked');
  const [validationMessage, setValidationMessage] = useState('');

  // CI/CD IAM Data
  useEffect(() => {
    const fetchIamData = async () => {
      if (!projectNumber || !adkConfig.enableCiCd) return;
      try {
        const accounts = await api.listServiceAccounts(projectNumber);
        setServiceAccounts(accounts);

        const pools = await api.listWorkloadIdentityPools(projectNumber);
        let allProviders: any[] = [];
        for (const pool of pools) {
          const providers = await api.listWorkloadIdentityProviders(pool.name, projectNumber);
          allProviders = allProviders.concat(providers);
        }
        setWifProviders(allProviders);
      } catch (e) {
        console.error('Failed to fetch IAM data:', e);
      }
    };
    fetchIamData();
  }, [projectNumber, adkConfig.enableCiCd]);

  useEffect(() => {
    const validateWif = async () => {
      if (!adkConfig.githubServiceAccount || !adkConfig.githubWifProvider || !projectNumber) {
        setValidationStatus('unchecked');
        return;
      }
      setValidationStatus('testing');
      try {
        const policy = await api.getServiceAccountIamPolicy(
          adkConfig.githubServiceAccount,
          projectNumber
        );
        const bindings = policy.bindings || [];
        let hasBinding = false;
        for (const binding of bindings) {
          if (binding.role === 'roles/iam.workloadIdentityUser') {
            const poolName = adkConfig.githubWifProvider.split('/providers/')[0];
            if (binding.members && binding.members.some((m: string) => m.includes(poolName))) {
              hasBinding = true;
              break;
            }
          }
        }
        if (hasBinding) {
          setValidationStatus('valid');
          setValidationMessage('Service Account is correctly bound to the related WIF Pool.');
        } else {
          setValidationStatus('invalid');
          setValidationMessage(
            'Service Account is missing roles/iam.workloadIdentityUser binding for this WIF Provider / Pool.'
          );
        }
      } catch (e: any) {
        setValidationStatus('invalid');
        if (e.message && e.message.includes('permission')) {
          setValidationMessage('Permission denied to read Service Account IAM policy.');
        } else {
          setValidationMessage('Failed to validate IAM policy.');
        }
      }
    };
    const timeoutId = setTimeout(validateWif, 300);
    return () => clearTimeout(timeoutId);
  }, [adkConfig.githubServiceAccount, adkConfig.githubWifProvider, projectNumber]);

  return {
    serviceAccounts,
    wifProviders,
    validationStatus,
    validationMessage,
    setValidationStatus,
    setValidationMessage,
  };
}
