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

import { useState, useEffect, useCallback } from 'react';
import { ConnectorChecklistState, ProbeExecutionResult } from './types';

const STORAGE_PREFIX = 'gem_connector_checklist_';

export function useChecklistState(connectorName: string) {
  const sanitizedKey = connectorName ? connectorName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default';
  const storageKey = `${STORAGE_PREFIX}${sanitizedKey}`;

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

  // Keep state synced if connectorName changes
  useEffect(() => {
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
    } catch {
      // Ignore parse failure
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
        // If probe passed, auto-check the item!
        const nextChecked = {
          ...prev.checkedItems,
          ...(result.status === 'pass' ? { [itemId]: true } : {}),
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

  const resetChecklist = useCallback(() => {
    const clearedState: ConnectorChecklistState = {
      connectorName,
      lastUpdated: new Date().toISOString(),
      checkedItems: {},
      probeResults: {},
    };
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore removal failure
    }
    setState(clearedState);
  }, [connectorName, storageKey]);

  return {
    state,
    toggleItem,
    recordProbeResult,
    resetChecklist,
  };
}
