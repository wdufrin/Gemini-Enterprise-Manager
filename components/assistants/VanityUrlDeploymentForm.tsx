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

    // Private Mode & PSC States
    const [isPrivateMode, setIsPrivateMode] = useState(false);
    const [vpcNetwork, setVpcNetwork] = useState('default');
    const [vpcSubnet, setVpcSubnet] = useState('default');
    const [autoAllocatePscIp, setAutoAllocatePscIp] = useState(false);
    const [customPscIp, setCustomPscIp] = useState('10.128.0.100');
    const [useVpcScBundle, setUseVpcScBundle] = useState(false);
    const [automatePrivateDns, setAutomatePrivateDns] = useState(true);

    // VPC Networks and Subnets List States
    const [networksList, setNetworksList] = useState<string[]>([]);
    const [subnetsList, setSubnetsList] = useState<string[]>([]);
    const [selectedNetworkOption, setSelectedNetworkOption] = useState<string>('default');
    const [selectedSubnetOption, setSelectedSubnetOption] = useState<string>('default');

    // Existing Redirect Domains States
    const [existingDomains, setExistingDomains] = useState<string[]>([]);
    const [selectedDomainOption, setSelectedDomainOption] = useState<string>('new');


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

    useEffect(() => {
        const fetchExistingRedirects = async () => {
            if (!projectId) return;
            try {
                const [fwdRes, certRes] = await Promise.all([
                    api.listGlobalForwardingRules(projectId).catch(() => ({ items: [] })),
                    api.listManagedSslCertificates(projectId).catch(() => ({ items: [] }))
                ]);

                const rules = fwdRes.items || [];
                const certs = certRes.items || [];

                const rawEngineId = engine.name.split('/').pop() || '';
                const cleanEngineId = rawEngineId.replace(/[^a-z0-9-]/g, '').toLowerCase();
                const defaultBaseName = `assistant-${cleanEngineId}`.substring(0, 40);

                const matchedRules = rules.filter(r => {
                    const ruleName = r.name.toLowerCase();
                    return ruleName.includes(defaultBaseName) || 
                           ruleName.includes(cleanEngineId.substring(0, 20));
                });
                
                const domainsSet = new Set<string>();
                matchedRules.forEach(rule => {
                    const ruleBase = rule.name.replace('-fwd-rule', '');
                    const cert = certs.find(c => c.name === `${ruleBase}-cert`);
                    if (cert?.managed?.domains) {
                        cert.managed.domains.forEach(d => domainsSet.add(d));
                    }
                });

                const domainsList = Array.from(domainsSet);
                setExistingDomains(domainsList);
                if (domainsList.length > 0) {
                    setSelectedDomainOption(domainsList[0]);
                    setCustomDomain(domainsList[0]);
                } else {
                    setSelectedDomainOption('new');
                    setCustomDomain('');
                }
            } catch (e) {
                console.warn("Could not load existing redirects", e);
            }
        };
        fetchExistingRedirects();
    }, [projectId, engine.name]);

    useEffect(() => {
        const fetchNetworksAndSubnets = async () => {
            if (!projectId) return;
            try {
                // Fetch VPC Networks
                const netRes = await api.listVpcNetworks(projectId).catch(() => ({ items: [] }));
                const networks = (netRes.items || []).map((n: any) => n.name);
                setNetworksList(networks);
                
                if (networks.includes('default')) {
                    setSelectedNetworkOption('default');
                    setVpcNetwork('default');
                } else if (networks.length > 0) {
                    setSelectedNetworkOption(networks[0]);
                    setVpcNetwork(networks[0]);
                } else {
                    setSelectedNetworkOption('custom');
                }

                // Fetch Subnets for the resolved region
                const activeRegion = config.appLocation === 'global' ? 'us-central1' : config.appLocation;
                const subRes = await api.listVpcSubnets(projectId, activeRegion).catch(() => ({ items: [] }));
                const subnets = (subRes.items || []).map((s: any) => s.name);
                setSubnetsList(subnets);

                if (subnets.includes('default')) {
                    setSelectedSubnetOption('default');
                    setVpcSubnet('default');
                } else if (subnets.length > 0) {
                    setSelectedSubnetOption(subnets[0]);
                    setVpcSubnet(subnets[0]);
                } else {
                    setSelectedSubnetOption('custom');
                }
            } catch (e) {
                console.warn("Could not load VPC networks or subnets", e);
            }
        };
        fetchNetworksAndSubnets();
    }, [projectId, config.appLocation]);



    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleDeploy = async () => {
        setIsDeploying(true);
        setError(null);
        setLogs([]);
        setBuildId(null);
        
        try {
            const rawEngineId = engine.name.split('/').pop() || '';
            const cleanEngineId = rawEngineId.replace(/[^a-z0-9-]/g, '').toLowerCase();
            const location = config.appLocation === 'global' ? 'us-central1' : config.appLocation;
            
            const pscCleanSuffix = cleanEngineId.substring(0, 12);
            const cleanNetworkName = vpcNetwork.toLowerCase().replace(/[^a-z0-9]/g, '');
            const pscIpName = `psc-ip-${cleanNetworkName.substring(0, 15)}-${pscCleanSuffix}`.substring(0, 60);
            
            const netSuffix = cleanNetworkName.substring(0, 4);
            const engineSuffix = cleanEngineId.replace(/[^a-z0-9]/g, '').substring(0, 10);
            const pscRuleName = `pscrl${netSuffix}${engineSuffix}`.substring(0, 20);

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

            addLog(`Fetching Vertex AI Search Portal UUID (CID) for engine ${rawEngineId}...`);
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

            const steps = [];

            if (isPrivateMode) {
                // Private Mode & PSC Setup
                addLog("Preparing Cloud Build steps for Private PSC Endpoint & Internal Load Balancer...");
                steps.push({
                    name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                    entrypoint: 'bash',
                    args: ['-c', `
echo "========== STARTING PRIVATE PSC & INTERNAL REDIRECT AUTOMATION =========="
PSC_IP_NAME="${pscIpName}"
PSC_RULE_NAME="${pscRuleName}"
PSC_IP_VAL="${customPscIp}"

if [ "${autoAllocatePscIp}" = "true" ]; then
  echo "1. Allocating dynamic internal IP for Private Service Connect..."
  gcloud compute addresses create $$PSC_IP_NAME \\
      --global \\
      --purpose=PRIVATE_SERVICE_CONNECT \\
      --addresses=10.128.0.100 \\
      --network=${vpcNetwork} || true
  PSC_IP="10.128.0.100"
else
  echo "1. Registering static custom IP $$PSC_IP_VAL for PSC..."
  gcloud compute addresses create $$PSC_IP_NAME \\
      --global \\
      --purpose=PRIVATE_SERVICE_CONNECT \\
      --addresses=$$PSC_IP_VAL \\
      --network=${vpcNetwork} || true
  PSC_IP="$$PSC_IP_VAL"
fi

echo "Resolved PSC IP for internal resolution: $$PSC_IP"

echo "2. Provisioning Private Service Connect Forwarding Rule..."
gcloud compute forwarding-rules create $$PSC_RULE_NAME \\
    --global \\
    --target-google-apis-bundle=${useVpcScBundle ? 'vpc-sc' : 'all-apis'} \\
    --address=$$PSC_IP_NAME \\
    --network=${vpcNetwork} || true

${automatePrivateDns ? `
echo "3. Creating/Checking Private DNS Zones to map Gemini Enterprise to PSC IP..."

# 3.1 googleapis.com Zone
EXISTING_APIS_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:googleapis.com. AND visibility:private" | head -n 1)
if [ -z "$$EXISTING_APIS_ZONE" ]; then
  echo "No existing googleapis.com private zone found. Creating one..."
  gcloud dns managed-zones create ${serviceName}-apis-dns \\
      --dns-name="googleapis.com." \\
      --description="Private zone for googleapis.com via PSC" \\
      --visibility=private \\
      --networks=${vpcNetwork} || true
  APIS_ZONE="${serviceName}-apis-dns"
elif echo "$$EXISTING_APIS_ZONE" | grep -q "^goog-"; then
  echo "Detected read-only Service Directory-backed PSC DNS zone: $$EXISTING_APIS_ZONE. Skipping manual record creation."
  APIS_ZONE=""
else
  echo "Reusing existing googleapis.com private zone: $$EXISTING_APIS_ZONE"
  APIS_ZONE="$$EXISTING_APIS_ZONE"
fi

if [ -n "$$APIS_ZONE" ]; then
  gcloud dns record-sets delete "*.googleapis.com." --type=A --zone="$$APIS_ZONE" || true
  gcloud dns record-sets delete "private.googleapis.com." --type=A --zone="$$APIS_ZONE" || true
  gcloud dns record-sets create "private.googleapis.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$APIS_ZONE" || true

  gcloud dns record-sets delete "*.googleapis.com." --type=CNAME --zone="$$APIS_ZONE" || true
  gcloud dns record-sets create "*.googleapis.com." --rrdatas="private.googleapis.com." --type=CNAME --ttl=300 --zone="$$APIS_ZONE" || true

  gcloud dns record-sets delete "googleapis.com." --type=A --zone="$$APIS_ZONE" || true
  gcloud dns record-sets create "googleapis.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$APIS_ZONE" || true
fi

# 3.2 cloud.google Zone
EXISTING_CLOUD_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:cloud.google. AND visibility:private" | head -n 1)
if [ -z "$$EXISTING_CLOUD_ZONE" ]; then
  echo "No existing cloud.google private zone found. Creating one..."
  gcloud dns managed-zones create ${serviceName}-cloud-dns \\
      --dns-name="cloud.google." \\
      --description="Private zone for cloud.google via PSC" \\
      --visibility=private \\
      --networks=${vpcNetwork} || true
  CLOUD_ZONE="${serviceName}-cloud-dns"
else
  echo "Reusing existing cloud.google private zone: $$EXISTING_CLOUD_ZONE"
  CLOUD_ZONE="$$EXISTING_CLOUD_ZONE"
fi

gcloud dns record-sets delete "*.cloud.google." --type=A --zone="$$CLOUD_ZONE" || true
gcloud dns record-sets create "*.cloud.google." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$CLOUD_ZONE" || true
gcloud dns record-sets delete "cloud.google." --type=A --zone="$$CLOUD_ZONE" || true
gcloud dns record-sets create "cloud.google." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$CLOUD_ZONE" || true

# 3.3 cloud.google.com Zone
EXISTING_COM_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:cloud.google.com. AND visibility:private" | head -n 1)
if [ -z "$$EXISTING_COM_ZONE" ]; then
  echo "No existing cloud.google.com private zone found. Creating one..."
  gcloud dns managed-zones create ${serviceName}-com-dns \\
      --dns-name="cloud.google.com." \\
      --description="Private zone for cloud.google.com via PSC" \\
      --visibility=private \\
      --networks=${vpcNetwork} || true
  COM_ZONE="${serviceName}-com-dns"
else
  echo "Reusing existing cloud.google.com private zone: $$EXISTING_COM_ZONE"
  COM_ZONE="$$EXISTING_COM_ZONE"
fi

gcloud dns record-sets delete "*.cloud.google.com." --type=A --zone="$$COM_ZONE" || true
gcloud dns record-sets create "*.cloud.google.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$COM_ZONE" || true
gcloud dns record-sets delete "cloud.google.com." --type=A --zone="$$COM_ZONE" || true
gcloud dns record-sets create "cloud.google.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$COM_ZONE" || true
` : 'echo "========== SKIPPING PRIVATE DNS AUTOMATION =========="'}

${customDomain ? `
echo "4. Creating Internal Regional Managed Proxy Subnet..."
gcloud compute networks subnets create ${serviceName}-proxy-subnet \\
    --purpose=REGIONAL_MANAGED_PROXY \\
    --role=ACTIVE \\
    --region=${location} \\
    --network=${vpcNetwork} \\
    --range=10.129.0.0/23 || true

echo "5. Creating Regional URL Map for 302 Redirect to Portal..."
cat <<EOF > internal-urlmap.yaml
name: ${serviceName}-internal-map
defaultUrlRedirect:
  hostRedirect: vertexaisearch.cloud.google.com
  pathRedirect: /u/0/home/cid/${widgetConfigId}
  redirectResponseCode: FOUND
EOF

gcloud compute url-maps import ${serviceName}-internal-map \\
    --source=internal-urlmap.yaml \\
    --region=${location} \\
    --quiet || true

echo "6. Creating Regional Target HTTP Proxy..."
gcloud compute target-http-proxies create ${serviceName}-internal-target-proxy \\
    --url-map=${serviceName}-internal-map \\
    --region=${location} || true

echo "7. Creating Regional Forwarding Rule (Internal Managed Load Balancer)..."
gcloud compute forwarding-rules create ${serviceName}-internal-fwd-rule \\
    --load-balancing-scheme=INTERNAL_MANAGED \\
    --network=${vpcNetwork} \\
    --subnet=${vpcSubnet} \\
    --ports=80 \\
    --region=${location} \\
    --target-http-proxy-region=${location} \\
    --target-http-proxy=${serviceName}-internal-target-proxy || true

ILB_IP=$(gcloud compute forwarding-rules describe ${serviceName}-internal-fwd-rule --region=${location} --format="value(IPAddress)")
echo "INTERNAL REDIRECT IP ADDRESS: $$ILB_IP"

echo "8. Provisioning Private DNS Zone for custom domain: ${customDomain}..."
EXISTING_CUSTOM_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:${customDomain}. AND visibility:private" | head -n 1)
if [ -z "$$EXISTING_CUSTOM_ZONE" ]; then
  gcloud dns managed-zones create ${serviceName}-custom-dns \\
      --dns-name="${customDomain}." \\
      --description="Private zone for custom redirect domain" \\
      --visibility=private \\
      --networks=${vpcNetwork} || true
  CUSTOM_ZONE="${serviceName}-custom-dns"
else
  echo "Reusing existing custom private DNS zone: $$EXISTING_CUSTOM_ZONE"
  CUSTOM_ZONE="$$EXISTING_CUSTOM_ZONE"
fi

gcloud dns record-sets delete ${customDomain}. --type=A --zone="$$CUSTOM_ZONE" || true
gcloud dns record-sets create ${customDomain}. --rrdatas=$$ILB_IP --type=A --ttl=300 --zone="$$CUSTOM_ZONE" || true
` : 'echo "========== SKIPPING INTERNAL REDIRECT LOAD BALANCER PROVISIONING (No custom domain specified) =========="'}

echo "========== PRIVATE NETWORK PROVISIONING COMPLETE =========="
`]
                });
            } else {
                // Public redirect setup (existing automation)
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
            <h2 className="text-xl font-bold text-white mb-2">Deploy Redirect & Private Routing URL</h2>
            <p className="text-gray-400 text-sm mb-6">
                Provision a branded redirect URL or private VPC-SC routing for your Gemini Enterprise Assistant.
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

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">
                            Routing Mode
                            <InfoTooltip text="Choose between public redirection or private enterprise deployment with PSC and DNS overrides." />
                        </label>
                        <div className="flex items-center space-x-6 mt-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="routingMode"
                                    checked={!isPrivateMode}
                                    onChange={() => setIsPrivateMode(false)}
                                    className="form-radio h-4 w-4 text-blue-500 border-slate-600 bg-slate-800 focus:ring-blue-500"
                                    disabled={isDeploying}
                                />
                                <span className="text-sm text-gray-300">Public Redirect (Global LB)</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="routingMode"
                                    checked={isPrivateMode}
                                    onChange={() => setIsPrivateMode(true)}
                                    className="form-radio h-4 w-4 text-purple-500 border-slate-600 bg-slate-800 focus:ring-purple-500"
                                    disabled={isDeploying}
                                />
                                <span className="text-sm text-gray-300">Private / VPC-SC (PSC & DNS)</span>
                            </label>
                        </div>

                        {!isPrivateMode ? (
                            <div className="mt-3 p-3 bg-blue-950/40 border border-blue-900/60 rounded-md text-xs text-blue-300 animate-fadeIn">
                                <div className="flex items-start gap-2">
                                    <svg className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div>
                                        <strong>Public Mode:</strong> Resolves domains over the public internet. Suitable for standard setups. For security compliance in perimeters, prefer Private Mode. 
                                        <a href="https://docs.cloud.google.com/gemini/enterprise/docs/private-ui-access" target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:underline inline-flex items-center font-bold">
                                            Learn More
                                            <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 p-3 bg-purple-950/40 border border-purple-900/60 rounded-md text-xs text-purple-300 animate-fadeIn">
                                <div className="flex items-start gap-2">
                                    <svg className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div>
                                        <strong>Private VPC-SC Mode:</strong> Routes all traffic through Private Service Connect (PSC) and Internal Load Balancers inside your VPC. Access is blocked from outside your VPC network (e.g. without VPN). 
                                        <a href="https://docs.cloud.google.com/gemini/enterprise/docs/private-ui-access" target="_blank" rel="noopener noreferrer" className="ml-1 text-purple-400 hover:underline inline-flex items-center font-bold">
                                            Learn More
                                            <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {!isPrivateMode ? (
                        <div className="bg-gray-900 border border-gray-700 rounded-md p-4 space-y-4 mt-6">
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
                                                Redirect Domain
                                            </label>
                                            <select
                                                value={selectedDomainOption}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSelectedDomainOption(val);
                                                    if (val === 'new') {
                                                        setCustomDomain('');
                                                    } else {
                                                        setCustomDomain(val);
                                                    }
                                                }}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
                                                disabled={isDeploying}
                                            >
                                                {existingDomains.map(d => (
                                                    <option key={d} value={d}>Use existing: {d}</option>
                                                ))}
                                                <option value="new">+ Register new domain...</option>
                                            </select>

                                            {selectedDomainOption === 'new' && (
                                                <input
                                                    type="text"
                                                    value={customDomain}
                                                    onChange={(e) => setCustomDomain(e.target.value)}
                                                    placeholder="ai.yourcompany.com"
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    disabled={isDeploying}
                                                />
                                            )}
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
                    ) : (
                        <div className="bg-gray-900 border border-purple-900/40 rounded-md p-4 space-y-4 mt-6">
                            <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">Private VPC & PSC Routing Configuration</h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">VPC Network</label>
                                    <select
                                        value={selectedNetworkOption}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedNetworkOption(val);
                                            if (val !== 'custom') {
                                                setVpcNetwork(val);
                                            } else {
                                                setVpcNetwork('');
                                            }
                                        }}
                                        className="w-full bg-slate-850 border border-slate-750 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none mb-1.5"
                                        disabled={isDeploying}
                                    >
                                        {networksList.map(net => (
                                            <option key={net} value={net}>{net}</option>
                                        ))}
                                        <option value="custom">+ Custom network...</option>
                                    </select>
                                    {selectedNetworkOption === 'custom' && (
                                        <input
                                            type="text"
                                            value={vpcNetwork}
                                            onChange={(e) => setVpcNetwork(e.target.value)}
                                            placeholder="Enter network name"
                                            className="w-full bg-slate-805 border border-slate-750 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
                                            disabled={isDeploying}
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">VPC Subnet (for LB)</label>
                                    <select
                                        value={selectedSubnetOption}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedSubnetOption(val);
                                            if (val !== 'custom') {
                                                setVpcSubnet(val);
                                            } else {
                                                setVpcSubnet('');
                                            }
                                        }}
                                        className="w-full bg-slate-850 border border-slate-750 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none mb-1.5"
                                        disabled={isDeploying}
                                    >
                                        {subnetsList.map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                        <option value="custom">+ Custom subnet...</option>
                                    </select>
                                    {selectedSubnetOption === 'custom' && (
                                        <input
                                            type="text"
                                            value={vpcSubnet}
                                            onChange={(e) => setVpcSubnet(e.target.value)}
                                            placeholder="Enter subnet name"
                                            className="w-full bg-slate-805 border border-slate-750 rounded-md px-2 py-1 text-xs text-white focus:outline-none"
                                            disabled={isDeploying}
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3 pt-2">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoAllocatePscIp}
                                        onChange={(e) => setAutoAllocatePscIp(e.target.checked)}
                                        className="form-checkbox h-4 w-4 text-purple-550 rounded border-slate-600 bg-slate-800"
                                        disabled={isDeploying}
                                    />
                                    <span className="text-xs font-medium text-slate-300 font-sans">Auto-Allocate PSC Endpoint IP Address</span>
                                </label>

                                {!autoAllocatePscIp && (
                                    <div className="pl-6 animate-fadeIn">
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Custom PSC Static IP</label>
                                        <input
                                            type="text"
                                            value={customPscIp}
                                            onChange={(e) => setCustomPscIp(e.target.value)}
                                            placeholder="10.0.0.100"
                                            className="w-full bg-slate-800 border border-slate-750 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                                            disabled={isDeploying}
                                        />
                                    </div>
                                )}

                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useVpcScBundle}
                                        onChange={(e) => setUseVpcScBundle(e.target.checked)}
                                        className="form-checkbox h-4 w-4 text-purple-550 rounded border-slate-600 bg-slate-800"
                                        disabled={isDeploying}
                                    />
                                    <span className="text-xs font-medium text-slate-300">
                                        Use VPC-SC Data Protection Bundle
                                        <InfoTooltip text="Check this only if the target project is protected by a strict VPC Service Controls perimeter and you require the vpc-sc bundle." />
                                    </span>
                                </label>

                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={automatePrivateDns}
                                        onChange={(e) => setAutomatePrivateDns(e.target.checked)}
                                        className="form-checkbox h-4 w-4 text-purple-550 rounded border-slate-600 bg-slate-800"
                                        disabled={isDeploying}
                                    />
                                    <span className="text-xs font-medium text-slate-300 font-sans">Automate Private DNS Zones Configuration</span>
                                </label>
                            </div>

                            <div className="pt-2 border-t border-slate-800">
                                <label className="block text-xs font-medium text-slate-400 mb-1">
                                    Custom Redirect Domain (Optional Private Redirect)
                                    <InfoTooltip text="Choose an existing domain or register a new one to set up an Internal HTTP Redirect Load Balancer in the VPC." />
                                </label>
                                <select
                                    value={selectedDomainOption}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSelectedDomainOption(val);
                                        if (val === 'new') {
                                            setCustomDomain('');
                                        } else {
                                            setCustomDomain(val);
                                        }
                                    }}
                                    className="w-full bg-slate-850 border border-slate-750 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none mb-2"
                                    disabled={isDeploying}
                                >
                                    {existingDomains.map(d => (
                                        <option key={d} value={d}>Use existing: {d}</option>
                                    ))}
                                    <option value="new">+ Register new domain...</option>
                                </select>

                                {selectedDomainOption === 'new' && (
                                    <input
                                        type="text"
                                        value={customDomain}
                                        onChange={(e) => setCustomDomain(e.target.value)}
                                        placeholder="gemini.mycompany.com"
                                        className="w-full bg-slate-800 border border-slate-750 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none"
                                        disabled={isDeploying}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            onClick={handleDeploy}
                            disabled={isDeploying || !serviceName}
                            className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors ${
                                isPrivateMode
                                    ? "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
                                    : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                            }`}
                        >
                            {isDeploying ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Deploying...
                                </span>
                            ) : isPrivateMode ? (
                                "Deploy Private PSC & Redirect"
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
