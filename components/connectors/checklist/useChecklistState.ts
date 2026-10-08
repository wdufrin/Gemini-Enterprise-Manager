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

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectorChecklistState, ProbeExecutionResult } from './types';

const STORAGE_PREFIX = 'gem_connector_checklist_';

export function useChecklistState(connectorName: string) {
  const sanitizedKey = connectorName ? connectorName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default';
  const storageKey = `${STORAGE_PREFIX}${sanitizedKey}`;
  const prevStorageKeyRef = useRef<string>(storageKey);

  const [state, setState] = useState<ConnectorChecklistState>(() => {
    if (typeof window === 'undefined') {
      return {
        connectorName,
        lastUpdated: new Date().toISOString(),
        checkedItems: {},
        probeResults: {},
      };
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          connectorName,
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
          checkedItems: parsed.checkedItems || {},
          probeResults: parsed.probeResults || {},
        };
      }
    } catch (e) {
      console.warn(`[useChecklistState] Failed to read checklist state for ${connectorName}:`, e);
    }

    return {
      connectorName,
      lastUpdated: new Date().toISOString(),
      checkedItems: {},
      probeResults: {},
    };
  });

  // Keep state synced ONLY when storageKey actually changes after mount
  useEffect(() => {
    if (prevStorageKeyRef.current === storageKey) {
      return;
    }
    prevStorageKeyRef.current = storageKey;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setState({
          connectorName,
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
          checkedItems: parsed.checkedItems || {},
          probeResults: parsed.probeResults || {},
        });
        return;
      }
    } catch (err) {
      console.warn(`[useChecklistState] Failed to parse stored state for ${connectorName}:`, err);
    }

    setState({
      connectorName,
      lastUpdated: new Date().toISOString(),
      checkedItems: {},
      probeResults: {},
    });
  }, [connectorName, storageKey]);

  // Persist helper
  const persistState = useCallback(
    (newState: ConnectorChecklistState) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newState));
      } catch (err) {
        console.warn(`[useChecklistState] Failed to save checklist state for ${connectorName}:`, err);
      }
    },
    [connectorName, storageKey]
  );

  const toggleItem = useCallback(
    (itemId: string) => {
      setState((prev) => {
        const existingProbe = prev.probeResults?.[itemId];
        // Prevent manually checking an automated probe item that is actively failing
        if (existingProbe?.status === 'fail' && !prev.checkedItems[itemId]) {
          return prev;
        }
        const nextChecked = {
          ...prev.checkedItems,
          [itemId]: !prev.checkedItems[itemId],
        };
        const nextState: ConnectorChecklistState = {
          ...prev,
          lastUpdated: new Date().toISOString(),
          checkedItems: nextChecked,
        };
        persistState(nextState);
        return nextState;
      });
    },
    [persistState]
  );

  const recordProbeResult = useCallback(
    (itemId: string, result: ProbeExecutionResult) => {
      setState((prev) => {
        const nextProbeResults = {
          ...(prev.probeResults || {}),
          [itemId]: result,
        };
        const nextChecked = {
          ...prev.checkedItems,
          ...(result.status === 'pass'
            ? { [itemId]: true }
            : result.status === 'fail'
              ? { [itemId]: false }
              : {}),
        };
        const nextState: ConnectorChecklistState = {
          ...prev,
          lastUpdated: new Date().toISOString(),
          checkedItems: nextChecked,
          probeResults: nextProbeResults,
        };
        persistState(nextState);
        return nextState;
      });
    },
    [persistState]
  );

  const recordProbeResults = useCallback(
    (results: Record<string, ProbeExecutionResult>) => {
      setState((prev) => {
        const nextProbeResults = {
          ...(prev.probeResults || {}),
          ...results,
        };
        const nextChecked = { ...prev.checkedItems };
        for (const [itemId, res] of Object.entries(results)) {
          if (res.status === 'pass') {
            nextChecked[itemId] = true;
          } else if (res.status === 'fail') {
            nextChecked[itemId] = false;
          }
        }
        const nextState: ConnectorChecklistState = {
          ...prev,
          lastUpdated: new Date().toISOString(),
          checkedItems: nextChecked,
          probeResults: nextProbeResults,
        };
        persistState(nextState);
        return nextState;
      });
    },
    [persistState]
  );

  const resetChecklist = useCallback(() => {
    const clearedState: ConnectorChecklistState = {
      connectorName,
      lastUpdated: new Date().toISOString(),
      checkedItems: {},
      probeResults: {},
    };
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn(`[useChecklistState] Failed to remove checklist state for ${connectorName}:`, err);
    }
    setState(clearedState);
  }, [connectorName, storageKey]);

  return {
    state,
    toggleItem,
    recordProbeResult,
    recordProbeResults,
    resetChecklist,
  };
}

