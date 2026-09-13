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

export interface PrivateModeScriptArgs {
  pscIpName: string;
  pscRuleName: string;
  customPscIp: string;
  autoAllocatePscIp: boolean;
  vpcNetwork: string;
  useVpcScBundle: boolean;
  automatePrivateDns: boolean;
  customDomain: string;
  serviceName: string;
  location: string;
  widgetConfigId: string;
  vpcSubnet: string;
}

export function generatePrivateModeScript({
  pscIpName,
  pscRuleName,
  customPscIp,
  autoAllocatePscIp,
  vpcNetwork,
  useVpcScBundle,
  automatePrivateDns,
  customDomain,
  serviceName,
  location,
  widgetConfigId,
  vpcSubnet,
}: PrivateModeScriptArgs): any {
  return {
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
`],
  };
}

export interface PublicModeScriptArgs {
  serviceName: string;
  customDomain: string;
  widgetConfigId: string;
  automateDNS: boolean;
}

export function generatePublicModeScript({
  serviceName,
  customDomain,
  widgetConfigId,
  automateDNS,
}: PublicModeScriptArgs): any {
  const newZoneName = customDomain.replace(/\./g, '-') + '-zone';
  return {
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
name: $$URL_MAP_NAME
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
`],
  };
}
