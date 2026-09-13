import React, { useState, useEffect, useRef } from 'react';
import { Config } from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface AgentRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectNumber: string;
  builderTab: 'adk' | 'a2a';
  agentName: string;
  agentDescription: string;
  defaultReasoningEngine?: string;
  defaultAgentUrl?: string;
  onSuccess?: (message: string) => void;
}

const AgentRegisterModal: React.FC<AgentRegisterModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectNumber,
  builderTab,
  agentName,
  agentDescription,
  defaultReasoningEngine = '',
  defaultAgentUrl = '',
  onSuccess,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const effectiveProjectId = projectId || projectNumber;

  const [regConfig, setRegConfig] = useState({
    location: 'global',
    collectionId: 'default_collection',
    engineId: '',
  });

  const [regDetails, setRegDetails] = useState({
    agentId: '',
    displayName: '',
    description: '',
    reasoningEngine: defaultReasoningEngine,
    agentUrl: defaultAgentUrl,
  });

  const [regAuthRows, setRegAuthRows] = useState<string[]>([]);
  const [regEngines, setRegEngines] = useState<any[]>([]);
  const [regAuthorizations, setRegAuthorizations] = useState<any[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [isLoadingAuths, setIsLoadingAuths] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isRegistering,
  });

  // Initialize or reset details when modal opens
  useEffect(() => {
    if (isOpen) {
      setRegDetails({
        agentId: agentName.trim(),
        displayName: agentName.trim(),
        description: agentDescription.trim(),
        reasoningEngine: defaultReasoningEngine,
        agentUrl: defaultAgentUrl,
      });
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, agentName, agentDescription, defaultReasoningEngine, defaultAgentUrl]);

  // Load engines
  useEffect(() => {
    if (!isOpen || !effectiveProjectId) return;

    let isMounted = true;
    const loadEngines = async () => {
      setIsLoadingEngines(true);
      try {
        const res = await api.listDiscoveryEngines({
          projectId: effectiveProjectId,
          appLocation: regConfig.location,
          collectionId: regConfig.collectionId,
        } as Config);
        if (isMounted) {
          setRegEngines(res.engines || []);
        }
      } catch (e) {
        console.warn('Could not load discovery engines for registration:', e);
      } finally {
        if (isMounted) setIsLoadingEngines(false);
      }
    };

    loadEngines();
    return () => {
      isMounted = false;
    };
  }, [isOpen, effectiveProjectId, regConfig.location, regConfig.collectionId]);

  // Load authorizations
  useEffect(() => {
    if (!isOpen || !effectiveProjectId) return;

    let isMounted = true;
    const loadAuths = async () => {
      setIsLoadingAuths(true);
      try {
        const res = await api.listAuthorizations({
          projectId: effectiveProjectId,
          appLocation: regConfig.location,
        } as Config);
        if (isMounted) {
          setRegAuthorizations(res.authorizations || []);
        }
      } catch (e) {
        console.warn('Could not load authorizations for registration:', e);
      } finally {
        if (isMounted) setIsLoadingAuths(false);
      }
    };

    loadAuths();
    return () => {
      isMounted = false;
    };
  }, [isOpen, effectiveProjectId, regConfig.location]);

  if (!isOpen) return null;

  const handleRegister = async () => {
    setIsRegistering(true);
    setError(null);
    setSuccess(null);

    try {
      if (!effectiveProjectId) throw new Error('Project ID is required.');
      if (!regConfig.engineId) throw new Error('Target Engine ID is required.');

      const displayName = regDetails.displayName.trim() || agentName.trim();
      const description = regDetails.description.trim() || agentDescription.trim();
      const agentId = regDetails.agentId.trim() || agentName.trim() || undefined;

      if (!displayName) throw new Error('Agent Display Name or Name is required.');

      const payload: any = {
        displayName,
        description,
      };

      if (builderTab === 'adk' && regDetails.reasoningEngine.trim()) {
        payload.adkAgentDefinition = {
          provisionedReasoningEngine: {
            reasoningEngine: regDetails.reasoningEngine.trim(),
          },
        };
      } else if (regDetails.agentUrl.trim()) {
        const url = regDetails.agentUrl.trim();
        const card = {
          protocolVersion: '0.3.0',
          url: url.endsWith('/invoke') ? url : `${url.replace(/\/$/, '')}/invoke`,
          name: displayName,
          description,
          version: '1.0.0',
        };
        payload.a2aAgentDefinition = {
          jsonAgentCard: JSON.stringify(card),
        };
      }

      const validAuths = regAuthRows.map((a) => a.trim()).filter(Boolean);
      if (validAuths.length > 0) {
        payload.authorizationConfig = {
          toolAuthorizations: validAuths,
        };
      }

      const cfg: Config = {
        projectId: effectiveProjectId,
        appLocation: regConfig.location,
        collectionId: regConfig.collectionId,
        appId: regConfig.engineId,
        assistantId: 'default_assistant',
      };

      const result = await api.createDiscoveryAgent(payload, cfg, agentId);
      const successMsg = `Successfully registered agent "${result?.displayName || displayName}" (ID: ${agentId || result?.name?.split('/').pop() || 'auto'}) in Gemini Enterprise!`;
      setSuccess(successMsg);
      if (onSuccess) {
        onSuccess(successMsg);
      }
    } catch (err: unknown) {
      setError(`Registration failed: ${toErrorMessage(err)}`);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-register-modal-title"
      onClick={() => {
        if (!isRegistering) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-850 border border-gray-700 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 id="agent-register-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
              <span>🔗 Register Agent in Gemini Enterprise</span>
              {isRegistering && (
                <span className="text-xs text-blue-400 font-normal animate-pulse">
                  Registering...
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Make your agent searchable and invocable in Gemini Enterprise Discovery Engine.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-gray-200 text-xl font-bold p-1 rounded-md hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg text-xs text-red-200 leading-relaxed">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-900/40 border border-emerald-700 rounded-lg text-xs text-emerald-200 leading-relaxed">
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Engine Location
              </label>
              <select
                aria-label="Engine Location"
                value={regConfig.location}
                onChange={(e) => setRegConfig((prev) => ({ ...prev, location: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="global">global</option>
                <option value="us">us</option>
                <option value="eu">eu</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Collection ID
              </label>
              <input
                type="text"
                value={regConfig.collectionId}
                onChange={(e) => setRegConfig((prev) => ({ ...prev, collectionId: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                placeholder="default_collection"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Target Engine ID{' '}
                {isLoadingEngines && (
                  <span className="text-blue-400 text-[10px] font-normal">(Loading...)</span>
                )}
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="Target Engine"
                  value={regConfig.engineId}
                  onChange={(e) => setRegConfig((prev) => ({ ...prev, engineId: e.target.value }))}
                  disabled={isLoadingEngines}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white disabled:opacity-50 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select Target Engine or Enter Manually --</option>
                  {regEngines.map((eng: any) => {
                    const id = eng.name?.split('/').pop() || eng.name;
                    return (
                      <option key={eng.name} value={id}>
                        {eng.displayName ? `${eng.displayName} (${id})` : id}
                      </option>
                    );
                  })}
                </select>
                <input
                  type="text"
                  value={regConfig.engineId}
                  onChange={(e) => setRegConfig((prev) => ({ ...prev, engineId: e.target.value }))}
                  placeholder="Or type Engine ID"
                  className="w-44 bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Agent ID (Alphanumeric identifier)
              </label>
              <input
                type="text"
                value={regDetails.agentId}
                onChange={(e) => setRegDetails((prev) => ({ ...prev, agentId: e.target.value }))}
                placeholder={agentName || 'my-agent-id'}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={regDetails.displayName}
                onChange={(e) => setRegDetails((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder={agentName || 'My Agent'}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={regDetails.description}
                onChange={(e) => setRegDetails((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={agentDescription || 'Describe the agent capabilities for discovery'}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {builderTab === 'adk' ? (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Agent Engine / Reasoning Engine Resource Name
                </label>
                <input
                  type="text"
                  value={regDetails.reasoningEngine}
                  onChange={(e) => setRegDetails((prev) => ({ ...prev, reasoningEngine: e.target.value }))}
                  placeholder="projects/{project}/locations/{location}/reasoningEngines/{id}"
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Obtained after deploying to Vertex AI Agent Engine.
                </p>
              </div>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Deployed Cloud Run Service URL
                </label>
                <input
                  type="url"
                  value={regDetails.agentUrl}
                  onChange={(e) => setRegDetails((prev) => ({ ...prev, agentUrl: e.target.value }))}
                  placeholder="https://my-service.run.app"
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Tool Authorizations */}
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-gray-300">
                  Tool Authorizations (Optional){' '}
                  {isLoadingAuths && (
                    <span className="text-blue-400 text-[10px] font-normal">(Loading...)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setRegAuthRows((prev) => [...prev, ''])}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  + Add Authorization
                </button>
              </div>
              {regAuthRows.length === 0 ? (
                <p className="text-[11px] text-gray-500 italic">No tool authorizations attached.</p>
              ) : (
                regAuthRows.map((authVal, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-2">
                    <select
                      value={authVal}
                      onChange={(e) => {
                        const next = [...regAuthRows];
                        next[idx] = e.target.value;
                        setRegAuthRows(next);
                      }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Select Authorization --</option>
                      {regAuthorizations.map((a: any) => {
                        const name = a.name || '';
                        const label = a.displayName
                          ? `${a.displayName} (${name.split('/').pop()})`
                          : name;
                        return (
                          <option key={name} value={name}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={() => setRegAuthRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-400 px-2.5 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
                      title="Remove authorization"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-3 border-t border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRegister}
            disabled={
              isRegistering ||
              !regConfig.engineId ||
              (!regDetails.displayName && !agentName)
            }
            className={`px-5 py-2 text-xs font-bold rounded-md shadow flex items-center gap-2 transition-all ${
              isRegistering ||
              !regConfig.engineId ||
              (!regDetails.displayName && !agentName)
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
            }`}
          >
            {isRegistering ? 'Registering...' : 'Register in Gemini Enterprise'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentRegisterModal;
