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

import { useState, useRef, useEffect } from 'react';
import { Config, DataStore, WorkloadIdentityPool, WorkloadIdentityProvider } from '../types';
import * as api from '../services/apiService';
import { AuthMode, CodeLanguage, QueryHistoryEntry, SearchResultItem } from '../components/datastores/query/types';
import { toErrorMessage } from '../utils/errors';

export function useDataStoreQuery(
  isOpen: boolean,
  dataStore: DataStore,
  config: Config,
) {
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [isSearching, setIsSearching] = useState(false);
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>('python');
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // Auth mode state
  const [authMode, setAuthMode] = useState<AuthMode>('default');
  const [showWifConfig, setShowWifConfig] = useState(false);
  const [wifPoolId, setWifPoolId] = useState('');
  const [wifProviderId, setWifProviderId] = useState('');
  const [isExchangingToken, setIsExchangingToken] = useState(false);
  const [wifAccessToken, setWifAccessToken] = useState<string | null>(null);
  const [wifTokenError, setWifTokenError] = useState<string | null>(null);
  const [availablePools, setAvailablePools] = useState<WorkloadIdentityPool[]>([]);
  const [availableProviders, setAvailableProviders] = useState<WorkloadIdentityProvider[]>([]);
  const [isLoadingPools, setIsLoadingPools] = useState(false);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  // IdP sign-in state
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [wifSubjectToken, setWifSubjectToken] = useState('');
  const [wifSubjectTokenType, setWifSubjectTokenType] = useState('urn:ietf:params:oauth:token-type:id_token');
  const [wifSignedInEmail, setWifSignedInEmail] = useState<string | null>(null);
  const [wifProviderDisplayName, setWifProviderDisplayName] = useState<string | null>(null);
  const [showManualToken, setShowManualToken] = useState(false);

  const projectId = config.projectId;
  const location = config.appLocation || 'global';

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHistory([]);
      setExpandedResult(null);
      setWifAccessToken(null);
      setWifTokenError(null);
      setWifSignedInEmail(null);
      setWifSubjectToken('');
      setWifProviderDisplayName(null);
    }
  }, [isOpen]);

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Reset WIF token when config changes
  useEffect(() => {
    setWifAccessToken(null);
    setWifTokenError(null);
    setWifSignedInEmail(null);
    setWifSubjectToken('');
    setWifProviderDisplayName(null);
  }, [wifPoolId, wifProviderId]);

  useEffect(() => {
    const discoverPool = async () => {
      if (authMode === 'wif' && showWifConfig && projectId && location) {
        try {
          const acl = await api.getAclConfig({ ...config, projectId, appLocation: location });
          const poolName = acl.idpConfig?.externalIdpConfig?.workforcePoolName;
          if (poolName) {
            const poolId = poolName.split('/').pop();
            if (poolId) {
              setWifPoolId(prev => prev || poolId);
            }
          }
        } catch (e) {
          console.error('Failed to fetch aclConfig for pool discovery', e);
        }
      }
    };
    discoverPool();
  }, [authMode, showWifConfig, projectId, location]);

  useEffect(() => {
    const fetchPools = async () => {
      if (authMode === 'wif' && showWifConfig && projectId) {
        setIsLoadingPools(true);
        try {
          const pools = await api.listWorkloadIdentityPools(projectId);
          setAvailablePools(pools);
        } catch (e: any) {
          console.error('Failed to fetch workforce pools', e);
          const msg = toErrorMessage(e);
          if (msg.includes('403') || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
            setWifTokenError("Missing IAM permission to list Workforce Pools (requires roles/iam.workforcePoolViewer). You can enter your Pool ID manually.");
          } else {
            setWifTokenError(`Failed to auto-discover Workforce Pools: ${msg}. You can enter your Pool ID manually.`);
          }
        } finally {
          setIsLoadingPools(false);
        }
      }
    };
    fetchPools();
  }, [authMode, showWifConfig, projectId]);

  useEffect(() => {
    const fetchProviders = async () => {
      if (authMode === 'wif' && wifPoolId && projectId) {
        setIsLoadingProviders(true);
        try {
          const providerData = await api.listWorkloadIdentityProviders(`locations/global/workforcePools/${wifPoolId}`, projectId);
          setAvailableProviders(providerData);
        } catch (e: any) {
          console.error('Failed to fetch workforce pool providers', e);
          const msg = toErrorMessage(e);
          if (msg.includes('403') || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
            setWifTokenError("Missing IAM permission to list Workforce Pool Providers. You can enter your Provider ID manually.");
          } else {
            setWifTokenError(`Failed to list Workforce Pool Providers: ${msg}. You can enter your Provider ID manually.`);
          }
        } finally {
          setIsLoadingProviders(false);
        }
      } else {
        setAvailableProviders([]);
      }
    };
    fetchProviders();
  }, [authMode, wifPoolId, projectId]);

  const codeQuery = query.trim() || (history.length > 0 ? history[history.length - 1].query : 'your search query');
  const isWifSignedIn = authMode === 'wif' && !!wifSubjectToken;
  const isWifConfigValid = authMode === 'wif' && !!wifPoolId.trim() && !!wifProviderId.trim() && !!wifSubjectToken;

  const handleSignIn = async () => {
    if (!wifPoolId.trim() || !wifProviderId.trim()) return;

    setIsSigningIn(true);
    setWifTokenError(null);
    setWifSubjectToken('');
    setWifSignedInEmail(null);
    setWifAccessToken(null);

    try {
      const providerConfig = await api.fetchWorkforceProviderConfig(
        wifPoolId.trim(),
        wifProviderId.trim(),
      );

      if (!providerConfig.oidc) {
        throw new Error('This provider is not configured for OIDC. Only OIDC providers support automatic sign-in.');
      }

      setWifProviderDisplayName(providerConfig.displayName || null);
      const { issuerUri, clientId } = providerConfig.oidc;

      const discovery = await api.fetchOidcDiscovery(issuerUri);
      const redirectUri = window.location.origin + window.location.pathname;
      const result = await api.signInWithOidcPopup(
        discovery.authorization_endpoint,
        clientId,
        redirectUri,
      );

      setWifSubjectToken(result.idToken);
      setWifSubjectTokenType('urn:ietf:params:oauth:token-type:id_token');
      setWifSignedInEmail(result.email || null);
    } catch (err: unknown) {
      setWifTokenError(toErrorMessage(err, 'Sign-in failed.'));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    const currentQuery = query;
    setIsSearching(true);

    try {
      let response: { results?: SearchResultItem[]; totalSize?: number };

      if (authMode === 'wif') {
        setIsExchangingToken(true);
        setWifTokenError(null);

        let accessToken: string;
        try {
          const stsResult = await api.exchangeStsToken({
            userProject: projectId,
            poolId: wifPoolId.trim(),
            providerId: wifProviderId.trim(),
            subjectToken: wifSubjectToken.trim(),
            subjectTokenType: wifSubjectTokenType,
          });
          accessToken = stsResult.access_token;
          setWifAccessToken(accessToken);
        } catch (stsErr: unknown) {
          setWifTokenError(toErrorMessage(stsErr, 'Token exchange failed.'));
          throw stsErr;
        } finally {
          setIsExchangingToken(false);
        }

        response = await api.queryDataStoreWithToken(
          dataStore.name,
          location,
          projectId,
          accessToken,
          currentQuery,
          pageSize,
        );
      } else {
        response = await api.queryDataStore(
          dataStore.name,
          config,
          currentQuery,
          pageSize,
        );
      }

      setHistory(prev => [...prev, {
        query: currentQuery,
        results: response.results || [],
        totalSize: response.totalSize,
        timestamp: new Date(),
        authMode,
      }]);
    } catch (err: unknown) {
      setHistory(prev => [...prev, {
        query: currentQuery,
        results: [],
        error: toErrorMessage(err, 'Search failed.'),
        timestamp: new Date(),
        authMode,
      }]);
    } finally {
      setIsSearching(false);
      setQuery('');
    }
  };

  const toggleExpandResult = (resultId: string) => {
    setExpandedResult(prev => prev === resultId ? null : resultId);
  };

  return {
    query,
    setQuery,
    pageSize,
    setPageSize,
    isSearching,
    history,
    expandedResult,
    toggleExpandResult,
    showCodePanel,
    setShowCodePanel,
    codeLanguage,
    setCodeLanguage,
    resultsEndRef,
    authMode,
    setAuthMode,
    showWifConfig,
    setShowWifConfig,
    wifPoolId,
    setWifPoolId,
    wifProviderId,
    setWifProviderId,
    isExchangingToken,
    wifAccessToken,
    wifTokenError,
    availablePools,
    availableProviders,
    isLoadingPools,
    isLoadingProviders,
    isSigningIn,
    wifSubjectToken,
    setWifSubjectToken,
    wifSubjectTokenType,
    setWifSubjectTokenType,
    wifSignedInEmail,
    setWifSignedInEmail,
    wifProviderDisplayName,
    showManualToken,
    setShowManualToken,
    handleSignIn,
    handleSearch,
    isWifSignedIn,
    isWifConfigValid,
    codeQuery,
    projectId,
    location,
  };
}
