import React, { useState, useEffect } from 'react';
import * as api from '../services/apiService';
import { GlobalForwardingRule, ManagedSslCertificate } from '../types';
import ProjectInput from '../components/ProjectInput';
import CloudConsoleButton from '../components/CloudConsoleButton';

interface VanityUrlsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  onBuildTriggered?: (buildId: string, projectId: string) => void;
}

interface CombinedVanityUrl {
  name: string; // The base service name (e.g. 'gemini-enterprise')
  serviceName: string; // The full deployed service name (e.g. 'assistant-gemini-enterprise')
  ipAddress: string;
  domains: string[];
  certStatus: string;
  creationTimestamp: string;
  fwdRuleName: string;
  certName?: string;
  assistantDisplayName?: string;
  routingMode: 'public' | 'private';
}

const VanityUrlsPage: React.FC<VanityUrlsPageProps> = ({ projectNumber, setProjectNumber, onBuildTriggered }) => {
    const [projectId, setProjectId] = useState(projectNumber);

    useEffect(() => {
        const resolveProject = async () => {
            if (!projectNumber) return;
            try {
                const p = await api.getProject(projectNumber);
                if (p.projectId) setProjectId(p.projectId);
            } catch (e) {
                console.warn("Could not resolve Project ID string", e);
            }
        };
        resolveProject();
    }, [projectNumber]);

    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [vanityUrls, setVanityUrls] = useState<CombinedVanityUrl[]>([]);

    const fetchVanityUrls = async () => {
        if (!projectId) return;
        setIsLoading(true);
        setError(null);
        setVanityUrls([]);
        
        try {
            const [aggRes, certRes, dnsRes] = await Promise.all([
                api.listAggregatedForwardingRules(projectId).catch(() => ({ items: {} })),
                api.listManagedSslCertificates(projectId).catch(() => ({ items: [] })),
                api.listDnsZones(projectId).catch(() => ({ items: [] }))
            ]);

            const scopes = aggRes.items || {};
            const rules: any[] = [];
            Object.keys(scopes).forEach(key => {
                const scopeData = scopes[key];
                if (scopeData?.forwardingRules) {
                    rules.push(...scopeData.forwardingRules);
                }
            });

            const certs: ManagedSslCertificate[] = certRes.items || [];
            const zones = dnsRes.managedZones || [];

            // Fetch Assistant Display Names
            const assistantNames: Record<string, string> = {};
            try {
                const discoveryLocations = ['global', 'us', 'eu'];
                await Promise.allSettled(discoveryLocations.map(async (loc) => {
                    const apiConfig = { projectId: projectId, appLocation: loc, collectionId: 'default_collection', appId: '', assistantId: '' } as any;
                    const collections = (await api.listResources('collections', apiConfig).catch(() => ({}))).collections || [];
                    for (const col of collections) {
                        const colConfig = { ...apiConfig, collectionId: col.name.split('/').pop()! };
                        const engines = (await api.listResources('engines', colConfig).catch(() => ({}))).engines || [];
                        for (const eng of engines) {
                            const appId = eng.name.split('/').pop()!;
                            assistantNames[appId] = eng.displayName;
                        }
                    }
                }));
            } catch (e) {
                console.warn("Could not fetch assistant display names for Redirect URLs", e);
            }

            // Filter for rules that conform to our deployment naming conventions (both global and regional private ones)
            const combined: CombinedVanityUrl[] = rules
                .filter(r => r.name.endsWith('-fwd-rule') || r.name.endsWith('-internal-fwd-rule'))
                .map(rule => {
                    const isPrivate = rule.name.endsWith('-internal-fwd-rule');
                    const baseServiceName = isPrivate 
                        ? rule.name.replace('-internal-fwd-rule', '')
                        : rule.name.replace('-fwd-rule', '');

                    let domains: string[] = [];
                    let certStatus = 'UNKNOWN';
                    let certName: string | undefined = undefined;

                    if (isPrivate) {
                        certStatus = 'N/A (Private)';
                        // Find matching custom DNS zone to extract custom domain name
                        const expectedZoneName = `${baseServiceName}-custom-dns`;
                        const zone = zones.find((z: any) => z.name === expectedZoneName);
                        if (zone?.dnsName) {
                            domains = [zone.dnsName.replace(/\.$/, '')];
                        }
                    } else {
                        const expectedCertName = `${baseServiceName}-cert`;
                        const cert = certs.find(c => c.name === expectedCertName);
                        domains = cert?.managed?.domains || [];
                        certStatus = cert?.managed?.status || 'UNKNOWN';
                        certName = cert?.name;
                    }

                    // Reconstruct appId if the default 'assistant-' prefix was used
                    let inferredAppId = baseServiceName;
                    if (baseServiceName.startsWith('assistant-')) {
                        inferredAppId = baseServiceName.replace('assistant-', '');
                    } else if (baseServiceName.startsWith('cosmere-')) {
                         inferredAppId = baseServiceName.replace('cosmere-', '');
                    }
                    
                    let dName = assistantNames[baseServiceName] || assistantNames[inferredAppId];

                    return {
                        name: baseServiceName,
                        serviceName: baseServiceName,
                        ipAddress: rule.IPAddress,
                        domains: domains,
                        certStatus: certStatus,
                        creationTimestamp: rule.creationTimestamp,
                        fwdRuleName: rule.name,
                        certName: certName,
                        assistantDisplayName: dName,
                        routingMode: isPrivate ? 'private' : 'public'
                    };
                });

            setVanityUrls(combined.sort((a,b) => new Date(b.creationTimestamp).getTime() - new Date(a.creationTimestamp).getTime()));
            
            if (combined.length === 0) {
                setError("No Redirect URLs found in this project.");
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch redirect URLs.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (projectId) {
            fetchVanityUrls();
        }
    }, [projectId]);

    const handleDelete = async (serviceName: string) => {
        if (!window.confirm(`Are you sure you want to permanently delete the redirect URL infrastructure for '${serviceName}'? This will dismantle the Global Load Balancer, SSL Certificate, URL Map, and Target Proxy.`)) {
            return;
        }

        setIsDeleting(serviceName);
        setError(null);

        try {
            const buildId = await api.deleteVanityUrl(projectId, serviceName);
            if (onBuildTriggered) {
                onBuildTriggered(buildId, projectId);
            }
            
            // Optimistically remove from list
            setVanityUrls(prev => prev.filter(v => v.name !== serviceName));
        } catch(e: any) {
            setError(e.message || `Failed to initiate deletion for ${serviceName}`);
        } finally {
            setIsDeleting(null);
        }
    };

    return (
        <div className="space-y-6 flex flex-col h-full">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md shrink-0">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-lg font-semibold text-white">Redirect URLs</h2>
                    <CloudConsoleButton url={`https://console.cloud.google.com/net-services/loadbalancing/advanced/forwardingRules/list?project=${projectId}`} />
                </div>
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectId} onChange={setProjectNumber} />
                    </div>
                    <button 
                        onClick={fetchVanityUrls} 
                        disabled={isLoading || !projectId}
                        className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                    >
                        {isLoading ? 'Scanning...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {error && <div className="p-4 bg-red-900/30 text-red-300 text-sm rounded-lg border border-red-800">{error}</div>}

            <div className="flex-1 bg-gray-800 rounded-lg shadow-md overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-700">
                    <h3 className="text-md font-semibold text-white">Provisioned Redirect URLs</h3>
                    <p className="text-xs text-gray-400 mt-1">Displays public load balancers and private VPC-SC endpoints configured for your assistants.</p>
                </div>
                
                <div className="flex-1 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Service Name / Instance</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Routing Mode</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Domain(s)</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Redirect IP Address</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Cert Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created At</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700 text-sm">
                            {vanityUrls.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500 italic">
                                        No redirect URLs found.
                                    </td>
                                </tr>
                            )}
                            {vanityUrls.map((url) => (
                                <tr key={url.name} className="hover:bg-gray-700/30 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="font-medium text-white">{url.name}</div>
                                        {url.assistantDisplayName ? (
                                            <div className="text-xs text-purple-400 font-bold mt-1">Instance: {url.assistantDisplayName}</div>
                                        ) : (
                                            <div className="text-xs text-gray-500 font-mono mt-1">{url.fwdRuleName}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-md border ${
                                            url.routingMode === 'private'
                                                ? 'bg-purple-900/40 text-purple-300 border-purple-800'
                                                : 'bg-indigo-900/40 text-indigo-300 border-indigo-800'
                                        }`}>
                                            {url.routingMode === 'private' ? 'Private (VPC-SC)' : 'Public (Global LB)'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {url.domains.length > 0 ? (
                                            <div className="flex flex-col gap-1">
                                                {url.domains.map(domain => (
                                                    <a key={domain} href={`http://${domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">
                                                        {domain}
                                                    </a>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-gray-500 italic">None</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-300 font-mono select-all">
                                        {url.ipAddress}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            url.certStatus === 'ACTIVE' ? 'bg-green-900/40 text-green-300 border border-green-800' :
                                            url.certStatus === 'PROVISIONING' ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-800' :
                                            url.certStatus === 'FAILED' ? 'bg-red-900/40 text-red-300 border border-red-800' :
                                            'bg-gray-700 text-gray-400 border border-gray-600'
                                        }`}>
                                            {url.certStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-xs">
                                        {new Date(url.creationTimestamp).toLocaleDateString()} {new Date(url.creationTimestamp).toLocaleTimeString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleDelete(url.serviceName)}
                                            disabled={isDeleting === url.serviceName}
                                            className="text-red-400 hover:text-red-300 disabled:text-gray-600 transition-colors tooltip-wrapper"
                                            title="Delete Redirect URL Infrastructure"
                                        >
                                            {isDeleting === url.serviceName ? (
                                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-red-400"></div>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default VanityUrlsPage;
