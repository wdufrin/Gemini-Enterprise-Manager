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

import { assertValidGcpResourceName } from "../shellSafety";
import { gapiRequest } from "./core";
import { createCloudBuild } from "./cloudBuild";
import { GlobalForwardingRule, ManagedSslCertificate } from "../../types";

export interface VpcNetwork {
  name: string;
  id?: string;
  [key: string]: unknown;
}

export interface VpcSubnet {
  name: string;
  id?: string;
  ipCidrRange?: string;
  [key: string]: unknown;
}

export interface DnsZone {
  name: string;
  dnsName?: string;
  [key: string]: unknown;
}

export const listGlobalForwardingRules = async (projectId: string): Promise<{ items?: GlobalForwardingRule[] }> => {
  return gapiRequest<{ items?: GlobalForwardingRule[] }>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/forwardingRules`,
    "GET",
    projectId,
  );
};

export const listManagedSslCertificates = async (projectId: string): Promise<{ items?: ManagedSslCertificate[] }> => {
  return gapiRequest<{ items?: ManagedSslCertificate[] }>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/sslCertificates`,
    "GET",
    projectId,
  );
};

export const listVpcNetworks = async (projectId: string): Promise<{ items?: VpcNetwork[] }> => {
  return gapiRequest<{ items?: VpcNetwork[] }>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/networks`,
    "GET",
    projectId,
  );
};

export const listVpcSubnets = async (projectId: string, region: string): Promise<{ items?: VpcSubnet[] }> => {
  return gapiRequest<{ items?: VpcSubnet[] }>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${region}/subnetworks`,
    "GET",
    projectId,
  );
};

export const listAggregatedForwardingRules = async (projectId: string): Promise<{ items?: Record<string, { forwardingRules?: GlobalForwardingRule[] }> }> => {
  return gapiRequest<{ items?: Record<string, { forwardingRules?: GlobalForwardingRule[] }> }>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/forwardingRules`,
    "GET",
    projectId,
  );
};

export const listDnsZones = async (projectId: string): Promise<{ managedZones?: DnsZone[]; items?: DnsZone[] }> => {
  return gapiRequest<{ managedZones?: DnsZone[]; items?: DnsZone[] }>(
    `https://dns.googleapis.com/dns/v1/projects/${projectId}/managedZones`,
    "GET",
    projectId,
  );
};

export const deleteVanityUrl = async (
  projectId: string,
  serviceName: string,
) => {
  // SECURITY (F-01): `serviceName` is interpolated into a `bash -c` script that
  // runs in Cloud Build with the build service account. Validate against the
  // GCP resource-name allowlist so no shell metacharacter can reach the script.
  serviceName = assertValidGcpResourceName(serviceName, "Service name");
  const buildConfig = {
    steps: [
      {
        name: "gcr.io/google.com/cloudsdktool/cloud-sdk",
        entrypoint: "bash",
        args: [
          "-c",
          `
echo "========== STARTING REDIRECT URL & PRIVATE ROUTING INFRASTRUCTURE DISMANTLING =========="
CLEAN_SUFFIX=$$(echo "${serviceName}" | sed 's/assistant-//' | tr -d '_' | tr '[:upper:]' '[:lower:]' | cut -c1-12)
ALPHA_SUFFIX=$$(echo "${serviceName}" | sed 's/assistant-//' | tr -d '_' | tr -d '-' | tr '[:upper:]' '[:lower:]' | cut -c1-14)

FAILURES=0
SKIPPED=0
DELETED=0

teardown_resource() {
  local res_type="$$1"
  local res_name="$$2"
  shift 2
  echo "Dismantling $$res_type: $$res_name..."
  local out
  if out=$$("$$@" 2>&1); then
    echo "[SUCCESS] Deleted $$res_type: $$res_name"
    DELETED=$$((DELETED + 1))
  elif echo "$$out" | grep -qE "was not found|NOT_FOUND|notFound|could not be found"; then
    echo "[SKIPPED] $$res_type $$res_name was not present"
    SKIPPED=$$((SKIPPED + 1))
  else
    echo "[FAILED] Failed to delete $$res_type $$res_name:" >&2
    echo "$$out" >&2
    FAILURES=$$((FAILURES + 1))
  fi
}

# 1. Dismantling Public Global Load Balancer (if exists)
echo "1. Dismantling Global Forwarding Rules and certificates..."
teardown_resource "Forwarding Rule" "${serviceName}-fwd-rule" gcloud compute forwarding-rules delete "${serviceName}-fwd-rule" --global --quiet
teardown_resource "Target HTTPS Proxy" "${serviceName}-https-proxy" gcloud compute target-https-proxies delete "${serviceName}-https-proxy" --global --quiet
teardown_resource "URL Map" "${serviceName}-url-map" gcloud compute url-maps delete "${serviceName}-url-map" --global --quiet
teardown_resource "SSL Certificate" "${serviceName}-cert" gcloud compute ssl-certificates delete "${serviceName}-cert" --global --quiet

# 2. Dismantling Regional Internal Load Balancer (if exists)
echo "2. Dismantling Regional Forwarding Rules and subnets..."
LOCATION="us-central1"
teardown_resource "Internal Forwarding Rule" "${serviceName}-internal-fwd-rule" gcloud compute forwarding-rules delete "${serviceName}-internal-fwd-rule" --region="$$LOCATION" --quiet
teardown_resource "Internal Target HTTP Proxy" "${serviceName}-internal-target-proxy" gcloud compute target-http-proxies delete "${serviceName}-internal-target-proxy" --region="$$LOCATION" --quiet
teardown_resource "Internal URL Map" "${serviceName}-internal-map" gcloud compute url-maps delete "${serviceName}-internal-map" --region="$$LOCATION" --quiet
teardown_resource "Proxy Subnet" "${serviceName}-proxy-subnet" gcloud compute networks subnets delete "${serviceName}-proxy-subnet" --region="$$LOCATION" --quiet

# 3. Dismantling Private Service Connect (PSC) (if exists)
echo "3. Dismantling Private Service Connect (PSC) endpoints and IPs..."
teardown_resource "PSC Forwarding Rule (default)" "pscrldefa$$ALPHA_SUFFIX" gcloud compute forwarding-rules delete "pscrldefa$$ALPHA_SUFFIX" --global --quiet
teardown_resource "PSC Forwarding Rule (testcr)" "pscrltest$$ALPHA_SUFFIX" gcloud compute forwarding-rules delete "pscrltest$$ALPHA_SUFFIX" --global --quiet
teardown_resource "PSC Address (default)" "psc-ip-default-$$CLEAN_SUFFIX" gcloud compute addresses delete "psc-ip-default-$$CLEAN_SUFFIX" --global --quiet
teardown_resource "PSC Address (testcr)" "psc-ip-testcr-$$CLEAN_SUFFIX" gcloud compute addresses delete "psc-ip-testcr-$$CLEAN_SUFFIX" --global --quiet

# 4. Dismantling Cloud DNS Zones (if exists)
echo "4. Dismantling Private DNS Zones..."
teardown_resource "DNS Zone (custom)" "${serviceName}-custom-dns" gcloud dns managed-zones delete "${serviceName}-custom-dns" --quiet
teardown_resource "DNS Zone (apis)" "${serviceName}-apis-dns" gcloud dns managed-zones delete "${serviceName}-apis-dns" --quiet
teardown_resource "DNS Zone (cloud)" "${serviceName}-cloud-dns" gcloud dns managed-zones delete "${serviceName}-cloud-dns" --quiet
teardown_resource "DNS Zone (com)" "${serviceName}-com-dns" gcloud dns managed-zones delete "${serviceName}-com-dns" --quiet

echo "--------------------------------------------------"
echo "Teardown Summary: Deleted=$$DELETED, Skipped=$$SKIPPED, Failures=$$FAILURES"
if [ "$$FAILURES" -gt 0 ]; then
  echo "ERROR: Infrastructure dismantling completed with $$FAILURES failure(s)." >&2
  exit 1
fi

echo "========== INFRASTRUCTURE DISMANTLING COMPLETE =========="
`,
        ],
      },
    ],
  };
  const buildOp = await createCloudBuild(projectId, buildConfig);
  return buildOp.metadata?.build?.id || "unknown";
};
