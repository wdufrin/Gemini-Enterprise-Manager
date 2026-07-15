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

import React, { useState } from "react";
import * as api from "../../services/apiService";
import { Config } from "../../types";
import Spinner from "../Spinner";

interface RetractLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  billingAccountId: string;
  billingAccountLicenseConfigId: string;
  licenseConfigName: string; // Full resource name: projects/.../licenseConfigs/...
  allocatedCount: number; // Current allocated count to show as hint
  currentProjectNumber: string;
  onSuccess: () => void;
}

const RetractLicenseModal: React.FC<RetractLicenseModalProps> = ({
  isOpen,
  onClose,
  billingAccountId,
  billingAccountLicenseConfigId,
  licenseConfigName,
  allocatedCount,
  currentProjectNumber,
  onSuccess,
}) => {
  const [count, setCount] = useState<number | "">(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingUsage, setIsFetchingUsage] = useState(false);
  const [usageStats, setUsageStats] = useState<{
    used: number;
    available: number;
  } | null>(null);
  const [userLicenses, setUserLicenses] = useState<any[]>([]);
  const [revokingPrincipal, setRevokingPrincipal] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Parse location from resource name for display
  const location = licenseConfigName.includes("/locations/")
    ? licenseConfigName.split("/locations/")[1].split("/")[0]
    : "unknown";

  // Parse project from resource name
  const project = licenseConfigName.includes("projects/")
    ? licenseConfigName.split("projects/")[1].split("/")[0]
    : "unknown";

  // Fetch usage stats on mount
  React.useEffect(() => {
    if (isOpen && project !== "unknown") {
      fetchUsage();
    }
  }, [isOpen, project, location]);

  const fetchUsage = async () => {
    setIsFetchingUsage(true);
    try {
      // We use the TARGET project for the list request
      const config: Config = {
        projectId: project,
        appLocation: location,
        collectionId: "",
        appId: "",
        assistantId: "",
      } as any;

      const res = await api.listUserLicenses(config);
      const licenses = res.userLicenses || [];
      setUserLicenses(licenses);

      const used = licenses.length;
      const available = Math.max(0, allocatedCount - used);

      setUsageStats({ used, available });
      // Reset count if it exceeds available
      if (count !== "" && count > available) setCount(Math.max(1, available));
    } catch (e) {
      console.warn("Failed to fetch user licenses for retraction stats", e);
      setUserLicenses([]);
    } finally {
      setIsFetchingUsage(false);
    }
  };

  const handleRevokeUser = async (principal: string) => {
    setRevokingPrincipal(principal);
    setError(null);
    try {
      const config: Config = {
        projectId: project,
        appLocation: location,
        collectionId: "",
        appId: "",
        assistantId: "",
      } as any;

      await api.revokeUserLicenses(config, "default_user_store", [principal]);
      // Re-fetch usage to update stats and list
      await fetchUsage();
    } catch (err: any) {
      setError(err.message || "Failed to revoke user license");
    } finally {
      setRevokingPrincipal(null);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const config: Config = {
        projectId: currentProjectNumber, // Used for auth context
        appLocation: location,
        collectionId: "",
        appId: "",
        assistantId: "",
      } as any;

      await api.retractLicense(
        billingAccountId,
        billingAccountLicenseConfigId,
        {
          licenseConfig: licenseConfigName,
          licenseCount: typeof count === "number" ? count : 1,
        },
        config,
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to retract licenses");
    } finally {
      setIsLoading(false);
    }
  };

  const maxRetractable = usageStats ? usageStats.available : allocatedCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg border border-gray-700">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Retract Licenses</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded text-sm">
              {error}
            </div>
          )}

          <div className="text-sm text-gray-300">
            <p className="mb-2">Retracting licenses from:</p>
            <ul className="list-disc list-inside text-gray-400 ml-2">
              <li>
                Project: <span className="font-mono text-white">{project}</span>
              </li>
              <li>
                Location:{" "}
                <span className="font-mono text-white">{location}</span>
              </li>
              <li>
                Total Allocated:{" "}
                <span className="font-mono text-white">{allocatedCount}</span>
              </li>
              {isFetchingUsage ? (
                <li>
                  <span className="italic text-gray-500">
                    Checking usage...
                  </span>
                </li>
              ) : (
                usageStats && (
                  <>
                    <li>
                      Current Usage:{" "}
                      <span className="font-mono text-yellow-400">
                        {usageStats.used}
                      </span>
                    </li>
                    <li>
                      Available to Retract:{" "}
                      <span className="font-mono text-green-400">
                        {usageStats.available}
                      </span>
                    </li>
                  </>
                )
              )}
            </ul>
          </div>

          {userLicenses.length > 0 && (
            <div className="mt-4 border-t border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-200 mb-2">
                Assigned Users ({userLicenses.length})
              </h4>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1 border border-gray-700 rounded-md p-2 bg-gray-900/50">
                {userLicenses.map((lic) => {
                  const principal = lic.userPrincipal || "Unknown";
                  const isRevoking = revokingPrincipal === principal;
                  return (
                    <div
                      key={principal}
                      className="flex justify-between items-center text-xs p-1.5 hover:bg-gray-800 rounded"
                    >
                      <span
                        className="text-gray-300 truncate mr-2"
                        title={principal}
                      >
                        {principal}
                      </span>
                      <button
                        type="button"
                        disabled={isRevoking || isLoading}
                        onClick={() => handleRevokeUser(principal)}
                        className="text-red-400 hover:text-red-300 underline font-semibold disabled:text-gray-500 flex items-center shrink-0"
                      >
                        {isRevoking ? (
                          <Spinner className="w-3 h-3 mr-1" />
                        ) : null}
                        Revoke
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Quantity to Retract
            </label>
            <input
              type="number"
              required
              min="1"
              max={maxRetractable}
              value={count}
              onChange={(e) => {
                const val = e.target.value;
                setCount(
                  val === ""
                    ? ""
                    : Math.max(
                        1,
                        Math.min(maxRetractable, parseInt(val, 10) || 1),
                      ),
                );
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-yellow-500 mt-2 font-semibold">
              Note: Only one reclaim per day is allowed for licenses.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Number of unused licenses to return to the billing account.
            </p>
            {maxRetractable === 0 && !isFetchingUsage && (
              <p className="text-xs text-red-400 mt-1">
                No unused licenses available to retract.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || maxRetractable === 0}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isLoading ? <Spinner className="w-4 h-4 mr-2" /> : null}
              Retract
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RetractLicenseModal;
