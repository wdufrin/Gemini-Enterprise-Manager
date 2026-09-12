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

import React, { useState, useEffect, useMemo } from 'react';
import { Config, ConfigAuditItem, ConfigAuditSummary } from '../types';
import { runConfigAudit, generateAuditMarkdown } from '../services/configAuditService';
import * as api from '../services/apiService';

interface ConfigAuditPageProps {
  projectNumber: string;
  projectId?: string;
  accessToken: string;
}

const ALL_LOCATIONS = ['global', 'us', 'eu'];

const ConfigAuditPage: React.FC<ConfigAuditPageProps> = ({
  projectNumber,
  projectId,
  accessToken,
}) => {
  // Source Environment State
  const [sourceProject, setSourceProject] = useState<string>(() => projectNumber || projectId || '');
  const [sourceLocation, setSourceLocation] = useState<string>('global');
  const [sourceEngine, setSourceEngine] = useState<string>('default_engine');
  const [sourceApps, setSourceApps] = useState<any[]>([]);
  const [isLoadingSourceApps, setIsLoadingSourceApps] = useState<boolean>(false);
  const [isCustomSourceEngine, setIsCustomSourceEngine] = useState<boolean>(false);

  // Destination Environment State
  const [targetProject, setTargetProject] = useState<string>('');
  const [targetLocation, setTargetLocation] = useState<string>('global');
  const [targetEngine, setTargetEngine] = useState<string>('default_engine');
  const [targetApps, setTargetApps] = useState<any[]>([]);
  const [isLoadingTargetApps, setIsLoadingTargetApps] = useState<boolean>(false);
  const [isCustomTargetEngine, setIsCustomTargetEngine] = useState<boolean>(false);

  // Keep source project in sync if props update
  useEffect(() => {
    if ((projectNumber || projectId) && !sourceProject) {
      setSourceProject(projectNumber || projectId || '');
    }
  }, [projectNumber, projectId]);

  // Fetch Source Apps / Engines
  useEffect(() => {
    const proj = sourceProject.trim();
    if (!proj) {
      setSourceApps([]);
      return;
    }
    let isMounted = true;
    const fetchSourceApps = async () => {
      setIsLoadingSourceApps(true);
      try {
        const res = await api.listResources('engines', {
          projectId: proj,
          appLocation: sourceLocation,
          collectionId: 'default_collection',
          appId: '',
          assistantId: '',
        }, undefined, 100, true);
        if (isMounted) {
          const engines = res?.engines || [];
          setSourceApps(engines);
          if (engines.length > 0) {
            const hasCurrent = engines.some((e: any) => e.name.split('/').pop() === sourceEngine);
            if (!hasCurrent) {
              const defaultEng = engines.find((e: any) => e.name.split('/').pop() === 'default_engine');
              const chosen = defaultEng ? 'default_engine' : (engines[0].name.split('/').pop() || '');
              if (chosen) setSourceEngine(chosen);
            }
          }
        }
      } catch (e) {
        if (isMounted) {
          console.warn('Could not list engines for source project:', e);
          setSourceApps([]);
        }
      } finally {
        if (isMounted) setIsLoadingSourceApps(false);
      }
    };
    fetchSourceApps();
    return () => { isMounted = false; };
  }, [sourceProject, sourceLocation]);

  // Fetch Destination Apps / Engines
  useEffect(() => {
    const proj = targetProject.trim();
    if (!proj) {
      setTargetApps([]);
      return;
    }
    let isMounted = true;
    const fetchTargetApps = async () => {
      setIsLoadingTargetApps(true);
      try {
        const res = await api.listResources('engines', {
          projectId: proj,
          appLocation: targetLocation,
          collectionId: 'default_collection',
          appId: '',
          assistantId: '',
        }, undefined, 100, true);
        if (isMounted) {
          const engines = res?.engines || [];
          setTargetApps(engines);
          if (engines.length > 0) {
            const hasCurrent = engines.some((e: any) => e.name.split('/').pop() === targetEngine);
            if (!hasCurrent) {
              const defaultEng = engines.find((e: any) => e.name.split('/').pop() === 'default_engine');
              const chosen = defaultEng ? 'default_engine' : (engines[0].name.split('/').pop() || '');
              if (chosen) setTargetEngine(chosen);
            }
          }
        }
      } catch (e) {
        if (isMounted) {
          console.warn('Could not list engines for target project:', e);
          setTargetApps([]);
        }
      } finally {
        if (isMounted) setIsLoadingTargetApps(false);
      }
    };
    fetchTargetApps();
    return () => { isMounted = false; };
  }, [targetProject, targetLocation]);

  // Audit Execution State
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditProgress, setAuditProgress] = useState<{ step: string; percent: number }>({ step: '', percent: 0 });
  const [auditSummary, setAuditSummary] = useState<ConfigAuditSummary | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'DIFFS_ONLY' | 'MATCHES_ONLY'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleRunAudit = async () => {
    if (!sourceProject.trim() || !targetProject.trim()) {
      setAuditError('Please specify both Source Project and Destination Project.');
      return;
    }

    setAuditError(null);
    setIsAuditing(true);
    setAuditProgress({ step: 'Initializing environment connection...', percent: 5 });

    const sourceConfig: Config = {
      projectId: sourceProject.trim(),
      appLocation: sourceLocation,
      collectionId: 'default_collection',
      appId: sourceEngine.trim() || 'default_engine',
      assistantId: 'default_assistant'
    };

    const targetConfig: Config = {
      projectId: targetProject.trim(),
      appLocation: targetLocation,
      collectionId: 'default_collection',
      appId: targetEngine.trim() || 'default_engine',
      assistantId: 'default_assistant'
    };

    try {
      const summary = await runConfigAudit(sourceConfig, targetConfig, (step, percent) => {
        setAuditProgress({ step, percent });
      });
      setAuditSummary(summary);
    } catch (err: any) {
      setAuditError(err.message || 'Failed to complete configuration audit.');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!auditSummary) return;
    const md = generateAuditMarkdown(auditSummary);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ge-config-audit-${auditSummary.sourceProject}-to-${auditSummary.targetProject}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadJson = () => {
    if (!auditSummary) return;
    const jsonStr = JSON.stringify(auditSummary, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ge-config-audit-${auditSummary.sourceProject}-to-${auditSummary.targetProject}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    if (!auditSummary) return [];
    return auditSummary.items.filter((item: ConfigAuditItem) => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatusFilter === 'DIFFS_ONLY' && item.status === 'MATCH') {
        return false;
      }
      if (selectedStatusFilter === 'MATCHES_ONLY' && item.status !== 'MATCH') {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchCategory = item.category.toLowerCase().includes(q);
        const matchSrc = String(item.sourceValue || '').toLowerCase().includes(q);
        const matchTgt = String(item.targetValue || '').toLowerCase().includes(q);
        const matchDetails = (item.details || '').toLowerCase().includes(q);
        return matchName || matchCategory || matchSrc || matchTgt || matchDetails;
      }

      return true;
    });
  }, [auditSummary, selectedCategory, selectedStatusFilter, searchQuery]);

  const categories = useMemo(() => {
    if (!auditSummary) return [];
    const set = new Set<string>();
    auditSummary.items.forEach(i => set.add(i.category));
    return Array.from(set);
  }, [auditSummary]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-900 text-gray-100 min-h-screen">
      {/* Header Banner */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">App Configuration Audit</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-900/80 text-blue-300 border border-blue-700/50">
              Read-Only Parity Check
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/80 text-emerald-300 border border-emerald-700/50">
              Zero Mutations
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Validate that Discovery Engine configurations, Grounding DataStores, Custom Tools, and IdP modes are properly aligned between Source and Destination environments before cutover.
          </p>
        </div>

        {auditSummary && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadMarkdown}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-1.5 transition-colors shadow-sm"
              title="Download Executive Markdown Report"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Report (.md)
            </button>
            <button
              onClick={handleDownloadJson}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-1.5 transition-colors shadow-sm"
              title="Download JSON Summary"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export JSON
            </button>
          </div>
        )}
      </div>

      {/* Dual Environment Input Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Source Environment Panel */}
        <div className="bg-gray-800/90 rounded-xl p-5 border border-gray-700/80 shadow-lg">
          <div className="flex items-center justify-between mb-4 border-b border-gray-700/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <h2 className="text-base font-semibold text-white">Source Environment (Current)</h2>
            </div>
            <span className="text-xs text-gray-400">Baseline Config</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Source Project ID or Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={sourceProject}
                onChange={(e) => setSourceProject(e.target.value)}
                placeholder="e.g. my-source-project or 123456789"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Region Location</label>
                <select
                  value={sourceLocation}
                  onChange={(e) => setSourceLocation(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ALL_LOCATIONS.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-300">
                    Gemini Enterprise App ID
                  </label>
                  {sourceApps.length > 0 && !isCustomSourceEngine && (
                    <button
                      type="button"
                      onClick={() => setIsCustomSourceEngine(true)}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline focus:outline-none"
                    >
                      Enter manually
                    </button>
                  )}
                  {isCustomSourceEngine && sourceApps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCustomSourceEngine(false)}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline focus:outline-none"
                    >
                      Select from list
                    </button>
                  )}
                </div>

                {isLoadingSourceApps ? (
                  <select
                    disabled
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400"
                  >
                    <option>Loading Gemini Enterprise Apps...</option>
                  </select>
                ) : sourceApps.length > 0 && !isCustomSourceEngine ? (
                  <select
                    value={sourceEngine}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomSourceEngine(true);
                      } else {
                        setSourceEngine(e.target.value);
                      }
                    }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select Gemini Enterprise App --</option>
                    {sourceApps.map((a: any) => {
                      const id = a.name.split('/').pop() || '';
                      return (
                        <option key={a.name} value={id}>
                          {a.displayName ? `${a.displayName} (${id})` : id}
                        </option>
                      );
                    })}
                    <option value="__custom__">+ Enter Custom App ID...</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={sourceEngine}
                    onChange={(e) => setSourceEngine(e.target.value)}
                    placeholder="default_engine"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Destination Environment Panel */}
        <div className="bg-gray-800/90 rounded-xl p-5 border border-gray-700/80 shadow-lg">
          <div className="flex items-center justify-between mb-4 border-b border-gray-700/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h2 className="text-base font-semibold text-white">Destination Environment (Target)</h2>
            </div>
            <span className="text-xs text-gray-400">Target Config</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Destination Project ID or Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={targetProject}
                onChange={(e) => setTargetProject(e.target.value)}
                placeholder="e.g. my-target-project or 987654321"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Region Location</label>
                <select
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ALL_LOCATIONS.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-300">
                    Gemini Enterprise App ID
                  </label>
                  {targetApps.length > 0 && !isCustomTargetEngine && (
                    <button
                      type="button"
                      onClick={() => setIsCustomTargetEngine(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 underline focus:outline-none"
                    >
                      Enter manually
                    </button>
                  )}
                  {isCustomTargetEngine && targetApps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCustomTargetEngine(false)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 underline focus:outline-none"
                    >
                      Select from list
                    </button>
                  )}
                </div>

                {isLoadingTargetApps ? (
                  <select
                    disabled
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400"
                  >
                    <option>Loading Gemini Enterprise Apps...</option>
                  </select>
                ) : targetApps.length > 0 && !isCustomTargetEngine ? (
                  <select
                    value={targetEngine}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomTargetEngine(true);
                      } else {
                        setTargetEngine(e.target.value);
                      }
                    }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Gemini Enterprise App --</option>
                    {targetApps.map((a: any) => {
                      const id = a.name.split('/').pop() || '';
                      return (
                        <option key={a.name} value={id}>
                          {a.displayName ? `${a.displayName} (${id})` : id}
                        </option>
                      );
                    })}
                    <option value="__custom__">+ Enter Custom App ID...</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={targetEngine}
                    onChange={(e) => setTargetEngine(e.target.value)}
                    placeholder="default_engine"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 bg-gray-800/60 p-4 rounded-xl border border-gray-800">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            The audit executes read-only queries against both environments to evaluate Engine configuration, DataStores, Skills Registry, and Identity Provider parity.
          </span>
        </div>

        <button
          onClick={handleRunAudit}
          disabled={isAuditing || !sourceProject.trim() || !targetProject.trim()}
          className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg shadow-md transition-all flex items-center justify-center gap-2"
        >
          {isAuditing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Auditing ({auditProgress.percent}%)...</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Run Parity Audit</span>
            </>
          )}
        </button>
      </div>

      {/* Error Banner */}
      {auditError && (
        <div className="mb-6 p-4 bg-red-900/40 border border-red-700/60 rounded-xl text-red-200 text-sm flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div>
            <div className="font-semibold text-red-300">Audit Failed</div>
            <div className="text-xs text-red-200 mt-0.5">{auditError}</div>
          </div>
        </div>
      )}

      {/* Progress Bar when Auditing */}
      {isAuditing && (
        <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-700 shadow-md">
          <div className="flex items-center justify-between text-xs text-gray-300 mb-2">
            <span className="font-medium">{auditProgress.step}</span>
            <span className="font-semibold text-blue-400">{auditProgress.percent}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${auditProgress.percent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Audit Results Section */}
      {auditSummary && (
        <div className="space-y-6">
          {/* Executive Summary Metrics Card */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-lg">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              {/* Readiness Score */}
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl border-4 ${
                  auditSummary.overallScore >= 90
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30'
                    : auditSummary.overallScore >= 70
                    ? 'border-amber-500 text-amber-400 bg-amber-950/30'
                    : 'border-red-500 text-red-400 bg-red-950/30'
                }`}>
                  {auditSummary.overallScore}%
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Parity Readiness</div>
                  <div className="text-lg font-bold text-white">
                    {auditSummary.overallScore >= 90
                      ? 'Ready for Cutover'
                      : auditSummary.overallScore >= 70
                      ? 'Minor Remediations Recommended'
                      : 'Blockers Detected in Target'}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {auditSummary.totalChecks} configurations audited across 5 dimensions
                  </div>
                </div>
              </div>

              {/* Counters */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="flex-1 md:flex-initial px-4 py-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-center">
                  <div className="text-xs text-emerald-400 font-medium">Matched</div>
                  <div className="text-xl font-bold text-emerald-300">{auditSummary.matchedCount}</div>
                </div>

                <div className="flex-1 md:flex-initial px-4 py-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-center">
                  <div className="text-xs text-amber-400 font-medium">Configuration Drift</div>
                  <div className="text-xl font-bold text-amber-300">{auditSummary.driftCount}</div>
                </div>

                <div className="flex-1 md:flex-initial px-4 py-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-center">
                  <div className="text-xs text-red-400 font-medium">Missing in Target</div>
                  <div className="text-xl font-bold text-red-300">{auditSummary.missingCount}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedCategory === 'ALL'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                All ({auditSummary.items.length})
              </button>
              {categories.map(cat => {
                const count = auditSummary.items.filter(i => i.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            {/* Status Segmented Control & Search */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="DIFFS_ONLY">Differences Only (⚠️ / ❌)</option>
                <option value="MATCHES_ONLY">Matches Only (✅)</option>
              </select>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search audit items..."
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-48"
              />
            </div>
          </div>

          {/* Comparison Grid Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-850 text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-700">
                  <tr>
                    <th className="py-3 px-4">Pillar</th>
                    <th className="py-3 px-4">Asset / Component</th>
                    <th className="py-3 px-4">Source Setting</th>
                    <th className="py-3 px-4">Destination Setting</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Guidance / Remediation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60 text-gray-300">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No audit items match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isExpanded = expandedItemId === item.id;
                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            className="hover:bg-gray-750 transition-colors cursor-pointer group"
                          >
                            <td className="py-3 px-4 font-semibold text-gray-300 whitespace-nowrap">
                              {item.category}
                            </td>
                            <td className="py-3 px-4 font-medium text-white flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {item.remediation && (
                                <span className="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  (click for details)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-gray-400 max-w-[180px] truncate" title={String(item.sourceValue)}>
                              {String(item.sourceValue ?? 'N/A')}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-gray-400 max-w-[180px] truncate" title={String(item.targetValue)}>
                              {String(item.targetValue ?? 'N/A')}
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {item.status === 'MATCH' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  MATCH
                                </span>
                              )}
                              {item.status === 'DRIFT' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                                  DRIFT
                                </span>
                              )}
                              {item.status === 'MISSING_IN_TARGET' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-950 text-red-300 border border-red-800 animate-pulse">
                                  MISSING IN TARGET
                                </span>
                              )}
                              {item.status === 'INFO' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-700 text-gray-300">
                                  INFO
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-gray-400 max-w-xs truncate" title={item.remediation || item.details}>
                              {item.remediation ? (
                                <span className="text-amber-300/90 font-medium">{item.remediation}</span>
                              ) : (
                                <span>{item.details || 'OK'}</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Detail Accordion */}
                          {isExpanded && (
                            <tr className="bg-gray-850/90 text-xs">
                              <td colSpan={6} className="p-4 border-l-2 border-blue-500">
                                <div className="space-y-2">
                                  <div>
                                    <span className="font-semibold text-gray-300">Diagnostic Details: </span>
                                    <span className="text-gray-400">{item.details || 'No additional details.'}</span>
                                  </div>
                                  {item.remediation && (
                                    <div className="p-2.5 bg-gray-900 rounded-lg border border-gray-700/80">
                                      <span className="font-semibold text-amber-400">Recommended Cutover Remediation: </span>
                                      <div className="text-gray-200 mt-1 font-mono text-[11px]">{item.remediation}</div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State / Prompt to Run */}
      {!auditSummary && !isAuditing && (
        <div className="bg-gray-800/50 border border-gray-800 rounded-xl p-12 text-center max-w-2xl mx-auto my-8">
          <div className="w-12 h-12 rounded-full bg-blue-900/40 text-blue-400 flex items-center justify-center mx-auto mb-4 border border-blue-700/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-white mb-2">No Audit Performed Yet</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto mb-6">
            Enter your Source Project and Destination Project credentials above, then click <strong>Run Parity Audit</strong> to perform a non-destructive comparison of your Gemini Enterprise environments.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
            <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
              <div className="font-semibold text-gray-200">1. Engine & IdP</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Solution type & Workforce CID</div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
              <div className="font-semibold text-gray-200">2. DataStores</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Grounding store alignment</div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
              <div className="font-semibold text-gray-200">3. Custom Skills</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Agent Registry tools parity</div>
            </div>
            <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
              <div className="font-semibold text-gray-200">4. Quotas & Auth</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Seats & OAuth authorizations</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigAuditPage;
