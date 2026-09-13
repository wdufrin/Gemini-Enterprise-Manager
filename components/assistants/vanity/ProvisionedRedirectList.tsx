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

import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../../services/apiService';
import { ManagedSslCertificate, AppEngine } from '../../../types';
import DestructiveConfirmModal from '../../DestructiveConfirmModal';
import { toErrorMessage } from '../../../utils/errors';

export interface ProvisionedRedirect {
  serviceName: string;
  ipAddress: string;
  domains: string[];
  certStatus: string;
  creationTimestamp: string;
  fwdRuleName: string;
  routingMode: 'public' | 'private';
  /** True when the redirect's service name maps to the assistant on screen. */
  belongsToThisAssistant: boolean;
}

export interface ProvisionedRedirectListProps {
  engine: AppEngine;
  projectId: string;
  onBuildTriggered?: (buildId: string, projectId: string) => void;
  /** Bumping this value forces a refresh (e.g. after a deploy is triggered). */
  refreshToken?: number;
}

/**
 * Normalises an engine name or a deployed service name down to a comparable
 * id. `useVanityUrlDeployment` derives the default service name as
 * `assistant-<engineId>` truncated to 40 chars, so the comparison has to
 * tolerate that truncation.
 */
const normalizeId = (value: string): string =>
  value.replace(/[^a-z0-9-]/gi, '').toLowerCase();

export const matchesEngine = (serviceName: string, engineName: string): boolean => {
  const engineId = normalizeId(engineName.split('/').pop() || '');
  if (!engineId) return false;
  const base = normalizeId(serviceName);
  const expected = `assistant-${engineId}`.substring(0, 40);
  return base === expected || base === engineId || base.endsWith(`-${engineId}`);
};

/**
 * Lists the load balancers, certificates and PSC endpoints that a redirect URL
 * deployment created, and provides the teardown action for them.
 *
 * This lives next to the deployment form deliberately: provisioning without a
 * reachable teardown leaves customers paying for forwarding rules and
 * certificates they cannot remove from the console.
 *
 * Redirects that do not belong to this assistant are still listed (greyed out)
 * rather than filtered away -- a deployment made under a custom service name
 * would otherwise be invisible and therefore permanently orphaned.
 */
export const ProvisionedRedirectList: React.FC<ProvisionedRedirectListProps> = ({
  engine,
  projectId,
  onBuildTriggered,
  refreshToken = 0,
}) => {
  const [redirects, setRedirects] = useState<ProvisionedRedirect[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectToDelete, setRedirectToDelete] = useState<ProvisionedRedirect | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [dismantling, setDismantling] = useState<Set<string>>(new Set());
  const [showOtherAssistants, setShowOtherAssistants] = useState(false);

  const fetchRedirects = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [aggRes, certRes, dnsRes] = await Promise.all([
        api.listAggregatedForwardingRules(projectId),
        api.listManagedSslCertificates(projectId),
        api.listDnsZones(projectId),
      ]);

      const scopes = aggRes.items || {};
      const rules: Array<{ name: string; IPAddress: string; creationTimestamp: string }> = [];
      Object.keys(scopes).forEach((key) => {
        const scopeData = scopes[key];
        if (scopeData?.forwardingRules) {
          rules.push(...scopeData.forwardingRules);
        }
      });

      const certs: ManagedSslCertificate[] = certRes.items || [];
      const zones = dnsRes.managedZones || [];

      const combined: ProvisionedRedirect[] = rules
        .filter((r) => r.name.endsWith('-fwd-rule') || r.name.endsWith('-internal-fwd-rule'))
        .map((rule) => {
          const isPrivate = rule.name.endsWith('-internal-fwd-rule');
          const serviceName = isPrivate
            ? rule.name.replace('-internal-fwd-rule', '')
            : rule.name.replace('-fwd-rule', '');

          let domains: string[] = [];
          let certStatus = 'UNKNOWN';

          if (isPrivate) {
            certStatus = 'N/A (Private)';
            const zone = zones.find(
              (z: { name?: string; dnsName?: string }) =>
                z.name === `${serviceName}-custom-dns`
            );
            if (zone?.dnsName) {
              domains = [zone.dnsName.replace(/\.$/, '')];
            }
          } else {
            const cert = certs.find((c) => c.name === `${serviceName}-cert`);
            domains = cert?.managed?.domains || [];
            certStatus = cert?.managed?.status || 'UNKNOWN';
          }

          return {
            serviceName,
            ipAddress: rule.IPAddress,
            domains,
            certStatus,
            creationTimestamp: rule.creationTimestamp,
            fwdRuleName: rule.name,
            routingMode: isPrivate ? ('private' as const) : ('public' as const),
            belongsToThisAssistant: matchesEngine(serviceName, engine.name),
          };
        })
        .sort((a, b) => {
          if (a.belongsToThisAssistant !== b.belongsToThisAssistant) {
            return a.belongsToThisAssistant ? -1 : 1;
          }
          return (
            new Date(b.creationTimestamp).getTime() -
            new Date(a.creationTimestamp).getTime()
          );
        });

      setRedirects(combined);
    } catch (err: unknown) {
      // Surfaced rather than swallowed: an empty list and a failed lookup mean
      // very different things when the question is "am I still being billed
      // for a load balancer?"
      setError(
        toErrorMessage(err, 'Failed to list provisioned redirect URLs for this project.')
      );
      setRedirects([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, engine.name]);

  useEffect(() => {
    fetchRedirects();
  }, [fetchRedirects, refreshToken]);

  const handleConfirmDelete = async () => {
    if (!redirectToDelete) return;
    const { serviceName } = redirectToDelete;
    setIsDeleting(serviceName);
    setError(null);
    try {
      const buildId = await api.deleteVanityUrl(projectId, serviceName);
      if (onBuildTriggered) {
        onBuildTriggered(buildId, projectId);
      }
      // The row stays visible as "Dismantling..." until the teardown build
      // finishes; removing it optimistically would imply the infrastructure is
      // already gone when the build may still fail.
      setDismantling((prev) => new Set(prev).add(serviceName));
      setRedirectToDelete(null);
    } catch (e: unknown) {
      setError(toErrorMessage(e, `Failed to initiate teardown for ${serviceName}`));
    } finally {
      setIsDeleting(null);
    }
  };

  const mine = redirects.filter((r) => r.belongsToThisAssistant);
  const others = redirects.filter((r) => !r.belongsToThisAssistant);
  const visible = showOtherAssistants ? [...mine, ...others] : mine;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-start justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-md font-semibold text-white">Provisioned Redirect URLs</h3>
          <p className="text-xs text-gray-400 mt-1">
            Load balancers, certificates and PSC endpoints created by the form below.
            Tearing one down deletes the billed Google Cloud resources.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRedirects}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="m-4 p-3 rounded-md bg-red-900/30 border border-red-800 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <caption className="sr-only">
            Redirect URL infrastructure provisioned in project {projectId}
          </caption>
          <thead className="bg-gray-900/50">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Service</th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Mode</th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Domain(s)</th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">IP</th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th scope="col" className="relative px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700 text-sm">
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500 italic">
                  {mine.length === 0 && others.length > 0
                    ? 'No redirect URLs provisioned for this assistant.'
                    : 'No redirect URLs provisioned in this project.'}
                </td>
              </tr>
            )}
            {visible.map((redirect) => (
              <tr
                key={redirect.fwdRuleName}
                className={`hover:bg-gray-700/30 transition-colors ${
                  redirect.belongsToThisAssistant ? '' : 'opacity-60'
                }`}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="font-medium text-white">{redirect.serviceName}</div>
                  {!redirect.belongsToThisAssistant && (
                    <div className="text-xs text-amber-400 mt-0.5">Other assistant</div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 inline-flex text-xs font-bold rounded-md border ${
                      redirect.routingMode === 'private'
                        ? 'bg-purple-900/40 text-purple-300 border-purple-800'
                        : 'bg-indigo-900/40 text-indigo-300 border-indigo-800'
                    }`}
                  >
                    {redirect.routingMode === 'private' ? 'Private (PSC)' : 'Public (GLB)'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {redirect.domains.length > 0 ? (
                    redirect.domains.map((domain) => (
                      <div key={domain} className="text-blue-400">{domain}</div>
                    ))
                  ) : (
                    <span className="text-gray-500 italic">None</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-300 font-mono select-all">
                  {redirect.ipAddress}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {dismantling.has(redirect.serviceName) ? (
                    <span className="px-2 py-0.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md border bg-amber-900/40 text-amber-300 border-amber-800">
                      <span className="animate-spin rounded-full h-2.5 w-2.5 border border-amber-300/30 border-t-amber-300" />
                      Dismantling...
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">{redirect.certStatus}</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => setRedirectToDelete(redirect)}
                    disabled={
                      isDeleting === redirect.serviceName ||
                      dismantling.has(redirect.serviceName)
                    }
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-800 bg-red-900/30 text-red-300 hover:bg-red-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isDeleting === redirect.serviceName ? 'Starting...' : 'Tear down'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {others.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-700">
          <button
            type="button"
            onClick={() => setShowOtherAssistants((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-200 underline"
          >
            {showOtherAssistants
              ? `Hide ${others.length} redirect URL(s) from other assistants`
              : `Show ${others.length} redirect URL(s) from other assistants in this project`}
          </button>
        </div>
      )}

      <DestructiveConfirmModal
        isOpen={!!redirectToDelete}
        onClose={() => setRedirectToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Dismantle Redirect URL Infrastructure"
        resourceType="Redirect URL"
        resources={
          redirectToDelete
            ? [
                {
                  name: redirectToDelete.serviceName,
                  details:
                    redirectToDelete.domains.length > 0
                      ? redirectToDelete.domains.join(', ')
                      : redirectToDelete.ipAddress,
                },
              ]
            : []
        }
        confirmKeyword={redirectToDelete ? redirectToDelete.serviceName : 'DELETE'}
        confirmButtonText="Dismantle Infrastructure"
        isLoading={!!isDeleting}
        description="This initiates a Cloud Build teardown pipeline to permanently remove all networking and load balancing infrastructure."
        consequences={[
          'Global or Regional Forwarding Rules, Target Proxies, and URL Maps will be deleted.',
          'Google-managed SSL certificates for associated domains will be decommissioned.',
          'Incoming traffic on these domains will immediately fail with connection refused or DNS errors.',
          'Private Service Connect endpoints and managed DNS zones (if configured) will be dismantled.',
        ]}
      />
    </div>
  );
};

export default ProvisionedRedirectList;
