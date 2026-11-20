import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as api from '../services/apiService';
import { Agent, Config, IamPolicy, IamBinding, AppEngine, Assistant, Page } from '../types';
import PageShell from '../components/layout/PageShell';
import PageHeader from '../components/layout/PageHeader';
import PartialResultsBanner, { PartialFailure } from '../components/common/PartialResultsBanner';
import { toErrorMessage } from '../utils/errors';
import { useModalA11y } from '../hooks/useModalA11y';

interface AgentPermissionsPageProps {
    projectNumber?: string;
    projectId?: string;
    setProjectNumber?: (projectNumber: string) => void;
    config?: Config;
}

interface PermissionRow {
    id: string;
    location: string;
    appName: string;
    agentName: string;
    agentType: string;
    userId: string;
    permission: 'owner' | 'user' | 'unknown';
}

const AgentPermissionsPage: React.FC<AgentPermissionsPageProps> = ({
    projectNumber: propProjectNumber,
    projectId: propProjectId,
    config: propConfig,
}) => {
    const projectNumber = propProjectNumber ?? propConfig?.projectId ?? '';
    const projectId = propProjectId ?? propConfig?.projectId ?? projectNumber;
    const [permissionsData, setPermissionsData] = useState<PermissionRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [partialFailures, setPartialFailures] = useState<PartialFailure[]>([]);
    const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
    const [copiedScript, setCopiedScript] = useState(false);
    const scriptModalRef = useRef<HTMLDivElement>(null);

    useModalA11y({
        isOpen: isScriptModalOpen,
        onClose: () => setIsScriptModalOpen(false),
        containerRef: scriptModalRef,
    });

    const [globalSearch, setGlobalSearch] = useState('');
    const [filters, setFilters] = useState({
        location: '',
        appName: '',
        agentName: '',
        agentType: '',
        userId: '',
        permission: ''
    });

    const hasActiveFilters = useMemo(
        () =>
            Boolean(
                globalSearch.trim() ||
                Object.values(filters).some((val) => val.trim().length > 0),
            ),
        [globalSearch, filters],
    );

    const handleClearFilters = () => {
        setGlobalSearch('');
        setFilters({
            location: '',
            appName: '',
            agentName: '',
            agentType: '',
            userId: '',
            permission: '',
        });
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const filteredData = useMemo(() => {
        const q = globalSearch.trim().toLowerCase();
        return permissionsData.filter(row => {
            if (q) {
                const matchesQuickSearch =
                    row.location.toLowerCase().includes(q) ||
                    row.appName.toLowerCase().includes(q) ||
                    row.agentName.toLowerCase().includes(q) ||
                    row.agentType.toLowerCase().includes(q) ||
                    row.userId.toLowerCase().includes(q) ||
                    row.permission.toLowerCase().includes(q);
                if (!matchesQuickSearch) return false;
            }
            return (
                row.location.toLowerCase().includes(filters.location.toLowerCase()) &&
                row.appName.toLowerCase().includes(filters.appName.toLowerCase()) &&
                row.agentName.toLowerCase().includes(filters.agentName.toLowerCase()) &&
                row.agentType.toLowerCase().includes(filters.agentType.toLowerCase()) &&
                row.userId.toLowerCase().includes(filters.userId.toLowerCase()) &&
                row.permission.toLowerCase().includes(filters.permission.toLowerCase())
            );
        });
    }, [permissionsData, filters, globalSearch]);

    const exportToCsv = () => {
        if (filteredData.length === 0) return;
        const headers = ['Location', 'Gemini Enterprise App', 'Agent Name', 'Agent Type', 'User ID', 'Permission'];
        const csvRows = [headers.join(',')];
        
        const escapeCsvCell = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;
        filteredData.forEach(row => {
            csvRows.push([
                row.location,
                row.appName,
                row.agentName,
                row.agentType,
                row.userId,
                row.permission,
            ].map(escapeCsvCell).join(','));
        });
        
        const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(csvBlob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'agent_permissions_export.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const [config] = useState(() => ({
        appId: '',
        appLocation: 'global',
        collectionId: 'default_collection',
        assistantId: 'default_assistant',
    }));

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
        ...config,
        projectId: projectNumber,
    }), [config, projectNumber]);

    const runPermissionsScan = useCallback(async (isBackground = false) => {
        if (!apiConfig.projectId) {
            if (!isBackground) {
                setError("Project must be selected to list permissions.");
            }
            setPermissionsData([]);
            setPartialFailures([]);
            return;
        }

        if (!isBackground) {
            setIsLoading(true);
        }
        setError(null);
        setPartialFailures([]);

        const rows: PermissionRow[] = [];
        const locationsToScan = ['global', 'us', 'eu'];
        const failures: PartialFailure[] = [];

        try {
            // First fetch the project-level IAM policy to get inherited permissions
            let projectPolicy: IamPolicy = { bindings: [] };
            try {
                projectPolicy = (await api.getProjectIamPolicy(apiConfig.projectId!)) || { bindings: [] };
            } catch (projectErr: unknown) {
                console.warn("Could not fetch project IAM policy for inherited permissions", projectErr);
                failures.push({
                    id: `project-iam-${apiConfig.projectId}`,
                    name: `Project IAM Policy (${apiConfig.projectId})`,
                    resourceType: 'Project IAM Policy',
                    status: (projectErr as { status?: number; code?: number })?.status || (projectErr as { status?: number; code?: number })?.code || (toErrorMessage(projectErr).includes('403') ? 403 : undefined),
                    error: toErrorMessage(projectErr),
                    reason: `Could not fetch inherited project IAM policy: ${toErrorMessage(projectErr)}`,
                });
            }

            // Extract inherited project roles that genuinely confer broad Discovery Engine agent access
            // (Explicitly exclude customRestrictedEndUser / customRestrictedAdmin / notebookLmUser, which are
            // isolation baseline roles designed NOT to grant inherited private-agent access.)
            const inheritedBindings: IamBinding[] = projectPolicy.bindings?.filter((binding: IamBinding) => {
                if (!binding.role) return false;
                const role = binding.role.toLowerCase();
                if (
                    role.endsWith('/roles/customrestrictedenduser') ||
                    role.endsWith('/roles/customrestrictedadmin') ||
                    role === 'roles/discoveryengine.notebooklmuser'
                ) {
                    return false;
                }
                return role === 'roles/owner' ||
                       role === 'roles/editor' ||
                       role === 'roles/viewer' ||
                       role.startsWith('roles/discoveryengine.');
            }) || [];
            
            for (const location of locationsToScan) {
                const locConfig = { ...apiConfig, appLocation: location };
                let appsInLocation: AppEngine[] = [];
                try {
                    const enginesResponse = (await api.listResources('engines', locConfig)) || {};
                    appsInLocation = enginesResponse.engines || [];
                } catch (appErr: unknown) {
                    console.warn(`Could not list apps in location ${location}`, appErr);
                    failures.push({
                        id: `engines-${location}`,
                        name: `Engines (${location})`,
                        resourceType: 'Engines Collection',
                        status: (appErr as { status?: number; code?: number })?.status || (appErr as { status?: number; code?: number })?.code || (toErrorMessage(appErr).includes('403') ? 403 : undefined),
                        error: toErrorMessage(appErr),
                        reason: `Failed listing apps in location '${location}': ${toErrorMessage(appErr)}`,
                    });
                }

                for (const app of appsInLocation) {
                    const appId = app.name.split('/').pop()!;
                    const appConfig = { ...locConfig, appId };
                    const appName = app.displayName || appId;

                    try {
                        const assistantsResponse = (await api.listResources('assistants', appConfig)) || {};
                        let assistants: Assistant[] = assistantsResponse.assistants || [];
                        if (assistants.length === 0 && Array.isArray((assistantsResponse as any).agents) && (assistantsResponse as any).agents.length > 0) {
                            assistants = [{
                                name: `${app.name}/assistants/default_assistant`,
                                displayName: 'Default Assistant',
                            }];
                        }

                        for (const assistant of assistants) {
                            const assistantConfig = { ...appConfig, assistantId: assistant.name.split('/').pop()! };

                            try {
                                const agentsResponse = (await api.listResources('agents', assistantConfig)) || {};
                                const agents: Agent[] = agentsResponse.agents || [];

                                for (const agent of agents) {
                                    try {
                                        const policy = (await api.getAgentIamPolicy(agent.name, locConfig)) || { bindings: [] };
                                        const specificBindings = policy.bindings || [];

                                        const allBindings = [
                                            ...specificBindings.map((b: IamBinding) => ({ ...b, isInherited: false })),
                                            ...inheritedBindings.map((b: IamBinding) => ({ ...b, isInherited: true }))
                                        ];

                                        if (allBindings.length === 0) {
                                            rows.push({
                                                id: `${location}-${agent.name}-none-none`,
                                                location: location,
                                                appName: appName,
                                                agentName: agent.displayName,
                                                agentType: agent.adkAgentDefinition ? 'ADK' : (agent.lowCodeAgentDefinition ? 'Low-Code' : (agent.agentType || 'N/A')),
                                                userId: 'No Members',
                                                permission: 'unknown'
                                            });
                                        }

                                        const seenUserRoles = new Set<string>();

                                        for (const binding of allBindings) {
                                            const role = binding.role || '';
                                            let permissionType: 'owner' | 'user' | 'unknown' = 'unknown';
                                            const lowerRole = role.toLowerCase();
                                            
                                            if (lowerRole.includes('admin') || lowerRole.includes('editor') || lowerRole.includes('owner')) {
                                                permissionType = 'owner';
                                            } else if (lowerRole.includes('viewer') || lowerRole.includes('user')) {
                                                permissionType = 'user';
                                            }

                                            const members = binding.members || [];
                                            
                                            for (const member of members) {
                                                const displayMember = member.replace(/^(user:|serviceAccount:|group:|domain:)/, '');
                                                const scopeSuffix = binding.isInherited ? 'inherited' : 'explicit';
                                                const dedupKey = `${member}-${permissionType}-${scopeSuffix}`;
                                                
                                                if (!seenUserRoles.has(dedupKey)) {
                                                    seenUserRoles.add(dedupKey);
                                                    rows.push({
                                                        id: `${location}-${agent.name}-${member}-${role}-${scopeSuffix}`,
                                                        location: location,
                                                        appName: appName,
                                                        agentName: agent.displayName,
                                                        agentType: agent.adkAgentDefinition ? 'ADK' : (agent.lowCodeAgentDefinition ? 'Low-Code' : (agent.agentType || 'N/A')),
                                                        userId: displayMember + (binding.isInherited ? ' (Inherited)' : ''),
                                                        permission: permissionType
                                                    });
                                                }
                                            }
                                        }
                                    } catch (policyErr: unknown) {
                                        console.warn(`Could not get IAM policy for agent ${agent.displayName}`, policyErr);
                                        failures.push({
                                            id: `iam-${agent.name}`,
                                            name: agent.displayName || agent.name,
                                            resourceType: 'Agent IAM Policy',
                                            status: (policyErr as { status?: number; code?: number })?.status || (policyErr as { status?: number; code?: number })?.code || (toErrorMessage(policyErr).includes('403') ? 403 : undefined),
                                            error: toErrorMessage(policyErr),
                                            reason: `Could not fetch IAM policy for agent '${agent.displayName || agent.name}': ${toErrorMessage(policyErr)}`,
                                        });
                                    }
                                }
                            } catch (agentErr: unknown) {
                                console.warn(`Could not list agents for assistant ${assistant.displayName}`, agentErr);
                                failures.push({
                                    id: `agents-${assistant.name}`,
                                    name: assistant.displayName || assistant.name,
                                    resourceType: 'Assistant Agents',
                                    status: (agentErr as { status?: number; code?: number })?.status || (agentErr as { status?: number; code?: number })?.code || (toErrorMessage(agentErr).includes('403') ? 403 : undefined),
                                    error: toErrorMessage(agentErr),
                                    reason: `Could not list agents for assistant '${assistant.displayName || assistant.name}': ${toErrorMessage(agentErr)}`,
                                });
                            }
                        }
                    } catch (appErr: unknown) {
                        console.warn(`Could not list assistants for app ${appName}`, appErr);
                        failures.push({
                            id: `assistants-${appId}`,
                            name: appName,
                            resourceType: 'Engine Assistants',
                            status: (appErr as { status?: number; code?: number })?.status || (appErr as { status?: number; code?: number })?.code || (toErrorMessage(appErr).includes('403') ? 403 : undefined),
                            error: toErrorMessage(appErr),
                            reason: `Could not list assistants for app '${appName}': ${toErrorMessage(appErr)}`,
                        });
                    }
                } // end app loop
            } // end locations loop

            setPermissionsData(rows);
            setPartialFailures(failures);
            if (rows.length === 0) {
                console.log("No explicit IAM permissions found on agents across any location.");
            }
        } catch (err: unknown) {
            setError(toErrorMessage(err) || 'An unexpected error occurred while fetching permissions.');
            setPermissionsData([]);
            setPartialFailures(failures);
        } finally {
            if (!isBackground) {
                setIsLoading(false);
            }
        }
    }, [apiConfig]);

    const fetchPermissions = useCallback(() => {
        return runPermissionsScan(false);
    }, [runPermissionsScan]);

    useEffect(() => {
        setPermissionsData([]);
        if (projectNumber) {
            void runPermissionsScan(false);
        }
    }, [projectNumber, runPermissionsScan]);

    const pythonScriptText = useMemo(() => {
        const scriptProjectId = projectId || projectNumber || 'YOUR_PROJECT_ID';
        return `import os\nimport csv\nimport requests\nimport google.auth\nfrom google.auth.transport.requests import Request\n\nPROJECT_ID = "${scriptProjectId}"\nLOCATIONS = ["global", "us", "eu"]\n\ndef get_access_token():\n    credentials, project = google.auth.default()\n    credentials.refresh(Request())\n    return credentials.token\n\ndef list_agent_permissions():\n    token = get_access_token()\n    headers = {\n        "Authorization": f"Bearer {token}",\n        "X-Goog-User-Project": PROJECT_ID\n    }\n    \n    rows = []\n    print(f"Scanning project: {PROJECT_ID}")\n    \n    for loc in LOCATIONS:\n        print(f"\\nScanning location: {loc}...")\n        endpoint = "discoveryengine.googleapis.com" if loc == "global" else f"{loc}-discoveryengine.googleapis.com"\n        url = f"https://{endpoint}/v1alpha/projects/{PROJECT_ID}/locations/{loc}/collections/default_collection/engines"\n        engines_res = requests.get(url, headers=headers).json()\n        \n        for engine in engines_res.get("engines", []):\n            engine_id = engine["name"].split("/")[-1]\n            engine_name = engine.get("displayName", engine_id)\n            \n            ast_url = f"{url}/{engine_id}/assistants"\n            ast_res = requests.get(ast_url, headers=headers).json()\n            \n            for ast in ast_res.get("assistants", []):\n                ast_id = ast["name"].split("/")[-1]\n                \n                agt_url = f"{ast_url}/{ast_id}/agents"\n                agt_res = requests.get(agt_url, headers=headers).json()\n                \n                for agent in agt_res.get("agents", []):\n                    agent_name = agent.get("displayName", agent["name"].split("/")[-1])\n                    \n                    iam_url = f"https://{endpoint}/v1alpha/{agent['name']}:getIamPolicy"\n                    iam_res = requests.get(iam_url, headers=headers).json()\n                    \n                    bindings = iam_res.get("bindings", [])\n                    if not bindings:\n                        rows.append([loc, engine_name, agent_name, "No Members", "None"])\n                        \n                    for binding in bindings:\n                        role = binding.get("role", "")\n                        for member in binding.get("members", []):\n                            rows.append([loc, engine_name, agent_name, member, role])\n                            print(f"Found: {agent_name} -> {member} ({role})")\n\n    # Write to CSV\n    with open("agent_permissions.csv", "w", newline="") as f:\n        writer = csv.writer(f)\n        writer.writerow(["Location", "App Name", "Agent Name", "Member", "Role"])\n        writer.writerows(rows)\n        print("\\nExport complete: agent_permissions.csv")\n\nif __name__ == "__main__":\n    list_agent_permissions()`;
    }, [projectId, projectNumber]);

    const handleCopyScript = async () => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(pythonScriptText);
                setCopiedScript(true);
                setTimeout(() => setCopiedScript(false), 2000);
            }
        } catch (err) {
            console.warn('Failed to copy Python script:', err);
        }
    };

    return (
        <PageShell variant="locked">
            <PageHeader
                title="Agent Permissions"
                subtitle="Read-only effective Cloud IAM & RBAC bindings across all Gemini Enterprise agents in global, us, and eu."
                consolePage={Page.AGENT_PERMISSIONS}
                projectId={projectId}
                projectNumber={projectNumber}
                onRefresh={() => void fetchPermissions()}
                isRefreshing={isLoading}
                refreshLabel="Scan All Locations"
                secondaryActions={
                    <>
                        <button
                            type="button"
                            onClick={() => setIsScriptModalOpen(true)}
                            className="inline-flex items-center px-3 h-9 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 hover:text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
                        >
                            View Python Script
                        </button>
                        <button
                            type="button"
                            onClick={exportToCsv}
                            disabled={filteredData.length === 0 || isLoading}
                            className="inline-flex items-center px-3 h-9 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 hover:text-white text-xs sm:text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Export CSV
                        </button>
                    </>
                }
            />

            {error && (
                <div role="alert" className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-lg shrink-0">
                    {error}
                </div>
            )}

            {partialFailures.length > 0 && (
                <PartialResultsBanner
                    partialFailures={partialFailures}
                    onRetry={fetchPermissions}
                />
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm w-full min-w-0 flex-1 flex flex-col min-h-0">
                <div className="bg-gray-800/40 border-b border-gray-800 px-4 sm:px-6 py-3 flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
                        <input
                            type="search"
                            aria-label="Quick search agent permissions"
                            placeholder="Quick search app, agent, principal, role, or location..."
                            value={globalSearch}
                            onChange={(e) => setGlobalSearch(e.target.value)}
                            className="flex-1 min-w-[220px] max-w-md h-9 bg-gray-950/90 border border-gray-700 rounded-lg px-3 text-xs sm:text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="button"
                            onClick={handleClearFilters}
                            disabled={!hasActiveFilters}
                            className="inline-flex items-center px-3 h-9 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs sm:text-sm font-medium text-gray-200 hover:text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Clear Filters
                        </button>
                    </div>
                    <span className="text-xs sm:text-sm text-gray-400 font-mono">
                        Showing {filteredData.length} of {permissionsData.length} records
                    </span>
                </div>
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-gray-500 space-y-4">
                        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                        <p>Fetching IAM policies...</p>
                    </div>
                ) : permissionsData.length > 0 ? (
                    <div className="w-full overflow-auto flex-1 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:bg-gray-900 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-500 [scrollbar-width:thin] [scrollbar-color:#4b5563_#111827]">
                        <table className="w-full text-left border-collapse min-w-max relative">
                            <thead className="sticky top-0 z-10 bg-gray-900 shadow-sm">
                                <tr className="bg-gray-800/80 backdrop-blur-sm text-gray-400 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Location</div>
                                        <input type="text" name="location" value={filters.location} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Gemini Enterprise App</div>
                                        <input type="text" name="appName" value={filters.appName} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Agent Name</div>
                                        <input type="text" name="agentName" value={filters.agentName} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Agent Type</div>
                                        <input type="text" name="agentType" value={filters.agentType} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>User ID</div>
                                        <input type="text" name="userId" value={filters.userId} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Permission</div>
                                        <input type="text" name="permission" value={filters.permission} onChange={handleFilterChange} placeholder="owner / user" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50 text-sm">
                                {filteredData.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                                            {row.location}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-200 font-medium">
                                            {row.appName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {row.agentName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                                            {row.agentType}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-400 font-mono text-xs">
                                            {row.userId}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${row.permission === 'owner'
                                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                : row.permission === 'user'
                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                    : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                                                }`}>
                                                {row.permission}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        {partialFailures.length > 0 ? (
                            <div className="text-center px-4">
                                <p className="text-lg font-medium text-amber-400">Permissions Could Not Be Fully Retrieved</p>
                                <p className="text-sm mt-1 text-gray-400 max-w-md">
                                    One or more API requests returned errors or permission denials (e.g. 403 Forbidden). See the banner above for details.
                                </p>
                            </div>
                        ) : (
                            <div className="text-center px-4">
                                <p className="text-lg font-medium text-gray-400">No agent permissions found.</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    No permissions data loaded — no explicit or inherited permissions found.
                                </p>
                                <p className="text-sm mt-1">Select a project and click refetch to globally scan all agent permissions.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Python Script Modal */}
            {isScriptModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={() => setIsScriptModalOpen(false)}>
                            <div className="absolute inset-0 bg-gray-900 opacity-75"></div>
                        </div>

                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                        <div ref={scriptModalRef} className="inline-block align-bottom bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-gray-700">
                            <div className="bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <h3 className="text-lg leading-6 font-medium text-white" id="modal-title">
                                                Python Script: Export Agent Permissions
                                            </h3>
                                            <button
                                                type="button"
                                                data-testid="copy-python-script-btn"
                                                onClick={() => void handleCopyScript()}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors shrink-0"
                                            >
                                                {copiedScript ? 'Copied!' : 'Copy Script'}
                                            </button>
                                        </div>
                                        <div className="mt-2 bg-gray-900 p-4 rounded-md overflow-x-auto border border-gray-700">
                                            <p className="text-sm text-gray-400 mb-4">
                                                This script replicates the console&apos;s scanning logic. It iterates through all locations, extracts all apps, assistants, and agents, and finally lists the active IAM policies for each. It saves the output to a CSV file.
                                            </p>
                                            <pre className="text-sm font-mono text-blue-300 whitespace-pre-wrap select-all">
                                                {pythonScriptText}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-800 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-lg gap-2">
                                <button
                                    type="button"
                                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gray-600 text-base font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:ml-3 sm:w-auto sm:text-sm"
                                    onClick={() => setIsScriptModalOpen(false)}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
};

export default AgentPermissionsPage;
