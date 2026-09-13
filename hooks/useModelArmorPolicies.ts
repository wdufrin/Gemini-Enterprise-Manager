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

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Config } from '../types';
import * as api from '../services/apiService';
import { toErrorMessage } from '../utils/errors';
import { EngineArmorState, readArmorConfig } from '../components/model-armor/types';

export function useModelArmorPolicies(projectNumber: string, activeTab: 'logs' | 'policies') {
  const [templates, setTemplates] = useState<any[]>([]);
  const [associations, setAssociations] = useState<Record<string, string[]>>({});
  const [enginesList, setEnginesList] = useState<EngineArmorState[]>([]);
  const [associationsComplete, setAssociationsComplete] = useState(true);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [isPoliciesLoading, setIsPoliciesLoading] = useState(false);
  const [policiesError, setPoliciesError] = useState<string | null>(null);
  const [cloningTemplate, setCloningTemplate] = useState<any | null>(null);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(
    () => ({
      projectId: projectNumber,
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: '',
      assistantId: '',
    }),
    [projectNumber]
  );

  const fetchPoliciesAndAssociations = useCallback(async () => {
    if (!projectNumber) return;
    setIsPoliciesLoading(true);
    setPoliciesError(null);
    try {
      // 1. Fetch templates
      const templatesRes = await api.fetchModelArmorTemplates(apiConfig);
      const fetchedTemplates = templatesRes.templates || [];
      setTemplates(fetchedTemplates);

      // 2. Fetch engines across all discovery locations
      const newAssociations: Record<string, string[]> = {};
      const allFetchedEngines: EngineArmorState[] = [];
      const warnings: string[] = [];
      let complete = true;

      for (const loc of ['global', 'us', 'eu']) {
        const locConfig = { ...apiConfig, appLocation: loc };
        let engines: Array<{ name?: string; displayName?: string }> = [];
        try {
          const enginesRes = await api.listResources('engines', { ...locConfig, appId: '' });
          engines = enginesRes.engines || [];
        } catch (err) {
          complete = false;
          warnings.push(`Could not list apps in "${loc}": ${toErrorMessage(err, 'request failed')}`);
          continue;
        }

        for (const engine of engines) {
          const engineName = engine.name;
          if (!engineName) continue;
          const engineId = engineName.split('/').pop();
          if (!engineId) continue;

          const engineState: EngineArmorState = {
            name: engineName,
            engineId,
            displayName: engine.displayName || engineId,
            location: loc,
            status: 'ok',
            assistants: [],
          };

          try {
            const assistantsRes = await api.listResources('assistants', { ...locConfig, appId: engineId });
            const assistants: Array<{ name?: string; customerPolicy?: Record<string, unknown> }> =
              assistantsRes.assistants || [];

            for (const assistant of assistants) {
              if (!assistant.name) continue;
              const assistantId = assistant.name.split('/').pop() || assistant.name;
              const customerPolicy = assistant.customerPolicy ?? {};
              const armor = readArmorConfig(assistant);

              engineState.assistants.push({
                name: assistant.name,
                assistantId,
                userPromptTemplate: armor.userPromptTemplate || '',
                responseTemplate: armor.responseTemplate || '',
                failureMode: armor.failureMode || '',
                customerPolicy,
              });

              const appLabel = `${engineState.displayName} (${loc.toUpperCase()} / Assistant: ${assistantId})`;
              for (const templateName of [armor.userPromptTemplate, armor.responseTemplate]) {
                if (!templateName) continue;
                newAssociations[templateName] = newAssociations[templateName] || [];
                if (!newAssociations[templateName].includes(appLabel)) {
                  newAssociations[templateName].push(appLabel);
                }
              }
            }
          } catch (err) {
            complete = false;
            engineState.status = 'unknown';
            engineState.error = toErrorMessage(err, 'request failed');
            warnings.push(
              `Could not read assistant config for "${engineState.displayName}" (${loc}): ${engineState.error}`
            );
          }

          allFetchedEngines.push(engineState);
        }
      }
      setEnginesList(allFetchedEngines);
      setAssociations(newAssociations);
      setAssociationsComplete(complete);
      setScanWarnings(warnings);
    } catch (err) {
      setAssociationsComplete(false);
      setPoliciesError(toErrorMessage(err, 'Failed to fetch policies and associations.'));
    } finally {
      setIsPoliciesLoading(false);
    }
  }, [apiConfig, projectNumber]);

  useEffect(() => {
    if (activeTab === 'policies' && projectNumber) {
      fetchPoliciesAndAssociations();
    }
  }, [activeTab, projectNumber, fetchPoliciesAndAssociations]);

  return {
    templates,
    associations,
    enginesList,
    associationsComplete,
    scanWarnings,
    isPoliciesLoading,
    policiesError,
    cloningTemplate,
    setCloningTemplate,
    fetchPoliciesAndAssociations,
  };
}
