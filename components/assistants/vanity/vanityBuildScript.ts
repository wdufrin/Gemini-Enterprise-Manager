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

/**
 * Shared bash preamble for the generated Cloud Build steps.
 *
 * These scripts used to terminate every gcloud call with `|| true`. That made
 * the build step exit 0 no matter what happened, so a run that failed to
 * create the SSL certificate, the forwarding rule and the DNS record still
 * reported success -- the operator only discovered the redirect did not exist
 * when a user hit the domain. `|| true` cannot simply be deleted, because
 * these scripts are legitimately re-runnable and an "already exists" error is
 * an expected outcome on a second run.
 *
 * The two helpers below draw that distinction explicitly: a benign error is
 * classified and logged, anything else increments FAILURES. The caller ends
 * with `emitSummary()` which exits non-zero if FAILURES > 0.
 *
 * NOTE: `$$` is Cloud Build's escape for a literal `$`, so `$$1` reaches bash
 * as `$1`.
 */
const SHELL_HELPERS = `
FAILURES=0
CREATED=0
EXISTS=0
SKIPPED=0

# Provisioning call. "Already exists" is expected when re-running against a
# partially provisioned project; every other non-zero exit is a real failure.
provision_resource() {
  local res_type="$$1"
  local res_name="$$2"
  shift 2
  echo "Provisioning $$res_type: $$res_name..."
  local out
  if out=$$("$$@" 2>&1); then
    echo "[CREATED] $$res_type: $$res_name"
    CREATED=$$((CREATED + 1))
  elif echo "$$out" | grep -qE "already exists|ALREADY_EXISTS|alreadyExists"; then
    echo "[EXISTS] $$res_type $$res_name is already present, continuing"
    EXISTS=$$((EXISTS + 1))
  else
    echo "[FAILED] Could not provision $$res_type $$res_name:" >&2
    echo "$$out" >&2
    FAILURES=$$((FAILURES + 1))
  fi
}

# Removal of a record that may legitimately not exist yet -- used to clear a
# stale value before writing the new one. Only NOT_FOUND is tolerated.
delete_if_present() {
  local res_type="$$1"
  local res_name="$$2"
  shift 2
  local out
  if out=$$("$$@" 2>&1); then
    echo "[DELETED] stale $$res_type: $$res_name"
  elif echo "$$out" | grep -qE "was not found|NOT_FOUND|notFound|could not be found|does not exist"; then
    echo "[SKIPPED] $$res_type $$res_name is not present"
    SKIPPED=$$((SKIPPED + 1))
  else
    echo "[FAILED] Could not delete $$res_type $$res_name:" >&2
    echo "$$out" >&2
    FAILURES=$$((FAILURES + 1))
  fi
}

# Record a failure that is detected by inspection rather than by exit code
# (for example an empty IP address returned by a describe call).
fail_step() {
  echo "[FAILED] $$1" >&2
  FAILURES=$$((FAILURES + 1))
}
`;

/**
 * Terminal summary. Exits 1 when anything failed so Cloud Build marks the
 * build FAILURE and the caller's build-status poll surfaces it to the user.
 */
const emitSummary = (label: string): string => `
echo "--------------------------------------------------"
echo "${label} summary: created=$$CREATED, already-present=$$EXISTS, skipped=$$SKIPPED, failures=$$FAILURES"
if [ "$$FAILURES" -gt 0 ]; then
  echo "ERROR: ${label} finished with $$FAILURES failure(s). The deployment is INCOMPLETE and the redirect will not work." >&2
  exit 1
fi
`;

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
${SHELL_HELPERS}
if [ "${autoAllocatePscIp}" = "true" ]; then
  echo "1. Allocating dynamic internal IP for Private Service Connect..."
  provision_resource "PSC address" "$$PSC_IP_NAME" \\
      gcloud compute addresses create "$$PSC_IP_NAME" \\
      --global \\
      --purpose=PRIVATE_SERVICE_CONNECT \\
      --addresses=10.128.0.100 \\
      --network=${vpcNetwork}
  PSC_IP="10.128.0.100"
else
  echo "1. Registering static custom IP $$PSC_IP_VAL for PSC..."
  provision_resource "PSC address" "$$PSC_IP_NAME" \\
      gcloud compute addresses create "$$PSC_IP_NAME" \\
      --global \\
      --purpose=PRIVATE_SERVICE_CONNECT \\
      --addresses="$$PSC_IP_VAL" \\
      --network=${vpcNetwork}
  PSC_IP="$$PSC_IP_VAL"
fi

echo "Resolved PSC IP for internal resolution: $$PSC_IP"

echo "2. Provisioning Private Service Connect Forwarding Rule..."
provision_resource "PSC forwarding rule" "$$PSC_RULE_NAME" \\
    gcloud compute forwarding-rules create "$$PSC_RULE_NAME" \\
    --global \\
    --target-google-apis-bundle=${useVpcScBundle ? 'vpc-sc' : 'all-apis'} \\
    --address="$$PSC_IP_NAME" \\
    --network=${vpcNetwork}

${automatePrivateDns ? `
echo "3. Creating/Checking Private DNS Zones to map Gemini Enterprise to PSC IP..."

# 3.1 googleapis.com Zone
EXISTING_APIS_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:googleapis.com. AND visibility:private" | head -n 1)
if [ -z "$$EXISTING_APIS_ZONE" ]; then
  echo "No existing googleapis.com private zone found. Creating one..."
  provision_resource "DNS zone" "${serviceName}-apis-dns" \\
      gcloud dns managed-zones create ${serviceName}-apis-dns \\
      --dns-name="googleapis.com." \\
      --description="Private zone for googleapis.com via PSC" \\
      --visibility=private \\
      --networks=${vpcNetwork}
  APIS_ZONE="${serviceName}-apis-dns"
elif echo "$$EXISTING_APIS_ZONE" | grep -q "^goog-"; then
  echo "Detected read-only Service Directory-backed PSC DNS zone: $$EXISTING_APIS_ZONE. Skipping manual record creation."
  APIS_ZONE=""
else
  echo "Reusing existing googleapis.com private zone: $$EXISTING_APIS_ZONE"
  APIS_ZONE="$$EXISTING_APIS_ZONE"
fi

if [ -n "$$APIS_ZONE" ]; then
  delete_if_present "A record" "*.googleapis.com." \\
      gcloud dns record-sets delete "*.googleapis.com." --type=A --zone="$$APIS_ZONE" --quiet
  delete_if_present "A record" "private.googleapis.com." \\
      gcloud dns record-sets delete "private.googleapis.com." --type=A --zone="$$APIS_ZONE" --quiet
  provision_resource "A record" "private.googleapis.com." \\
      gcloud dns record-sets create "private.googleapis.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$APIS_ZONE"

  delete_if_present "CNAME record" "*.googleapis.com." \\
      gcloud dns record-sets delete "*.googleapis.com." --type=CNAME --zone="$$APIS_ZONE" --quiet
  provision_resource "CNAME record" "*.googleapis.com." \\
      gcloud dns record-sets create "*.googleapis.com." --rrdatas="private.googleapis.com." --type=CNAME --ttl=300 --zone="$$APIS_ZONE"

  delete_if_present "A record" "googleapis.com." \\
      gcloud dns record-sets delete "googleapis.com." --type=A --zone="$$APIS_ZONE" --quiet
  provision_resource "A record" "googleapis.com." \\
      gcloud dns record-sets create "googleapis.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$APIS_ZONE"
fi

# 3.2 cloud.google Zone
EXISTING_CLOUD_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:cloud.google. AND visibility:private" | head -n 1)
if [ -z "$$EXISTING_CLOUD_ZONE" ]; then
  echo "No existing cloud.google private zone found. Creating one..."
  provision_resource "DNS zone" "${serviceName}-cloud-dns" \\
      gcloud dns managed-zones create ${serviceName}-cloud-dns \\
      --dns-name="cloud.google." \\
      --description="Private zone for cloud.google via PSC" \\
      --visibility=private \\
      --networks=${vpcNetwork}
  CLOUD_ZONE="${serviceName}-cloud-dns"
else
  echo "Reusing existing cloud.google private zone: $$EXISTING_CLOUD_ZONE"
  CLOUD_ZONE="$$EXISTING_CLOUD_ZONE"
fi

delete_if_present "A record" "*.cloud.google." \\
    gcloud dns record-sets delete "*.cloud.google." --type=A --zone="$$CLOUD_ZONE" --quiet
provision_resource "A record" "*.cloud.google." \\
    gcloud dns record-sets create "*.cloud.google." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$CLOUD_ZONE"
delete_if_present "A record" "cloud.google." \\
    gcloud dns record-sets delete "cloud.google." --type=A --zone="$$CLOUD_ZONE" --quiet
provision_resource "A record" "cloud.google." \\
    gcloud dns record-sets create "cloud.google." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$CLOUD_ZONE"

# 3.3 cloud.google.com Zone
EXISTING_COM_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:cloud.google.com. AND visibility:private" | head -n 1)
if [ -z "$$EXISTING_COM_ZONE" ]; then
  echo "No existing cloud.google.com private zone found. Creating one..."
  provision_resource "DNS zone" "${serviceName}-com-dns" \\
      gcloud dns managed-zones create ${serviceName}-com-dns \\
      --dns-name="cloud.google.com." \\
      --description="Private zone for cloud.google.com via PSC" \\
      --visibility=private \\
      --networks=${vpcNetwork}
  COM_ZONE="${serviceName}-com-dns"
else
  echo "Reusing existing cloud.google.com private zone: $$EXISTING_COM_ZONE"
  COM_ZONE="$$EXISTING_COM_ZONE"
fi

delete_if_present "A record" "*.cloud.google.com." \\
    gcloud dns record-sets delete "*.cloud.google.com." --type=A --zone="$$COM_ZONE" --quiet
provision_resource "A record" "*.cloud.google.com." \\
    gcloud dns record-sets create "*.cloud.google.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$COM_ZONE"
delete_if_present "A record" "cloud.google.com." \\
    gcloud dns record-sets delete "cloud.google.com." --type=A --zone="$$COM_ZONE" --quiet
provision_resource "A record" "cloud.google.com." \\
    gcloud dns record-sets create "cloud.google.com." --rrdatas="$$PSC_IP" --type=A --ttl=300 --zone="$$COM_ZONE"
` : 'echo "========== SKIPPING PRIVATE DNS AUTOMATION =========="'}

${customDomain ? `
echo "4. Creating Internal Regional Managed Proxy Subnet..."
provision_resource "proxy subnet" "${serviceName}-proxy-subnet" \\
    gcloud compute networks subnets create ${serviceName}-proxy-subnet \\
    --purpose=REGIONAL_MANAGED_PROXY \\
    --role=ACTIVE \\
    --region=${location} \\
    --network=${vpcNetwork} \\
    --range=10.129.0.0/23

echo "5. Creating Regional URL Map for 302 Redirect to Portal..."
cat <<EOF > internal-urlmap.yaml
name: ${serviceName}-internal-map
defaultUrlRedirect:
  hostRedirect: vertexaisearch.cloud.google.com
  pathRedirect: /u/0/home/cid/${widgetConfigId}
  redirectResponseCode: FOUND
EOF

provision_resource "regional URL map" "${serviceName}-internal-map" \\
    gcloud compute url-maps import ${serviceName}-internal-map \\
    --source=internal-urlmap.yaml \\
    --region=${location} \\
    --quiet

echo "6. Creating Regional Target HTTP Proxy..."
provision_resource "regional target HTTP proxy" "${serviceName}-internal-target-proxy" \\
    gcloud compute target-http-proxies create ${serviceName}-internal-target-proxy \\
    --url-map=${serviceName}-internal-map \\
    --region=${location}

echo "7. Creating Regional Forwarding Rule (Internal Managed Load Balancer)..."
provision_resource "internal forwarding rule" "${serviceName}-internal-fwd-rule" \\
    gcloud compute forwarding-rules create ${serviceName}-internal-fwd-rule \\
    --load-balancing-scheme=INTERNAL_MANAGED \\
    --network=${vpcNetwork} \\
    --subnet=${vpcSubnet} \\
    --ports=80 \\
    --region=${location} \\
    --target-http-proxy-region=${location} \\
    --target-http-proxy=${serviceName}-internal-target-proxy

ILB_IP=$(gcloud compute forwarding-rules describe ${serviceName}-internal-fwd-rule --region=${location} --format="value(IPAddress)" 2>/dev/null)
if [ -z "$$ILB_IP" ]; then
  # Without an IP there is nothing to point the custom domain at. Writing an
  # empty A record would leave the zone in a broken state that looks configured.
  fail_step "Could not resolve the internal load balancer IP for ${serviceName}-internal-fwd-rule; custom domain DNS was not configured."
else
  echo "INTERNAL REDIRECT IP ADDRESS: $$ILB_IP"

  echo "8. Provisioning Private DNS Zone for custom domain: ${customDomain}..."
  EXISTING_CUSTOM_ZONE=$(gcloud dns managed-zones list --format="value(name)" --filter="dnsName:${customDomain}. AND visibility:private" | head -n 1)
  if [ -z "$$EXISTING_CUSTOM_ZONE" ]; then
    provision_resource "DNS zone" "${serviceName}-custom-dns" \\
        gcloud dns managed-zones create ${serviceName}-custom-dns \\
        --dns-name="${customDomain}." \\
        --description="Private zone for custom redirect domain" \\
        --visibility=private \\
        --networks=${vpcNetwork}
    CUSTOM_ZONE="${serviceName}-custom-dns"
  else
    echo "Reusing existing custom private DNS zone: $$EXISTING_CUSTOM_ZONE"
    CUSTOM_ZONE="$$EXISTING_CUSTOM_ZONE"
  fi

  delete_if_present "A record" "${customDomain}." \\
      gcloud dns record-sets delete ${customDomain}. --type=A --zone="$$CUSTOM_ZONE" --quiet
  provision_resource "A record" "${customDomain}." \\
      gcloud dns record-sets create ${customDomain}. --rrdatas="$$ILB_IP" --type=A --ttl=300 --zone="$$CUSTOM_ZONE"
fi
` : 'echo "========== SKIPPING INTERNAL REDIRECT LOAD BALANCER PROVISIONING (No custom domain specified) =========="'}
${emitSummary('Private network provisioning')}
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
${SHELL_HELPERS}
echo "1. Provisioning Managed SSL Certificate for ${customDomain}..."
provision_resource "SSL certificate" "$$CERT_NAME" \\
    gcloud compute ssl-certificates create "$$CERT_NAME" \\
    --domains=${customDomain} \\
    --global

echo "2. Creating URL Map for 302 Redirect to Portal..."
cat <<EOF > urlmap.yaml
name: $$URL_MAP_NAME
defaultUrlRedirect:
  hostRedirect: vertexaisearch.cloud.google.com
  pathRedirect: /u/0/home/cid/${widgetConfigId}
  redirectResponseCode: FOUND
EOF

provision_resource "URL map" "$$URL_MAP_NAME" \\
    gcloud compute url-maps import "$$URL_MAP_NAME" \\
    --source=urlmap.yaml \\
    --global \\
    --quiet

echo "3. Creating Target HTTPS Proxy..."
provision_resource "target HTTPS proxy" "$$PROXY_NAME" \\
    gcloud compute target-https-proxies create "$$PROXY_NAME" \\
    --ssl-certificates="$$CERT_NAME" \\
    --url-map="$$URL_MAP_NAME"

echo "4. Creating Global Forwarding Rule..."
provision_resource "global forwarding rule" "$$FWD_RULE_NAME" \\
    gcloud compute forwarding-rules create "$$FWD_RULE_NAME" \\
    --target-https-proxy="$$PROXY_NAME" \\
    --global \\
    --ports=443 \\
    --network-tier=PREMIUM

IP_ADDRESS=$(gcloud compute forwarding-rules describe "$$FWD_RULE_NAME" --global --format="value(IPAddress)" 2>/dev/null)
if [ -z "$$IP_ADDRESS" ]; then
  fail_step "Could not resolve the public IP for $$FWD_RULE_NAME; the load balancer was not fully provisioned."
else
  echo "PUBLIC IP ADDRESS FOR DNS A-RECORD: $$IP_ADDRESS"
fi

${automateDNS ? `
if [ -z "$$IP_ADDRESS" ]; then
  echo "Skipping Cloud DNS automation because no load balancer IP is available." >&2
else
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
    provision_resource "DNS zone" "${newZoneName}" \\
        gcloud dns managed-zones create ${newZoneName} \\
        --description="Auto-provisioned for ${customDomain}" \\
        --dns-name="${customDomain}." \\
        --visibility="public"
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
  delete_if_present "A record" "${customDomain}." \\
      gcloud dns record-sets delete ${customDomain}. --type=A --zone="$$MATCHING_ZONE" --quiet
  provision_resource "A record" "${customDomain}." \\
      gcloud dns record-sets create ${customDomain}. --rrdatas="$$IP_ADDRESS" --type=A --ttl=300 --zone="$$MATCHING_ZONE"

  echo "========== CLOUD DNS PROVISIONING COMPLETE =========="
fi
` : 'echo "========== SKIPPING CLOUD DNS AUTOMATION (Not Requested) =========="'
}
${emitSummary('Load balancer provisioning')}
echo "========== LOAD BALANCER PROVISIONING COMPLETE =========="
`],
  };
}
