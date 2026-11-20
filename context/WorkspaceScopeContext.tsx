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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'gem-workspace-scope-v1';

export interface WorkspaceScopeState {
  /** Active Gemini Enterprise / Discovery Engine location (e.g. 'global', 'us', 'eu', DRZ codes) */
  appLocation: string;
  /** Active Gemini Enterprise App / Engine ID */
  appId: string;
  /** Active Discovery Engine collection ID */
  collectionId: string;
  /** Active User Store ID for license operations */
  userStoreId: string;
  /** Active regional GCP location for Vertex AI Reasoning Engines & Cloud Run */
  gcpRegion: string;
}

export interface WorkspaceScopeContextValue extends WorkspaceScopeState {
  setAppLocation: (location: string) => void;
  setAppId: (appId: string) => void;
  setCollectionId: (collectionId: string) => void;
  setUserStoreId: (userStoreId: string) => void;
  setGcpRegion: (region: string) => void;
  updateScope: (partial: Partial<WorkspaceScopeState>) => void;
}

const DEFAULT_SCOPE: WorkspaceScopeState = {
  appLocation: 'global',
  appId: '',
  collectionId: 'default_collection',
  userStoreId: 'default_user_store',
  gcpRegion: 'us-central1',
};

function loadInitialScope(): WorkspaceScopeState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCOPE;
    const parsed = JSON.parse(raw) as Partial<WorkspaceScopeState>;
    return {
      appLocation: typeof parsed.appLocation === 'string' && parsed.appLocation ? parsed.appLocation : DEFAULT_SCOPE.appLocation,
      appId: typeof parsed.appId === 'string' ? parsed.appId : DEFAULT_SCOPE.appId,
      collectionId: typeof parsed.collectionId === 'string' && parsed.collectionId ? parsed.collectionId : DEFAULT_SCOPE.collectionId,
      userStoreId: typeof parsed.userStoreId === 'string' && parsed.userStoreId ? parsed.userStoreId : DEFAULT_SCOPE.userStoreId,
      gcpRegion: typeof parsed.gcpRegion === 'string' && parsed.gcpRegion ? parsed.gcpRegion : DEFAULT_SCOPE.gcpRegion,
    };
  } catch (err) {
    console.warn('[WorkspaceScopeContext] Failed to parse persisted workspace scope:', err);
    return DEFAULT_SCOPE;
  }
}

const WorkspaceScopeContext = createContext<WorkspaceScopeContextValue | null>(null);

export const WorkspaceScopeProvider: React.FC<{
  projectKey?: string;
  children: React.ReactNode;
}> = ({ projectKey, children }) => {
  const [scope, setScope] = useState<WorkspaceScopeState>(loadInitialScope);

  // Clear selected Engine/App ID when switching GCP projects so stale App IDs do not leak across projects
  const [lastProjectKey, setLastProjectKey] = useState<string | undefined>(projectKey);
  useEffect(() => {
    if (projectKey !== undefined && lastProjectKey !== undefined && projectKey !== lastProjectKey) {
      setLastProjectKey(projectKey);
      setScope((prev) => ({ ...prev, appId: '' }));
    } else if (projectKey !== lastProjectKey) {
      setLastProjectKey(projectKey);
    }
  }, [projectKey, lastProjectKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
    } catch (err) {
      console.warn('[WorkspaceScopeContext] Failed to persist workspace scope:', err);
    }
  }, [scope]);

  const updateScope = useCallback((partial: Partial<WorkspaceScopeState>) => {
    setScope((prev) => {
      const next = { ...prev, ...partial };
      if (
        next.appLocation === prev.appLocation &&
        next.appId === prev.appId &&
        next.collectionId === prev.collectionId &&
        next.userStoreId === prev.userStoreId &&
        next.gcpRegion === prev.gcpRegion
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const setAppLocation = useCallback(
    (appLocation: string) => updateScope({ appLocation }),
    [updateScope]
  );
  const setAppId = useCallback((appId: string) => updateScope({ appId }), [updateScope]);
  const setCollectionId = useCallback(
    (collectionId: string) => updateScope({ collectionId }),
    [updateScope]
  );
  const setUserStoreId = useCallback(
    (userStoreId: string) => updateScope({ userStoreId }),
    [updateScope]
  );
  const setGcpRegion = useCallback(
    (gcpRegion: string) => updateScope({ gcpRegion }),
    [updateScope]
  );

  const value = useMemo<WorkspaceScopeContextValue>(
    () => ({
      ...scope,
      setAppLocation,
      setAppId,
      setCollectionId,
      setUserStoreId,
      setGcpRegion,
      updateScope,
    }),
    [scope, setAppLocation, setAppId, setCollectionId, setUserStoreId, setGcpRegion, updateScope]
  );

  return <WorkspaceScopeContext.Provider value={value}>{children}</WorkspaceScopeContext.Provider>;
};

/**
 * Access shared workspace scope (Location, App/Engine, Collection, UserStore, GCP Region).
 * Falls back safely to local React state when rendered in isolated component unit tests without Provider.
 */
export function useWorkspaceScope(): WorkspaceScopeContextValue {
  const ctx = useContext(WorkspaceScopeContext);
  const [fallback, setFallback] = useState<WorkspaceScopeState>(DEFAULT_SCOPE);

  const fallbackUpdate = useCallback((partial: Partial<WorkspaceScopeState>) => {
    setFallback((prev) => ({ ...prev, ...partial }));
  }, []);

  const fallbackValue = useMemo<WorkspaceScopeContextValue>(
    () => ({
      ...fallback,
      setAppLocation: (appLocation: string) => fallbackUpdate({ appLocation }),
      setAppId: (appId: string) => fallbackUpdate({ appId }),
      setCollectionId: (collectionId: string) => fallbackUpdate({ collectionId }),
      setUserStoreId: (userStoreId: string) => fallbackUpdate({ userStoreId }),
      setGcpRegion: (gcpRegion: string) => fallbackUpdate({ gcpRegion }),
      updateScope: fallbackUpdate,
    }),
    [fallback, fallbackUpdate]
  );

  return ctx ?? fallbackValue;
}
