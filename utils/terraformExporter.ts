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

import {
  Agent,
  AppEngine,
  Assistant,
  Authorization,
  CustomRole,
  DataStore,
} from '../types';

/**
 * Escapes an arbitrary string so it can be safely embedded inside an HCL2
 * double-quoted string literal (`"..."`).
 *
 * Neutralizes:
 * - Backslashes (`\` -> `\\`)
 * - Double quotes (`"` -> `\"`)
 * - Newlines, carriage returns, tabs (`\n`, `\r`, `\t`)
 * - Other ASCII control characters (`0x00`-`0x1f`, `0x7f` -> `\uXXXX`)
 * - HCL2 template interpolations (`${` -> `$${`)
 * - HCL2 template directives (`%{` -> `%%{`)
 *
 * Note: Any sequence of one or more `$` immediately preceding `{` (e.g. `${` or
 * `$${`) has an extra `$` prepended to ensure no odd-run `$$${` can re-arm HCL
 * interpolation. Same for `%` immediately preceding `{`.
 */
export function escapeHclString(value: string): string {
  const str = String(value ?? '');
  let out = '';
  let i = 0;

  while (i < str.length) {
    const ch = str[i];
    const code = str.charCodeAt(i);

    if (ch === '\\') {
      out += '\\\\';
      i += 1;
      continue;
    }

    if (ch === '"') {
      out += '\\"';
      i += 1;
      continue;
    }

    if (ch === '\n') {
      out += '\\n';
      i += 1;
      continue;
    }

    if (ch === '\r') {
      out += '\\r';
      i += 1;
      continue;
    }

    if (ch === '\t') {
      out += '\\t';
      i += 1;
      continue;
    }

    if (code < 0x20 || code === 0x7f) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      i += 1;
      continue;
    }

    // Neutralize any `$...$` run directly followed by `{` so HCL2 never sees an
    // unescaped `${` template interpolation sequence. In HCL2, `$$` followed by
    // `{` emits a literal `${`, while literal `$` characters not followed by `{`
    // are plain characters; encoding intervening `$` beyond the final `$` via
    // `\u0024` guarantees even adversarial `$${...}` or `$$${...}` payloads
    // evaluate strictly as literal characters with zero interpolation.
    if (ch === '$') {
      let runEnd = i;
      while (runEnd < str.length && str[runEnd] === '$') {
        runEnd += 1;
      }
      if (runEnd < str.length && str[runEnd] === '{') {
        const runLen = runEnd - i;
        if (runLen === 1) {
          out += '$${';
        } else {
          out += '\\u0024'.repeat(runLen - 1) + '$${';
        }
        i = runEnd + 1;
        continue;
      }
    }

    if (ch === '%') {
      let runEnd = i;
      while (runEnd < str.length && str[runEnd] === '%') {
        runEnd += 1;
      }
      if (runEnd < str.length && str[runEnd] === '{') {
        const runLen = runEnd - i;
        if (runLen === 1) {
          out += '%%{';
        } else {
          out += '\\u0025'.repeat(runLen - 1) + '%%{';
        }
        i = runEnd + 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Converts an arbitrary string into a valid HCL2 identifier (`[a-z_][a-z0-9_-]*`)
 * suitable for Terraform resource local names.
 */
export function toHclIdentifier(raw: string, fallback: string = 'resource'): string {
  const cleaned = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!cleaned) {
    return fallback;
  }
  if (!/^[a-z_]/.test(cleaned)) {
    return `r_${cleaned}`;
  }
  return cleaned;
}

export interface VanityUrlTerraformParams {
  projectId: string;
  serviceName: string;
  portalCid: string;
  customDomain?: string;
  isPrivateMode?: boolean;
  region?: string;
  automateGLB?: boolean;
  automateDNS?: boolean;
  dnsProjectId?: string;
  existingDnsZoneName?: string;
  vpcNetwork?: string;
  vpcSubnet?: string;
  autoAllocatePscIp?: boolean;
  customPscIp?: string;
  useVpcScBundle?: boolean;
  automatePrivateDns?: boolean;
  /**
   * Explicit opt-in required to create/manage the shared `googleapis.com.`
   * (`*.googleapis.com.`) Private DNS zone so existing Shared VPC PSC routing
   * is never overwritten by default.
   */
  manageSharedGoogleapisDns?: boolean;
  proxySubnetCidr?: string;
}

/**
 * Generates a production-ready Terraform (`main.tf`) configuration for either:
 * - Public Global External HTTPS Load Balancer 302 Redirect + Managed SSL + optional Cloud DNS
 * - Private Service Connect (PSC) endpoint + parameterized Private DNS + optional Regional Internal HTTP Redirect LB
 */
export function generateVanityUrlTerraform(params: VanityUrlTerraformParams): string {
  const safeProject = escapeHclString(params.projectId || 'my-gcp-project');
  const safeService = escapeHclString(params.serviceName || 'gemini-enterprise-portal');
  const safePortalCid = escapeHclString(params.portalCid || 'REPLACE_WITH_PORTAL_CID');
  const safeDomain = escapeHclString((params.customDomain || '').replace(/\.$/, ''));
  const safeRegion = escapeHclString(
    params.region && !['global', 'us', 'eu'].includes(params.region)
      ? params.region
      : 'us-central1'
  );
  const safeDnsProject = escapeHclString(
    (params.dnsProjectId || '').trim() || params.projectId || 'my-gcp-project'
  );
  const safeExistingZone = escapeHclString(params.existingDnsZoneName || '');

  const lines: string[] = [
    '# ==============================================================================',
    '# Gemini Enterprise — Branded Vanity URL & Routing Terraform (main.tf)',
    '# Generated by Gemini Enterprise Manager',
    '# ==============================================================================',
    '',
    'terraform {',
    '  required_version = ">= 1.5.0"',
    '  required_providers {',
    '    google = {',
    '      source  = "hashicorp/google"',
    '      version = ">= 5.35.0"',
    '    }',
    '  }',
    '}',
    '',
    'variable "project_id" {',
    '  description = "Target Google Cloud Project ID hosting Load Balancer / PSC networking"',
    '  type        = string',
    `  default     = "${safeProject}"`,
    '}',
    '',
    'variable "dns_project_id" {',
    '  description = "Google Cloud Project ID hosting Cloud DNS Managed Zones"',
    '  type        = string',
    `  default     = "${safeDnsProject}"`,
    '}',
    '',
    'variable "service_name" {',
    '  description = "Resource name prefix for Load Balancer, SSL, and DNS assets"',
    '  type        = string',
    `  default     = "${safeService}"`,
    '}',
    '',
    'variable "portal_cid" {',
    '  description = "Gemini Enterprise Web App Widget Config ID (CID)"',
    '  type        = string',
    `  default     = "${safePortalCid}"`,
    '}',
    '',
    'provider "google" {',
    '  project = var.project_id',
    `  region  = "${safeRegion}"`,
    '}',
    '',
  ];

  if (!params.isPrivateMode) {
    const publicDomainDefault = safeDomain || 'gemini.example.com';
    const enableDnsDefault = Boolean(params.automateDNS);
    const hasExistingZone = Boolean(params.existingDnsZoneName?.trim());

    lines.push(
      'variable "custom_domain" {',
      '  description = "Public FQDN (without trailing dot) that redirects to Gemini Enterprise"',
      '  type        = string',
      `  default     = "${publicDomainDefault}"`,
      '}',
      '',
      'variable "manage_public_dns" {',
      '  description = "Whether Terraform should manage the Cloud DNS A record for custom_domain"',
      '  type        = bool',
      `  default     = ${enableDnsDefault ? 'true' : 'false'}`,
      '}',
      '',
      'variable "create_public_dns_zone" {',
      '  description = "Set true to create a new public Cloud DNS zone, or false to use existing_dns_zone_name"',
      '  type        = bool',
      `  default     = ${enableDnsDefault && !hasExistingZone ? 'true' : 'false'}`,
      '}',
      '',
      'variable "existing_dns_zone_name" {',
      '  description = "Existing Cloud DNS Managed Zone name when create_public_dns_zone is false"',
      '  type        = string',
      `  default     = "${safeExistingZone}"`,
      '}',
      '',
      '# 1. Static Global Anycast IPv4 Address',
      'resource "google_compute_global_address" "vanity_ip" {',
      '  project = var.project_id',
      '  name    = "${var.service_name}-ip"',
      '}',
      '',
      '# 2. Google-Managed SSL Certificate',
      'resource "google_compute_managed_ssl_certificate" "vanity_cert" {',
      '  project = var.project_id',
      '  name    = "${var.service_name}-cert"',
      '',
      '  managed {',
      '    domains = [var.custom_domain]',
      '  }',
      '}',
      '',
      '# 3. Global URL Map (302 Found Redirect to Gemini Enterprise Portal)',
      'resource "google_compute_url_map" "vanity_redirect_map" {',
      '  project = var.project_id',
      '  name    = "${var.service_name}-url-map"',
      '',
      '  default_url_redirect {',
      '    host_redirect          = "vertexaisearch.cloud.google.com"',
      '    path_redirect          = "/u/0/home/cid/${var.portal_cid}"',
      '    redirect_response_code = "FOUND"',
      '    https_redirect         = true',
      '    strip_query            = false',
      '  }',
      '}',
      '',
      '# 4. Target HTTPS Proxy',
      'resource "google_compute_target_https_proxy" "vanity_https_proxy" {',
      '  project          = var.project_id',
      '  name             = "${var.service_name}-https-proxy"',
      '  url_map          = google_compute_url_map.vanity_redirect_map.id',
      '  ssl_certificates = [google_compute_managed_ssl_certificate.vanity_cert.id]',
      '}',
      '',
      '# 5. Global External HTTPS Forwarding Rule',
      'resource "google_compute_global_forwarding_rule" "vanity_forwarding_rule" {',
      '  project               = var.project_id',
      '  name                  = "${var.service_name}-fwd-rule"',
      '  ip_protocol           = "TCP"',
      '  load_balancing_scheme = "EXTERNAL_MANAGED"',
      '  port_range            = "443"',
      '  ip_address            = google_compute_global_address.vanity_ip.id',
      '  target                = google_compute_target_https_proxy.vanity_https_proxy.id',
      '}',
      '',
      '# 6. Optional Cloud DNS Managed Zone & A Record',
      'resource "google_dns_managed_zone" "vanity_public_zone" {',
      '  count       = var.manage_public_dns && var.create_public_dns_zone ? 1 : 0',
      '  project     = var.dns_project_id',
      '  name        = "${var.service_name}-public-zone"',
      '  dns_name    = "${var.custom_domain}."',
      '  description = "Managed public DNS zone for Gemini Enterprise vanity redirect"',
      '  visibility  = "public"',
      '}',
      '',
      'resource "google_dns_record_set" "vanity_a_record" {',
      '  count        = var.manage_public_dns ? 1 : 0',
      '  project      = var.dns_project_id',
      '  managed_zone = var.create_public_dns_zone ? google_dns_managed_zone.vanity_public_zone[0].name : var.existing_dns_zone_name',
      '  name         = "${var.custom_domain}."',
      '  type         = "A"',
      '  ttl          = 300',
      '  rrdatas      = [google_compute_global_address.vanity_ip.address]',
      '}',
      '',
      'output "vanity_public_ip" {',
      '  description = "Global Anycast IPv4 address for the Vanity HTTPS Load Balancer"',
      '  value       = google_compute_global_address.vanity_ip.address',
      '}',
      '',
      'output "portal_redirect_target" {',
      '  description = "Target Gemini Enterprise Web App URL"',
      '  value       = "https://vertexaisearch.cloud.google.com/u/0/home/cid/${var.portal_cid}"',
      '}'
    );
  } else {
    const safeNetwork = escapeHclString(params.vpcNetwork || 'default');
    const safeSubnet = escapeHclString(params.vpcSubnet || 'default');
    const safePscIp = escapeHclString(params.customPscIp || '10.128.0.100');
    const safeProxyCidr = escapeHclString(params.proxySubnetCidr || '10.129.0.0/23');
    const pscBundle = params.useVpcScBundle ? 'vpc-sc' : 'all-apis';
    const managePortalDns = params.automatePrivateDns !== false;
    const manageSharedGoogleapis = params.manageSharedGoogleapisDns === true;
    const hasCustomDomain = Boolean(safeDomain);

    lines.push(
      'variable "region" {',
      '  description = "GCP region for internal regional proxy & subnet resources"',
      '  type        = string',
      `  default     = "${safeRegion}"`,
      '}',
      '',
      'variable "vpc_network" {',
      '  description = "VPC Network name or self_link for Private Service Connect"',
      '  type        = string',
      `  default     = "${safeNetwork}"`,
      '}',
      '',
      'variable "vpc_subnet" {',
      '  description = "VPC Subnetwork name for Internal Regional Load Balancer"',
      '  type        = string',
      `  default     = "${safeSubnet}"`,
      '}',
      '',
      'variable "psc_ip_address" {',
      '  description = "Internal IPv4 address for the PSC endpoint (leave empty for automatic allocation)"',
      '  type        = string',
      `  default     = "${params.autoAllocatePscIp ? '' : safePscIp}"`,
      '}',
      '',
      'variable "psc_target_bundle" {',
      '  description = "PSC Google APIs target bundle (all-apis or vpc-sc)"',
      '  type        = string',
      `  default     = "${pscBundle}"`,
      '}',
      '',
      'variable "manage_private_portal_dns" {',
      '  description = "Create Private Cloud DNS zones for cloud.google. and cloud.google.com."',
      '  type        = bool',
      `  default     = ${managePortalDns ? 'true' : 'false'}`,
      '}',
      '',
      'variable "manage_shared_googleapis_dns" {',
      '  description = "OPT-IN ONLY: Manage shared googleapis.com. (*.googleapis.com.) Private DNS zone. Keep false in Shared VPCs that already route *.googleapis.com."',
      '  type        = bool',
      `  default     = ${manageSharedGoogleapis ? 'true' : 'false'}`,
      '}',
      '',
      'variable "custom_domain" {',
      '  description = "Optional internal vanity hostname (leave empty to skip internal HTTP redirect LB)"',
      '  type        = string',
      `  default     = "${safeDomain}"`,
      '}',
      '',
      'variable "proxy_only_subnet_cidr" {',
      '  description = "CIDR range for the regional managed proxy subnet when custom_domain is set"',
      '  type        = string',
      `  default     = "${safeProxyCidr}"`,
      '}',
      '',
      'locals {',
      '  vpc_network_self_link = startswith(var.vpc_network, "projects/") || startswith(var.vpc_network, "https://") ? var.vpc_network : "projects/${var.project_id}/global/networks/${var.vpc_network}"',
      '}',
      '',
      '# 1. Private Service Connect (PSC) Internal IP Address',
      'resource "google_compute_global_address" "psc_endpoint_ip" {',
      '  project      = var.project_id',
      '  name         = "${var.service_name}-psc-ip"',
      '  address_type = "INTERNAL"',
      '  purpose      = "PRIVATE_SERVICE_CONNECT"',
      '  network      = local.vpc_network_self_link',
      '  address      = var.psc_ip_address != "" ? var.psc_ip_address : null',
      '}',
      '',
      '# Regional internal address when custom_domain internal redirect LB is enabled',
      'resource "google_compute_address" "internal_redirect_ip" {',
      '  count        = var.custom_domain != "" ? 1 : 0',
      '  project      = var.project_id',
      '  name         = "${var.service_name}-ilb-ip"',
      '  region       = var.region',
      '  subnetwork   = var.vpc_subnet',
      '  address_type = "INTERNAL"',
      '}',
      '',
      '# 2. Global PSC Forwarding Rule to Google APIs Bundle',
      'resource "google_compute_global_forwarding_rule" "psc_google_apis" {',
      '  project               = var.project_id',
      '  name                  = substr(replace("${var.service_name}psc", "-", ""), 0, 20)',
      '  target                = var.psc_target_bundle',
      '  network               = local.vpc_network_self_link',
      '  ip_address            = google_compute_global_address.psc_endpoint_ip.id',
      '  load_balancing_scheme = ""',
      '}',
      '',
      '# 3. Private Cloud DNS for cloud.google. and cloud.google.com.',
      'resource "google_dns_managed_zone" "private_cloud_google" {',
      '  count       = var.manage_private_portal_dns ? 1 : 0',
      '  project     = var.dns_project_id',
      '  name        = "${var.service_name}-cloud-dns"',
      '  dns_name    = "cloud.google."',
      '  description = "Private DNS zone routing cloud.google to PSC"',
      '  visibility  = "private"',
      '',
      '  private_visibility_config {',
      '    networks {',
      '      network_url = local.vpc_network_self_link',
      '    }',
      '  }',
      '}',
      '',
      'resource "google_dns_record_set" "private_cloud_google_wildcard" {',
      '  count        = var.manage_private_portal_dns ? 1 : 0',
      '  project      = var.dns_project_id',
      '  managed_zone = google_dns_managed_zone.private_cloud_google[0].name',
      '  name         = "*.cloud.google."',
      '  type         = "A"',
      '  ttl          = 300',
      '  rrdatas      = [google_compute_global_address.psc_endpoint_ip.address]',
      '}',
      '',
      'resource "google_dns_managed_zone" "private_cloud_google_com" {',
      '  count       = var.manage_private_portal_dns ? 1 : 0',
      '  project     = var.dns_project_id',
      '  name        = "${var.service_name}-com-dns"',
      '  dns_name    = "cloud.google.com."',
      '  description = "Private DNS zone routing cloud.google.com to PSC"',
      '  visibility  = "private"',
      '',
      '  private_visibility_config {',
      '    networks {',
      '      network_url = local.vpc_network_self_link',
      '    }',
      '  }',
      '}',
      '',
      'resource "google_dns_record_set" "private_cloud_google_com_wildcard" {',
      '  count        = var.manage_private_portal_dns ? 1 : 0',
      '  project      = var.dns_project_id',
      '  managed_zone = google_dns_managed_zone.private_cloud_google_com[0].name',
      '  name         = "*.cloud.google.com."',
      '  type         = "A"',
      '  ttl          = 300',
      '  rrdatas      = [google_compute_global_address.psc_endpoint_ip.address]',
      '}',
      '',
      '# 4. Shared googleapis.com. Private DNS Zone (STRICTLY OPT-IN via var.manage_shared_googleapis_dns)',
      'resource "google_dns_managed_zone" "private_googleapis" {',
      '  count       = var.manage_shared_googleapis_dns ? 1 : 0',
      '  project     = var.dns_project_id',
      '  name        = "${var.service_name}-googleapis-dns"',
      '  dns_name    = "googleapis.com."',
      '  description = "Opt-in Private DNS zone routing *.googleapis.com. to PSC"',
      '  visibility  = "private"',
      '',
      '  private_visibility_config {',
      '    networks {',
      '      network_url = local.vpc_network_self_link',
      '    }',
      '  }',
      '}',
      '',
      'resource "google_dns_record_set" "private_googleapis_a" {',
      '  count        = var.manage_shared_googleapis_dns ? 1 : 0',
      '  project      = var.dns_project_id',
      '  managed_zone = google_dns_managed_zone.private_googleapis[0].name',
      '  name         = "private.googleapis.com."',
      '  type         = "A"',
      '  ttl          = 300',
      '  rrdatas      = [google_compute_global_address.psc_endpoint_ip.address]',
      '}',
      '',
      'resource "google_dns_record_set" "private_googleapis_wildcard_cname" {',
      '  count        = var.manage_shared_googleapis_dns ? 1 : 0',
      '  project      = var.dns_project_id',
      '  managed_zone = google_dns_managed_zone.private_googleapis[0].name',
      '  name         = "*.googleapis.com."',
      '  type         = "CNAME"',
      '  ttl          = 300',
      '  rrdatas      = ["private.googleapis.com."]',
      '}',
      '',
      '# 5. Optional Internal Regional Managed HTTP Redirect Load Balancer (when custom_domain != "")',
      'resource "google_compute_subnetwork" "regional_proxy_subnet" {',
      '  count         = var.custom_domain != "" ? 1 : 0',
      '  project       = var.project_id',
      '  name          = "${var.service_name}-proxy-subnet"',
      '  region        = var.region',
      '  network       = local.vpc_network_self_link',
      '  ip_cidr_range = var.proxy_only_subnet_cidr',
      '  purpose       = "REGIONAL_MANAGED_PROXY"',
      '  role          = "ACTIVE"',
      '}',
      '',
      'resource "google_compute_region_url_map" "internal_redirect_map" {',
      '  count   = var.custom_domain != "" ? 1 : 0',
      '  project = var.project_id',
      '  region  = var.region',
      '  name    = "${var.service_name}-internal-map"',
      '',
      '  default_url_redirect {',
      '    host_redirect          = "vertexaisearch.cloud.google.com"',
      '    path_redirect          = "/u/0/home/cid/${var.portal_cid}"',
      '    redirect_response_code = "FOUND"',
      '    https_redirect         = true',
      '    strip_query            = false',
      '  }',
      '}',
      '',
      'resource "google_compute_region_target_http_proxy" "internal_redirect_proxy" {',
      '  count   = var.custom_domain != "" ? 1 : 0',
      '  project = var.project_id',
      '  region  = var.region',
      '  name    = "${var.service_name}-internal-proxy"',
      '  url_map = google_compute_region_url_map.internal_redirect_map[0].id',
      '}',
      '',
      'resource "google_compute_forwarding_rule" "internal_redirect_forwarding_rule" {',
      '  count                 = var.custom_domain != "" ? 1 : 0',
      '  project               = var.project_id',
      '  region                = var.region',
      '  name                  = "${var.service_name}-internal-fwd-rule"',
      '  load_balancing_scheme = "INTERNAL_MANAGED"',
      '  ip_protocol           = "TCP"',
      '  port_range            = "80"',
      '  network               = local.vpc_network_self_link',
      '  subnetwork            = var.vpc_subnet',
      '  ip_address            = google_compute_address.internal_redirect_ip[0].id',
      '  target                = google_compute_region_target_http_proxy.internal_redirect_proxy[0].id',
      '  depends_on            = [google_compute_subnetwork.regional_proxy_subnet]',
      '}',
      '',
      'resource "google_dns_managed_zone" "private_custom_domain_zone" {',
      '  count       = var.custom_domain != "" ? 1 : 0',
      '  project     = var.dns_project_id',
      '  name        = "${var.service_name}-custom-dns"',
      '  dns_name    = "${var.custom_domain}."',
      '  description = "Private DNS zone for internal vanity redirect domain"',
      '  visibility  = "private"',
      '',
      '  private_visibility_config {',
      '    networks {',
      '      network_url = local.vpc_network_self_link',
      '    }',
      '  }',
      '}',
      '',
      'resource "google_dns_record_set" "private_custom_domain_a" {',
      '  count        = var.custom_domain != "" ? 1 : 0',
      '  project      = var.dns_project_id',
      '  managed_zone = google_dns_managed_zone.private_custom_domain_zone[0].name',
      '  name         = "${var.custom_domain}."',
      '  type         = "A"',
      '  ttl          = 300',
      '  rrdatas      = [google_compute_address.internal_redirect_ip[0].address]',
      '}',
      '',
      'output "psc_endpoint_ip" {',
      '  description = "Internal IPv4 address allocated for Private Service Connect"',
      '  value       = google_compute_global_address.psc_endpoint_ip.address',
      '}'
    );

    if (hasCustomDomain) {
      lines.push(
        '',
        'output "internal_redirect_ilb_ip" {',
        '  description = "Internal Regional Load Balancer IPv4 address for custom_domain"',
        '  value       = var.custom_domain != "" ? google_compute_address.internal_redirect_ip[0].address : null',
        '}'
      );
    }
  }

  return lines.join('\n') + '\n';
}

export interface DiscoveryProjectTerraformParams {
  projectId: string;
  location: string;
  collectionId?: string;
  engines?: AppEngine[];
  dataStores?: DataStore[];
  customRoles?: CustomRole[];
  assistants?: Assistant[];
  agents?: Agent[];
  authorizations?: Authorization[];
}

function extractTrailingId(resourceName: string | undefined, fallback: string): string {
  if (!resourceName) return fallback;
  const parts = resourceName.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : fallback;
}

function extractLocation(resourceName: string | undefined, fallbackLocation: string): string {
  if (!resourceName) return fallbackLocation;
  const match = resourceName.match(/locations\/([^/]+)\//);
  return match?.[1] || fallbackLocation;
}

/**
 * Redacts OAuth client secrets before exporting declarative JSON bundles so `.tf`
 * files can be committed safely into version control.
 */
function sanitizeAuthorizationForExport(auth: Authorization): Record<string, unknown> {
  const clone: Record<string, unknown> = {
    name: auth.name,
    ...(auth.displayName ? { displayName: auth.displayName } : {}),
    ...(auth.serverClientId ? { serverClientId: auth.serverClientId } : {}),
  };
  if (auth.serverSideOauth2) {
    clone.serverSideOauth2 = {
      clientId: auth.serverSideOauth2.clientId,
      authorizationUri: auth.serverSideOauth2.authorizationUri,
      tokenUri: auth.serverSideOauth2.tokenUri,
      clientSecret: 'REPLACE_WITH_SECRET_MANAGER_VALUE',
    };
  }
  return clone;
}

/**
 * Exports discovered Gemini Enterprise `AppEngine`s, `DataStore`s, Custom IAM Roles,
 * and a declarative JSON bundle (`local_file`) for Assistants, Agents, and Authorizations
 * whose Discovery Engine v1alpha sub-resources are not yet native in `hashicorp/google`.
 */
export function generateDiscoveryProjectTerraform(
  params: DiscoveryProjectTerraformParams
): string {
  const safeProject = escapeHclString(params.projectId || 'my-gcp-project');
  const defaultLoc = params.location || 'global';
  const safeLocation = escapeHclString(defaultLoc);
  const collectionId = params.collectionId || 'default_collection';
  const safeCollection = escapeHclString(collectionId);

  const engines = params.engines || [];
  const dataStores = params.dataStores || [];
  const customRoles = (params.customRoles || []).filter((r) => !r.deleted);
  const assistants = params.assistants || [];
  const agents = params.agents || [];
  const authorizations = params.authorizations || [];

  const usedIds = new Set<string>();
  const uniqueHclName = (prefix: string, rawId: string): string => {
    const base = toHclIdentifier(`${prefix}_${rawId}`, prefix);
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    let idx = 2;
    while (usedIds.has(`${base}_${idx}`)) {
      idx += 1;
    }
    const candidate = `${base}_${idx}`;
    usedIds.add(candidate);
    return candidate;
  };

  const lines: string[] = [
    '# ==============================================================================',
    '# Gemini Enterprise — Project Infrastructure & Declarative Bundle (main.tf)',
    '# Generated by Gemini Enterprise Manager',
    '# ==============================================================================',
    '',
    'terraform {',
    '  required_version = ">= 1.5.0"',
    '  required_providers {',
    '    google = {',
    '      source  = "hashicorp/google"',
    '      version = ">= 5.35.0"',
    '    }',
    '    local = {',
    '      source  = "hashicorp/local"',
    '      version = ">= 2.5.0"',
    '    }',
    '  }',
    '}',
    '',
    'variable "project_id" {',
    '  description = "Target Google Cloud Project ID"',
    '  type        = string',
    `  default     = "${safeProject}"`,
    '}',
    '',
    'variable "discovery_location" {',
    '  description = "Default Discovery Engine multi-region location (global, us, eu)"',
    '  type        = string',
    `  default     = "${safeLocation}"`,
    '}',
    '',
    'provider "google" {',
    '  project = var.project_id',
    '}',
    '',
  ];

  // 1. DataStores (`google_discovery_engine_data_store`)
  const dsIdToResourceRef = new Map<string, string>();
  if (dataStores.length > 0) {
    lines.push('# ------------------------------------------------------------------------------');
    lines.push('# Grounding Data Stores');
    lines.push('# ------------------------------------------------------------------------------');
    lines.push('');

    for (let i = 0; i < dataStores.length; i++) {
      const ds = dataStores[i];
      const dsId = extractTrailingId(ds.name, `datastore_${i + 1}`);
      const dsLoc = extractLocation(ds.name, defaultLoc);
      const localName = uniqueHclName('ds', dsId);
      dsIdToResourceRef.set(dsId, `google_discovery_engine_data_store.${localName}.data_store_id`);

      const solutions =
        Array.isArray(ds.solutionTypes) && ds.solutionTypes.length > 0
          ? ds.solutionTypes
          : ['SOLUTION_TYPE_SEARCH'];
      const solutionHcl = solutions.map((s) => `"${escapeHclString(s)}"`).join(', ');

      lines.push(
        `resource "google_discovery_engine_data_store" "${localName}" {`,
        '  project                     = var.project_id',
        `  location                    = "${escapeHclString(dsLoc)}"`,
        `  data_store_id               = "${escapeHclString(dsId)}"`,
        `  display_name                = "${escapeHclString(ds.displayName || dsId)}"`,
        `  industry_vertical           = "${escapeHclString(ds.industryVertical || 'GENERIC')}"`,
        `  content_config              = "${escapeHclString(ds.contentConfig || 'NO_CONTENT')}"`,
        `  solution_types              = [${solutionHcl}]`,
        '  create_advanced_site_search = false',
        '}',
        ''
      );
    }
  }

  // 2. AppEngines (`google_discovery_engine_chat_engine` / `google_discovery_engine_search_engine`)
  if (engines.length > 0) {
    lines.push('# ------------------------------------------------------------------------------');
    lines.push('# Gemini Enterprise Engines (Search & Chat Apps)');
    lines.push('# ------------------------------------------------------------------------------');
    lines.push('');

    for (let i = 0; i < engines.length; i++) {
      const eng = engines[i];
      const engId = extractTrailingId(eng.name, `engine_${i + 1}`);
      const engLoc = extractLocation(eng.name, defaultLoc);
      const localName = uniqueHclName('engine', engId);
      const linkedDsRefs = (eng.dataStoreIds || []).map((id) => {
        const ref = dsIdToResourceRef.get(id);
        return ref ? ref : `"${escapeHclString(id)}"`;
      });
      const dsListHcl = linkedDsRefs.join(', ');
      const companyName = escapeHclString(eng.commonConfig?.companyName || 'Enterprise');

      const isChatEngine =
        eng.solutionType === 'SOLUTION_TYPE_CHAT' ||
        Boolean((eng as Record<string, unknown>).chatEngineConfig);

      if (isChatEngine) {
        const chatCfg = ((eng as Record<string, unknown>).chatEngineConfig || {}) as Record<
          string,
          unknown
        >;
        const agentCreation = (chatCfg.agentCreationConfig || {}) as Record<string, unknown>;
        const business = escapeHclString(
          typeof agentCreation.business === 'string' && agentCreation.business
            ? agentCreation.business
            : eng.displayName || 'Enterprise'
        );
        const defaultLang = escapeHclString(
          typeof agentCreation.defaultLanguageCode === 'string' &&
            agentCreation.defaultLanguageCode
            ? agentCreation.defaultLanguageCode
            : 'en'
        );
        const timeZone = escapeHclString(
          typeof agentCreation.timeZone === 'string' && agentCreation.timeZone
            ? agentCreation.timeZone
            : 'America/Los_Angeles'
        );

        lines.push(
          `resource "google_discovery_engine_chat_engine" "${localName}" {`,
          '  project           = var.project_id',
          `  engine_id         = "${escapeHclString(engId)}"`,
          `  collection_id     = "${safeCollection}"`,
          `  location          = "${escapeHclString(engLoc)}"`,
          `  display_name      = "${escapeHclString(eng.displayName || engId)}"`,
          `  industry_vertical = "${escapeHclString(eng.industryVertical || 'GENERIC')}"`,
          `  data_store_ids    = [${dsListHcl}]`,
          '',
          '  common_config {',
          `    company_name = "${companyName}"`,
          '  }',
          '',
          '  chat_engine_config {',
          '    agent_creation_config {',
          `      business              = "${business}"`,
          `      default_language_code = "${defaultLang}"`,
          `      time_zone             = "${timeZone}"`,
          '    }',
          '  }',
          '}',
          ''
        );
      } else {
        const searchTier = escapeHclString(
          eng.searchEngineConfig?.searchTier || 'SEARCH_TIER_ENTERPRISE'
        );
        const addOns =
          Array.isArray(eng.searchEngineConfig?.searchAddOns) &&
          eng.searchEngineConfig!.searchAddOns!.length > 0
            ? eng.searchEngineConfig!.searchAddOns!
            : ['SEARCH_ADD_ON_LLM'];
        const addOnsHcl = addOns.map((a) => `"${escapeHclString(a)}"`).join(', ');

        lines.push(
          `resource "google_discovery_engine_search_engine" "${localName}" {`,
          '  project           = var.project_id',
          `  engine_id         = "${escapeHclString(engId)}"`,
          `  collection_id     = "${safeCollection}"`,
          `  location          = "${escapeHclString(engLoc)}"`,
          `  display_name      = "${escapeHclString(eng.displayName || engId)}"`,
          `  industry_vertical = "${escapeHclString(eng.industryVertical || 'GENERIC')}"`,
          `  data_store_ids    = [${dsListHcl}]`,
          '',
          '  common_config {',
          `    company_name = "${companyName}"`,
          '  }',
          '',
          '  search_engine_config {',
          `    search_tier    = "${searchTier}"`,
          `    search_add_ons = [${addOnsHcl}]`,
          '  }',
          '}',
          ''
        );
      }
    }
  }

  // 3. Custom Restricted IAM Roles (`google_project_iam_custom_role`)
  if (customRoles.length > 0) {
    lines.push('# ------------------------------------------------------------------------------');
    lines.push('# Custom Least-Privilege IAM Roles');
    lines.push('# ------------------------------------------------------------------------------');
    lines.push('');

    for (let i = 0; i < customRoles.length; i++) {
      const role = customRoles[i];
      const roleId = extractTrailingId(
        role.name,
        role.title ? role.title.replace(/[^a-zA-Z0-9_]/g, '_') : `custom_role_${i + 1}`
      );
      const localName = uniqueHclName('role', roleId);
      const perms = (role.includedPermissions || [])
        .map((p) => `    "${escapeHclString(p)}",`)
        .join('\n');

      lines.push(
        `resource "google_project_iam_custom_role" "${localName}" {`,
        '  project     = var.project_id',
        `  role_id     = "${escapeHclString(roleId)}"`,
        `  title       = "${escapeHclString(role.title || roleId)}"`,
        `  description = "${escapeHclString(role.description || '')}"`,
        `  stage       = "${escapeHclString(role.stage || 'GA')}"`,
        '  permissions = [',
        ...(perms ? [perms] : []),
        '  ]',
        '}',
        ''
      );
    }
  }

  // 4. Declarative JSON bundle (`local_file`) for Assistants, Agents, and Authorizations
  if (assistants.length > 0 || agents.length > 0 || authorizations.length > 0) {
    const declarativeBundle = {
      schemaVersion: '1.0',
      projectId: params.projectId,
      location: defaultLoc,
      collectionId,
      assistants: assistants.map((asst) => {
        const cleanAsst: Record<string, unknown> = { ...asst };
        delete cleanAsst.agents;
        return cleanAsst;
      }),
      agents: agents.map((agt) => {
        const cleanAgt: Record<string, unknown> = { ...agt };
        delete cleanAgt.createTime;
        delete cleanAgt.updateTime;
        return cleanAgt;
      }),
      authorizations: authorizations.map(sanitizeAuthorizationForExport),
    };

    const escapedJsonBundle = escapeHclString(JSON.stringify(declarativeBundle, null, 2));

    lines.push('# ------------------------------------------------------------------------------');
    lines.push('# Declarative Discovery Engine v1alpha Bundle (Assistants, Agents, Authorizations)');
    lines.push('# ------------------------------------------------------------------------------');
    lines.push('');
    lines.push('resource "local_file" "gemini_enterprise_declarative_bundle" {');
    lines.push('  filename        = "${path.module}/gemini-enterprise-declarative-bundle.json"');
    lines.push('  file_permission = "0600"');
    lines.push(`  content         = "${escapedJsonBundle}"`);
    lines.push('}');
    lines.push('');
    lines.push('output "declarative_bundle_path" {');
    lines.push(
      '  description = "Path to the exported JSON bundle for Assistants, Registered Agents, and OAuth Authorizations"'
    );
    lines.push('  value       = local_file.gemini_enterprise_declarative_bundle.filename');
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
