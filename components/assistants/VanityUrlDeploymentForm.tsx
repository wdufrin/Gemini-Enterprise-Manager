import React, { useState, useEffect } from 'react';
import { AppEngine, Config } from '../../types';
import * as api from '../../services/apiService';
import InfoTooltip from '../InfoTooltip';

interface VanityUrlDeploymentFormProps {
    engine: AppEngine;
    config: Config;
    projectNumber: string;
    onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

const VanityUrlDeploymentForm: React.FC<VanityUrlDeploymentFormProps> = ({ engine, config, projectNumber, onBuildTriggered }) => {
    const [isDeploying, setIsDeploying] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [buildId, setBuildId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [projectId, setProjectId] = useState(projectNumber);
    const [serviceName, setServiceName] = useState(() => {
        const engineId = engine.name.split('/').pop() || 'assistant';
        return `assistant-${engineId}`.substring(0, 40).replace(/[^a-z0-9-]/g, '').toLowerCase();
    });
    const [automateGLB, setAutomateGLB] = useState(false);
    const [automateDNS, setAutomateDNS] = useState(false);
    const [customDomain, setCustomDomain] = useState('');


    useEffect(() => {
        const resolveProject = async () => {
            try {
                const p = await api.getProject(projectNumber);
                if (p.projectId) setProjectId(p.projectId);
            } catch (e) {
                console.warn("Could not resolve Project ID string");
            }
        };
        resolveProject();
    }, [projectNumber]);



    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleDeploy = async () => {
        setIsDeploying(true);
        setError(null);
        setLogs([]);
        setBuildId(null);
        
        try {
            const engineId = engine.name.split('/').pop();
            const location = config.appLocation;

            let resolvedProjectId = projectId;
            if (/^\d+$/.test(resolvedProjectId)) {
                addLog(`Resolving project string ID for Number: ${resolvedProjectId}...`);
                try {
                    const p = await api.getProject(resolvedProjectId);
                    resolvedProjectId = p.projectId;
                    setProjectId(resolvedProjectId);
                } catch (e) {
                    addLog("Warning: Could not resolve project string ID, using number fallback.");
                }
            }

            addLog(`Fetching Vertex AI Search Portal UUID (CID) for engine ${engineId}...`);
            let widgetConfigId = (engine as any).widgetConfigConfigId;
            if (!widgetConfigId) {
                try {
                    const engineData = await api.getEngine(engine.name, config);
                    widgetConfigId = (engineData as any).widgetConfigConfigId || (engineData as any)?.chatEngineConfig?.dialogflowAgentToStoreRouting?.defaultUri?.split('cid/')?.[1]?.replace(/\/$/, '') || null;
                } catch (e) {
                    addLog("Warning: Could not fetch fresh engine details, trying to proceed with existing data.");
                }
            }

            if (!widgetConfigId) {
                setError("Failed to retrieve widgetConfigConfigId for the engine. Ensure the engine exists and is fully initialized.");
                addLog("ERROR: Redirect URLs require the No-Code Agent Builder to be initialized at least once to generate a workspace.");
                setIsDeploying(false);
                return;
            }
            
            addLog(`Discovered Portal CID: ${widgetConfigId}`);
            addLog("Preparing Cloud Build steps for Global Load Balancer Redirect...");

            const steps = [];

            if (automateGLB && customDomain) {
                const newZoneName = customDomain.replace(/\./g, '-') + '-zone';
                steps.push({
                    name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                    entrypoint: 'bash',
                    args: ['-c', `
echo "========== STARTING GLOBAL LOAD BALANCER (302 REDIRECT) AUTOMATION =========="
CERT_NAME="${serviceName}-cert"
URL_MAP_NAME="${serviceName}-url-map"
PROXY_NAME="${serviceName}-https-proxy"
FWD_RULE_NAME="${serviceName}-fwd-rule"

echo "1. Provisioning Managed SSL Certificate for ${customDomain}..."
gcloud compute ssl-certificates create $$CERT_NAME \\
    --domains=${customDomain} \\
    --global || true

echo "2. Creating URL Map for 302 Redirect to Portal..."
cat <<EOF > urlmap.yaml
name: \$\$URL_MAP_NAME
defaultUrlRedirect:
  hostRedirect: vertexaisearch.cloud.google.com
  pathRedirect: /u/0/home/cid/${widgetConfigId}
  redirectResponseCode: FOUND
EOF

gcloud compute url-maps import $$URL_MAP_NAME \\
    --source=urlmap.yaml \\
    --global \\
    --quiet || true

echo "3. Creating Target HTTPS Proxy..."
gcloud compute target-https-proxies create $$PROXY_NAME \\
    --ssl-certificates=$$CERT_NAME \\
    --url-map=$$URL_MAP_NAME || true

echo "4. Creating Global Forwarding Rule..."
gcloud compute forwarding-rules create $$FWD_RULE_NAME \\
    --target-https-proxy=$$PROXY_NAME \\
    --global \\
    --ports=443 \\
    --network-tier=PREMIUM || true

echo "========== LOAD BALANCER PROVISIONING COMPLETE =========="
IP_ADDRESS=$(gcloud compute forwarding-rules describe $$FWD_RULE_NAME --global --format="value(IPAddress)")
echo "PUBLIC IP ADDRESS FOR DNS A-RECORD: $$IP_ADDRESS"

${automateDNS ? `
echo "========== STARTING CLOUD DNS AUTOMATION =========="
echo "7. Searching for matching Managed Zone for ${customDomain}..."

# Find the longest matching managed zone DNS name
MATCHING_ZONE=$(gcloud dns managed-zones list --format="value(name,dnsName)" | awk -v domain="${customDomain}." '
  BEGIN { best_match=""; best_len=0 }
  {
    zone_name=$$1; dns_name=$$2;
    # Check if the requested domain ends with the managed zone dns_name
    if (index(domain, dns_name) == length(domain) - length(dns_name) + 1) {
      if (length(dns_name) > best_len) {
        best_match=zone_name;
        best_len=length(dns_name);
      }
    }
  }
  END { print best_match }
')

if [ -z "$$MATCHING_ZONE" ]; then
  echo "No matching Cloud DNS Managed Zone found. Creating a new Managed Zone for ${customDomain}..."
  gcloud dns managed-zones create ${newZoneName} --description="Auto-provisioned for ${customDomain}" --dns-name="${customDomain}." --visibility="public" || true
  MATCHING_ZONE="${newZoneName}"
  
  echo "****************************************************************"
  echo "ACTION REQUIRED: A new Cloud DNS zone was created."
  echo "You must copy the new NS records from the GCP Console and add them"
  echo "to your domain registrar for ${customDomain} to resolve."
  echo "****************************************************************"
fi

echo "Found/Created Managed Zone: $$MATCHING_ZONE"
echo "8. Creating A-Record binding ${customDomain} to $$IP_ADDRESS..."

# Remove the record if it exists, then add the new one
gcloud dns record-sets delete ${customDomain}. --type=A --zone=$$MATCHING_ZONE || true
gcloud dns record-sets create ${customDomain}. --rrdatas=$$IP_ADDRESS --type=A --ttl=300 --zone=$$MATCHING_ZONE || true

echo "========== CLOUD DNS PROVISIONING COMPLETE =========="
` : 'echo "========== SKIPPING CLOUD DNS AUTOMATION (Not Requested) =========="'
}
`]
                });
            }

            const buildConfig: any = {
                steps: steps,
                timeout: "1800s", // Give more time for LB creation
                
            };

            addLog("Triggering Cloud Build...");
            const buildOp = await api.createCloudBuild(projectId, buildConfig);
            const triggeredBuildId = buildOp.metadata?.build?.id || 'unknown';
            setBuildId(triggeredBuildId);
            
            if (onBuildTriggered && triggeredBuildId !== 'unknown') {
                onBuildTriggered(triggeredBuildId, projectId);
            }

            addLog(`Build triggered successfully! ID: ${triggeredBuildId}`);
            addLog("Once completed, the Redirect URL will be active.");
            
        } catch (err: any) {
            setError(err.message || "Deployment failed.");
            addLog(`Error: ${err.message}`);
        } finally {
            setIsDeploying(false);
        }
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6 mb-6 border border-gray-700 animate-fade-in-up">
            <h2 className="text-xl font-bold text-white mb-2">Deploy Redirect URL</h2>
            <p className="text-gray-400 text-sm mb-6">
                Generate a clean HTTP 302 Redirect for your Gemini Enterprise Assistant and provision a dedicated Redirect URL at the Global Load Balancer level.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Configuration Column */}
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Service Name
                            <InfoTooltip text="The name for the underlying Cloud Run service. This will be part of the generated URL." />
                        </label>
                        <input
                            type="text"
                            value={serviceName}
                            onChange={(e) => setServiceName(e.target.value)}
                            className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-200 py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                            disabled={isDeploying}
                        />
                    </div>

                        <div className="bg-gray-800 border border-gray-600 rounded-md p-4 space-y-4 mt-6">
                            {/* GLOBAL EXTERNAL LOAD BALANCER AUTOMATION */}
                            <div className="pt-2">
                                <label className="flex items-center space-x-3 mb-4 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={automateGLB}
                                        onChange={(e) => setAutomateGLB(e.target.checked)}
                                        className="form-checkbox h-5 w-5 text-blue-500 rounded border-slate-600 bg-slate-800"
                                    />
                                    <span className="text-sm font-medium text-slate-300">
                                        Automate Global External Load Balancer Provisioning (Optional)
                                        <p className="text-xs text-slate-500 font-normal mt-1">
                                            Provisions an Internet NEG, Backend Service, Google-managed SSL Certificate, URL Map, HTTPS Proxy, and Forwarding Rule. Note: This creates billable GCP resources.
                                        </p>
                                    </span>
                                </label>

                                {automateGLB && (
                                    <div className="space-y-4 pl-8 border-l-2 border-slate-700 ml-2 animate-fadeIn">
                                        <label className="flex items-center space-x-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={automateDNS}
                                                onChange={(e) => setAutomateDNS(e.target.checked)}
                                                className="form-checkbox h-4 w-4 text-purple-500 rounded border-slate-600 bg-slate-800"
                                            />
                                            <span className="text-sm font-medium text-slate-300">
                                                Automatically Configure Cloud DNS (Optional)
                                                <p className="text-xs text-slate-500 font-normal mt-0.5">
                                                    Automatically registers the A-Record if a Managed Zone exists in this project.
                                                </p>
                                            </span>
                                        </label>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-400 mb-1">
                                                Custom Redirect Domain
                                            </label>
                                            <input
                                                type="text"
                                                value={customDomain}
                                                onChange={(e) => setCustomDomain(e.target.value)}
                                                placeholder="ai.yourcompany.com"
                                                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                disabled={isDeploying}
                                            />
                                            {customDomain && !automateDNS && (
                                                <div className="mt-3 p-3 bg-blue-900/30 border border-blue-700/50 rounded-md text-sm text-blue-200">
                                                    <strong>Manual Action Required:</strong> Since Cloud DNS automation is disabled, you will need to manually create an <code>A Record</code> in your domain registrar pointing <code>{customDomain}</code> to the Load Balancer IP address after deployment completes.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    <div className="pt-2">
                        <button
                            onClick={handleDeploy}
                            disabled={isDeploying || !serviceName}
                            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        >
                            {isDeploying ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Deploying...
                                </span>
                            ) : (
                                "Deploy Redirect URL"
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-800 rounded-md text-sm text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Logs Column */}
                <div>
                     <label className="block text-sm font-medium text-gray-300 mb-1">
                        Deployment Status
                    </label>
                    <div className="bg-gray-900 border border-gray-700 rounded-md p-4 h-64 overflow-y-auto font-mono text-xs text-gray-300">
                        {logs.length === 0 ? (
                            <span className="text-gray-500 italic">Ready to deploy. Logs will appear here.</span>
                        ) : (
                            <ul className="space-y-1">
                                {logs.map((log, i) => <li key={i}>{log}</li>)}
                            </ul>
                        )}
                        {buildId && (
                            <div className="mt-4 pt-4 border-t border-gray-700 text-blue-400">
                                Build Triggered! You can track the progress in Cloud Build:
                                <br/>
                                <strong className="break-all">{buildId}</strong>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VanityUrlDeploymentForm;
