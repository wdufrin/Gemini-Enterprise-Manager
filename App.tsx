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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import { GlobalDebugProvider } from './context/GlobalDebugContext';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import Spinner from './components/Spinner';
import { pageToRoute, routeToPage } from './utils/routeUtils';
import { Page, ReasoningEngine, UserProfile, ServiceAgentValidation, UserPermissionsValidation } from './types';
import AccessTokenInput from './components/AccessTokenInput';
import { initGapiClient, getGapiClient } from './services/gapiService';
import * as api from './services/apiService';
import Breadcrumbs from './components/Breadcrumbs';
import HeaderProjectInput from './components/HeaderProjectInput';
import HelpButton from './components/HelpButton';
import { AppRoutes } from './components/layout/AppRoutes';
import { AppModals } from './components/layout/AppModals';
import { AuthWelcomeScreen, DEFAULT_GOOGLE_CLIENT_ID } from './components/auth/AuthWelcomeScreen';
import { OnboardingBanner } from './components/OnboardingBanner';

import { toErrorMessage } from './utils/errors';

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string; hint?: string }) => void;
  callback?: (response: GoogleTokenResponse) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const InnerApp: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = useMemo(() => routeToPage(location.pathname), [location.pathname]);
  const [pageContext, setPageContext] = useState<unknown>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Auto-redirect root or unrecognized route to /agents, or normalize legacy /v_* views to /observability?view=*
  useEffect(() => {
    if (location.pathname === '/' || !location.pathname) {
      navigate('/agents', { replace: true });
    } else if (location.pathname.startsWith('/v_')) {
      const viewId = location.pathname.slice(1);
      navigate(`/observability?view=${encodeURIComponent(viewId)}`, { replace: true });
    } else if (location.pathname === '/catalog') {
      navigate('/agents', { replace: true });
    } else if (location.pathname === '/connectors') {
      navigate('/datastores?tab=connectors', { replace: true });
    } else if (location.pathname === '/vanity-urls' || location.pathname === '/domains' || location.pathname === '/custom-domains') {
      navigate('/assistant', { replace: true });
    }
  }, [location.pathname, navigate]);

  const [accessToken, setAccessToken] = useState<string>('');
  const [projectNumber, setProjectNumber] = useState<string>(() => sessionStorage.getItem('agentspace-projectNumber') || '');
  const [projectId, setProjectId] = useState<string>(() => sessionStorage.getItem('agentspace-projectId') || '');

  // SSO State
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const userEmailRef = useRef<string | null>(null);
  const tokenClient = useRef<GoogleTokenClient | null>(null);
  const tokenExpiryRef = useRef<number | null>(null);
  const isRenewingRef = useRef<boolean>(false);

  // Load client ID from storage, env variables, or config.json
  useEffect(() => {
    const storedClientId = localStorage.getItem('custom-google-client-id');
    if (storedClientId) {
      setGoogleClientId(storedClientId);
      return;
    }

    const viteEnvClientId = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID;
    if (viteEnvClientId) {
      setGoogleClientId(viteEnvClientId);
      return;
    }

    fetch('/config.json')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.GOOGLE_CLIENT_ID) {
          setGoogleClientId(data.GOOGLE_CLIENT_ID);
        } else {
          setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID);
        }
      })
      .catch(() => {
        setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID);
      });
  }, []);

  // State for the initialization and login flow
  const [isGapiInitialized, setIsGapiInitialized] = useState(false);
  const [isGapiReady, setIsGapiReady] = useState(false);
  const [isGapiLoading, setIsGapiLoading] = useState(false);
  const [isTokenValidating, setIsTokenValidating] = useState(false);
  const [gapiError, setGapiError] = useState<string | null>(null);

  // State for API validation check
  const [isApiValidationLoading, setIsApiValidationLoading] = useState(false);
  const [apiValidationResult, setApiValidationResult] = useState<{ enabled: string[]; disabled: string[] } | null>(null);
  const [serviceAgentValidation, setServiceAgentValidation] = useState<ServiceAgentValidation | null>(null);
  const [userPermissionsValidation, setUserPermissionsValidation] = useState<UserPermissionsValidation | null>(null);
  const [isGrantingServiceAgent, setIsGrantingServiceAgent] = useState(false);
  const [serviceAgentActionFeedback, setServiceAgentActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // State for enabling APIs
  const [apisToEnable, setApisToEnable] = useState<Set<string>>(new Set());
  const [isApiEnablingLoading, setIsApiEnablingLoading] = useState(false);
  const [apiEnablementLogs, setApiEnablementLogs] = useState<string[]>([]);

  // State for modals
  const [infoModalKey, setInfoModalKey] = useState<string | null>(null);
  const [directQueryEngine, setDirectQueryEngine] = useState<ReasoningEngine | null>(null);

  // State for in-flight re-authentication
  const [showReauthModal, setShowReauthModal] = useState(false);

  // Global Build Monitoring State
  const [activeBuilds, setActiveBuilds] = useState<{ id: string; projectId: string }[]>(() => {
    try {
      const saved = sessionStorage.getItem('active_cloud_builds');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleBuildTriggered = useCallback((buildId: string, buildProjectId?: string) => {
    const targetProject = buildProjectId || projectId || projectNumber;
    setActiveBuilds((prev) => {
      if (prev.some((b) => b.id === buildId)) return prev;
      const updated = [...prev, { id: buildId, projectId: targetProject }];
      sessionStorage.setItem('active_cloud_builds', JSON.stringify(updated));
      return updated;
    });
  }, [projectId, projectNumber]);

  const handleRemoveBuild = useCallback((buildId: string) => {
    setActiveBuilds((prev) => {
      const updated = prev.filter((b) => b.id !== buildId);
      sessionStorage.setItem('active_cloud_builds', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleSignOut = useCallback(() => {
    setAccessToken('');
    setUserProfile(null);
    userEmailRef.current = null;
    tokenExpiryRef.current = null;
    setIsGapiReady(false);
    setIsGapiInitialized(false);
    setApiValidationResult(null);
    setServiceAgentValidation(null);
    setUserPermissionsValidation(null);
    sessionStorage.removeItem('agentspace-accessToken');
    sessionStorage.removeItem('agentspace-userProfile');
  }, []);

  const renewTokenSilently = useCallback(async (): Promise<string | null> => {
    if (isRenewingRef.current) return null;
    const client = tokenClient.current;
    if (!client) return null;
    isRenewingRef.current = true;

    return new Promise<string | null>((resolve) => {
      try {
        const originalCallback = client.callback;
        client.callback = (response: GoogleTokenResponse) => {
          client.callback = originalCallback;
          isRenewingRef.current = false;
          if (response.error) {
            console.warn('[SSO] Silent token renewal failed:', response.error);
            resolve(null);
          } else if (response.access_token) {
            const expiresIn = response.expires_in ? Number(response.expires_in) : 3600;
            tokenExpiryRef.current = Date.now() + expiresIn * 1000;
            setAccessToken(response.access_token);
            sessionStorage.setItem('agentspace-accessToken', response.access_token);
            initGapiClient(response.access_token).catch((err) => {
              console.warn('[SSO] Reinitializing gapi client with refreshed token failed:', err);
            });
            resolve(response.access_token);
          } else {
            resolve(null);
          }
        };
        client.requestAccessToken({
          prompt: '',
          hint: userEmailRef.current || undefined,
        });
      } catch (err) {
        console.warn('[SSO] Error requesting silent token:', err);
        isRenewingRef.current = false;
        resolve(null);
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribe = api.onAuthExpired(async () => {
      // If we have a Google Identity Services token client, attempt silent refresh first
      if (tokenClient.current) {
        try {
          const freshToken = await renewTokenSilently();
          if (freshToken) {
            return;
          }
        } catch (err) {
          console.warn('[SSO] Silent renewal attempt threw:', err);
        }
      }
      setShowReauthModal(true);
    });
    return unsubscribe;
  }, [renewTokenSilently]);

  const handleSetAccessToken = useCallback(async (token: string) => {
    setAccessToken(token);
    sessionStorage.setItem('agentspace-accessToken', token);

    if (token) {
      setIsTokenValidating(true);
      setGapiError(null);
      try {
        await initGapiClient(token);
        setIsGapiReady(true);
      } catch (err: unknown) {
        setGapiError(`Token configuration failed: ${toErrorMessage(err)}`);
        setIsGapiReady(false);
      } finally {
        setIsTokenValidating(false);
      }
    } else {
      setIsGapiReady(false);
    }
  }, []);

  const handleGoogleSignIn = useCallback(() => {
    if (tokenClient.current) {
      setGapiError(null);
      setIsGapiLoading(true);
      tokenClient.current.requestAccessToken({ prompt: 'consent' });
    } else {
      setGapiError('Google Identity Services client is not initialized. Please check your OAuth Client ID.');
    }
  }, []);

  const initGoogleClient = useCallback(() => {
    if (!googleClientId) return;
    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.oauth2) {
      setGapiError('Google Identity Services script not loaded. Refresh or check network connectivity.');
      return;
    }

    try {
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope:
          'https://www.googleapis.com/auth/cloud-platform ' +
          'https://www.googleapis.com/auth/userinfo.profile ' +
          'https://www.googleapis.com/auth/userinfo.email',
        callback: async (tokenResponse: GoogleTokenResponse) => {
          setIsGapiLoading(false);
          if (tokenResponse.error !== undefined) {
            setGapiError(`Sign-in failed: ${tokenResponse.error}`);
            return;
          }

          const token = tokenResponse.access_token;
          const expiresIn = tokenResponse.expires_in ? Number(tokenResponse.expires_in) : 3600;
          tokenExpiryRef.current = Date.now() + expiresIn * 1000;

          handleSetAccessToken(token);

          try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const profile = await res.json();
            setUserProfile({
              name: profile.name,
              email: profile.email,
              picture: profile.picture,
            });
            userEmailRef.current = profile.email || null;
            sessionStorage.setItem('agentspace-userProfile', JSON.stringify(profile));
          } catch (e) {
            console.warn('Failed to fetch user profile:', e);
          }
        },
      });
    } catch (e: unknown) {
      setGapiError(`Failed to initialize Google Sign-In client: ${toErrorMessage(e)}`);
    }
  }, [googleClientId, handleSetAccessToken]);

  useEffect(() => {
    if (!googleClientId) return;
    const checkGsi = setInterval(() => {
      if (typeof window.google !== 'undefined' && window.google.accounts) {
        clearInterval(checkGsi);
        initGoogleClient();
      }
    }, 100);
    return () => clearInterval(checkGsi);
  }, [initGoogleClient, googleClientId]);

  // Try to restore session on initial load
  useEffect(() => {
    const savedToken = sessionStorage.getItem('agentspace-accessToken');
    const savedProfile = sessionStorage.getItem('agentspace-userProfile');

    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setUserProfile(parsed);
        userEmailRef.current = parsed.email || null;
      } catch (e) {
        console.warn('Failed to parse saved user profile', e);
      }
    }

    if (savedToken) {
      handleSetAccessToken(savedToken).then(() => {
        const savedProject = sessionStorage.getItem('agentspace-projectNumber');
        if (savedProject) {
          setIsGapiInitialized(true);
        }
      });
    }
  }, [handleSetAccessToken]);

  const handleSetProjectNumber = async (identifier: string) => {
    setProjectNumber(identifier);
    sessionStorage.setItem('agentspace-projectNumber', identifier);

    if (!identifier) {
      setProjectId('');
      sessionStorage.removeItem('agentspace-projectId');
      return;
    }

    try {
      const projectDetails = await api.getProject(identifier);
      setProjectNumber(projectDetails.projectNumber);
      setProjectId(projectDetails.projectId);
      sessionStorage.setItem('agentspace-projectId', projectDetails.projectId);
      setApiValidationResult(null);
    } catch (e) {
      console.error('Failed to resolve project details', e);
      if (/^\d+$/.test(identifier)) {
        setProjectNumber(identifier);
      }
    }
  };

  const handleValidateApis = async () => {
    const targetProject = projectId || projectNumber;
    if (!targetProject) return;
    setIsApiValidationLoading(true);
    setApiValidationResult(null);
    setServiceAgentValidation(null);
    setUserPermissionsValidation(null);
    setServiceAgentActionFeedback(null);
    setApisToEnable(new Set());
    setApiEnablementLogs([]);
    setGapiError(null);
    try {
      const result = await api.runComprehensiveProjectValidation(
        targetProject,
        projectNumber || targetProject,
      );
      setApiValidationResult(result.apis);
      setServiceAgentValidation(result.serviceAgent);
      setUserPermissionsValidation(result.userPermissions);
    } catch (err: unknown) {
      setGapiError(`Validation check failed: ${toErrorMessage(err)}. Ensure the Service Usage API is enabled.`);
    } finally {
      setIsApiValidationLoading(false);
    }
  };

  const handleGrantServiceAgent = async () => {
    const targetProject = projectId || projectNumber;
    if (!targetProject || !projectNumber) return;
    setIsGrantingServiceAgent(true);
    setServiceAgentActionFeedback(null);
    try {
      await api.grantDiscoveryEngineServiceAgentRole(targetProject, projectNumber, [
        'roles/aiplatform.user',
      ]);
      setServiceAgentActionFeedback({
        type: 'success',
        message:
          'Successfully assigned roles/discoveryengine.serviceAgent and roles/aiplatform.user to Discovery Engine Service Agent!',
      });
      const updatedSA = await api.checkDiscoveryEngineServiceAgent(targetProject, projectNumber);
      setServiceAgentValidation(updatedSA);
    } catch (err: unknown) {
      setServiceAgentActionFeedback({
        type: 'error',
        message: `Failed to grant Service Agent role: ${toErrorMessage(err)}. You need roles/resourcemanager.projectIamAdmin or Project Owner privileges.`,
      });
    } finally {
      setIsGrantingServiceAgent(false);
    }
  };

  const handleToggleApiToEnable = (apiName: string) => {
    setApisToEnable((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(apiName)) newSet.delete(apiName);
      else newSet.add(apiName);
      return newSet;
    });
  };

  const handleToggleAllApisToEnable = () => {
    if (apiValidationResult?.disabled) {
      if (apisToEnable.size === apiValidationResult.disabled.length) {
        setApisToEnable(new Set());
      } else {
        setApisToEnable(new Set(apiValidationResult.disabled));
      }
    }
  };

  const addEnablementLog = (log: string) => {
    setApiEnablementLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
  };

  const handleEnableApis = async () => {
    if (apisToEnable.size === 0) return;
    setIsApiEnablingLoading(true);
    setApiEnablementLogs([]);
    setGapiError(null);

    addEnablementLog(`Starting to enable ${apisToEnable.size} API(s)...`);
    try {
      const operation = await api.batchEnableApis(projectNumber, Array.from(apisToEnable));
      addEnablementLog(`Enablement operation started: ${operation.name}`);

      let currentOperation = operation;
      while (!currentOperation.done) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        currentOperation = await api.getServiceUsageOperation(operation.name);
        addEnablementLog('Polling for operation status...');
      }

      if (currentOperation.error) {
        throw new Error(`Operation failed: ${currentOperation.error.message}`);
      }

      addEnablementLog('API enablement successful! Re-validating...');
      setApisToEnable(new Set());
      await handleValidateApis();
    } catch (err: unknown) {
      const message = `API enablement failed: ${toErrorMessage(err)}`;
      setGapiError(message);
      addEnablementLog(`ERROR: ${message}`);
    } finally {
      setIsApiEnablingLoading(false);
    }
  };

  const handleEnterApp = () => {
    if (isGapiReady && projectNumber) {
      setIsGapiInitialized(true);
    } else {
      setGapiError('Cannot enter application. Ensure the API client is initialized and a project is set.');
    }
  };

  const handleShowInfo = (infoKey: string) => {
    setInfoModalKey(infoKey);
  };

  const handleCloseInfoModal = () => {
    setInfoModalKey(null);
  };

  const handleNavigation = (page: Page, context: unknown = null) => {
    setPageContext(context);
    navigate(pageToRoute(page));
  };

  const handleMenuClick = (page: Page) => {
    setPageContext(null);
    navigate(pageToRoute(page));
  };

  const handleDirectQuery = (engine: ReasoningEngine) => {
    setDirectQueryEngine(engine);
  };

  if (!isGapiInitialized) {
    return (
      <AuthWelcomeScreen
        isGapiReady={isGapiReady}
        isGapiLoading={isGapiLoading}
        isTokenValidating={isTokenValidating}
        gapiError={gapiError}
        accessToken={accessToken}
        googleClientId={googleClientId}
        setGoogleClientId={setGoogleClientId}
        userProfile={userProfile}
        projectNumber={projectNumber}
        onGoogleSignIn={handleGoogleSignIn}
        onSetAccessToken={handleSetAccessToken}
        onSignOut={handleSignOut}
        onSetProjectNumber={handleSetProjectNumber}
        onValidateApis={handleValidateApis}
        onEnterApp={handleEnterApp}
        isApiValidationLoading={isApiValidationLoading}
        apiValidationResult={apiValidationResult}
        serviceAgentValidation={serviceAgentValidation}
        userPermissionsValidation={userPermissionsValidation}
        isGrantingServiceAgent={isGrantingServiceAgent}
        serviceAgentActionFeedback={serviceAgentActionFeedback}
        onGrantServiceAgent={handleGrantServiceAgent}
        apisToEnable={apisToEnable}
        onToggleApiToEnable={handleToggleApiToEnable}
        onToggleAllApisToEnable={handleToggleAllApisToEnable}
        isApiEnablingLoading={isApiEnablingLoading}
        onEnableApis={handleEnableApis}
        apiEnablementLogs={apiEnablementLogs}
      />
    );
  }

  return (
    <>
      <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
        <Sidebar
          currentPage={currentPage}
          setCurrentPage={handleMenuClick}
          onShowInfo={handleShowInfo}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-gray-800 border-b border-gray-700 p-4 flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
            <div className="flex flex-col gap-1">
              <Breadcrumbs currentPage={currentPage} context={pageContext} />
              <HeaderProjectInput
                projectId={projectId}
                projectNumber={projectNumber}
                onChange={handleSetProjectNumber}
              />
            </div>

            <div className="flex items-center gap-4">
              <HelpButton />
              <div className="h-8 w-px bg-gray-700 mx-2 hidden md:block"></div>
              <AccessTokenInput
                accessToken={accessToken}
                setAccessToken={handleSetAccessToken}
                userProfile={userProfile}
                onSignOut={handleSignOut}
              />
            </div>
          </header>
          <div key={currentPage} className="flex-1 overflow-y-auto p-6 relative">
            <OnboardingBanner
              projectId={projectId}
              projectNumber={projectNumber}
              accessToken={accessToken}
              onNavigate={handleMenuClick}
            />
            <ErrorBoundary boundaryName={currentPage} resetKey={currentPage}>
              <React.Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center p-16 text-gray-400 gap-3">
                    <Spinner className="h-10 w-10" />
                    <span className="text-sm font-medium text-gray-300">
                      Loading module...
                    </span>
                  </div>
                }
              >
                <AppRoutes
                  currentPage={currentPage}
                  pageContext={pageContext}
                  projectNumber={projectNumber}
                  projectId={projectId}
                  accessToken={accessToken}
                  userProfile={userProfile}
                  onSetProjectNumber={handleSetProjectNumber}
                  onNavigate={handleNavigation}
                  onDirectQuery={handleDirectQuery}
                  onBuildTriggered={handleBuildTriggered}
                />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <AppModals
        activeBuilds={activeBuilds}
        onRemoveBuild={handleRemoveBuild}
        infoModalKey={infoModalKey}
        onCloseInfoModal={handleCloseInfoModal}
        directQueryEngine={directQueryEngine}
        onCloseDirectQuery={() => setDirectQueryEngine(null)}
        projectNumber={projectNumber}
        accessToken={accessToken}
        userProfile={userProfile}
        showReauthModal={showReauthModal}
        onCloseReauthModal={() => setShowReauthModal(false)}
        hasTokenClient={!!tokenClient.current}
        onGoogleSignIn={handleGoogleSignIn}
        onSetAccessToken={handleSetAccessToken}
      />
    </>
  );
};

const App: React.FC = () => {
  return (
    <GlobalDebugProvider>
      <ToastProvider>
        <HashRouter>
          <InnerApp />
        </HashRouter>
      </ToastProvider>
    </GlobalDebugProvider>
  );
};

export default App;
