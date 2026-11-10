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

import JSZip from "jszip";
import {
  Config,
  RegistrySkill,
  RegistrySkillRevision,
  RegistrySkillFinding,
  RegistrySkillScanResult,
  SkillScanningPolicy,
  ListRegistrySkillsResponse,
  ListRegistrySkillRevisionsResponse,
  ListRegistryFindingsResponse,
} from "../../types";
import {
  buildSkillMarkdownDocument,
  parseSkillMarkdown,
} from "../../utils/skillExportUtils";
import { gapiRequest } from "./core";

export const AGENT_REGISTRY_BASE_URL = "https://agentregistry.googleapis.com";
export const AGENT_REGISTRY_API_VERSION = "v1";

export const VALID_SCANNING_POLICIES: readonly SkillScanningPolicy[] = [
  "ENABLED_BLOCKING",
  "ENABLED_NONBLOCKING",
  "DISABLED",
];

export const MAX_SCAN_SINGLE_FILE_BYTES = 1024 * 1024; // 1 MB per-file scan limit in Agent Registry GA

export interface RegistryOperationPollOptions {
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface LongRunningOperationResponse<T> {
  name?: string;
  done?: boolean;
  response?: T;
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
}

const isRegistryOperation = <T>(
  value: unknown,
): value is LongRunningOperationResponse<T> => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" && candidate.name.includes("/operations/");
};

const formatOperationError = (
  opName: string,
  err: NonNullable<LongRunningOperationResponse<unknown>["error"]>,
): Error => {
  const statusLabel = err.status || (err.code !== undefined ? String(err.code) : "OPERATION_ERROR");
  const message = err.message || JSON.stringify(err);
  return new Error(`Agent Registry operation ${opName} failed (${statusLabel}): ${message}`);
};

export const resolveRegistryOperationIfNeeded = async <T>(
  initialResponse: T | LongRunningOperationResponse<T>,
  projectId: string,
  options?: RegistryOperationPollOptions,
): Promise<T> => {
  if (!isRegistryOperation<T>(initialResponse)) {
    return initialResponse as T;
  }

  const opName = initialResponse.name || "unknown-operation";
  if (initialResponse.error) {
    throw formatOperationError(opName, initialResponse.error);
  }
  if (initialResponse.done === true) {
    return (initialResponse.response ?? (initialResponse as unknown)) as T;
  }

  const pollIntervalMs = options?.pollIntervalMs ?? 1500;
  const maxPollAttempts = options?.maxPollAttempts ?? 20;
  const opResourcePath = opName.startsWith("projects/") ? opName : opName.replace(/^\/+/, "");
  const opUrl = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${opResourcePath}`;

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    if (pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    const polled = await gapiRequest<LongRunningOperationResponse<T>>(opUrl, "GET", projectId);
    if (polled.error) {
      throw formatOperationError(opName, polled.error);
    }
    if (polled.done === true) {
      return (polled.response ?? (polled as unknown)) as T;
    }
  }

  throw new Error(
    `Agent Registry operation ${opName} did not complete after ${maxPollAttempts} polling attempts.`,
  );
};

export const getEffectiveScanningPolicy = (
  skill: Pick<RegistrySkill, "publisher" | "scanningConfig">,
): SkillScanningPolicy | "GOOGLE_VERIFIED" => {
  const explicit = skill.scanningConfig?.policy;
  if (
    explicit === "ENABLED_BLOCKING" ||
    explicit === "ENABLED_NONBLOCKING" ||
    explicit === "DISABLED"
  ) {
    return explicit;
  }
  const pub = (skill.publisher || "").toLowerCase();
  if (pub.includes("cloud.google.com") || pub.includes("discoveryengine.googleapis.com")) {
    return "GOOGLE_VERIFIED";
  }
  // Per Agent Registry v1 GA specification, scanningConfig.policy defaults to ENABLED_BLOCKING when omitted.
  return "ENABLED_BLOCKING";
};

export const listRegistrySkills = async (config: Config): Promise<RegistrySkill[]> => {
  const { projectId, appLocation = "global" } = config;
  const baseUrl = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/projects/${projectId}/locations/${appLocation}/skills`;
  const allSkills: RegistrySkill[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page++) {
    const url = pageToken
      ? `${baseUrl}?pageToken=${encodeURIComponent(pageToken)}`
      : baseUrl;
    const response = await gapiRequest<ListRegistrySkillsResponse>(url, "GET", projectId);
    if (Array.isArray(response?.skills)) {
      allSkills.push(...response.skills);
    }
    if (!response?.nextPageToken) {
      break;
    }
    pageToken = response.nextPageToken;
  }

  return allSkills;
};

export const getRegistrySkill = async (name: string, config: Config): Promise<RegistrySkill> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}`;
  return gapiRequest<RegistrySkill>(url, "GET", projectId);
};

export const createRegistrySkill = async (
  payload: Partial<RegistrySkill>,
  config: Config,
  skillId?: string,
  pollOptions?: RegistryOperationPollOptions,
): Promise<RegistrySkill> => {
  const { projectId, appLocation = "global" } = config;
  const queryParam = skillId ? `?skillId=${encodeURIComponent(skillId)}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/projects/${projectId}/locations/${appLocation}/skills${queryParam}`;
  const raw = await gapiRequest<RegistrySkill | LongRunningOperationResponse<RegistrySkill>>(
    url,
    "POST",
    projectId,
    undefined,
    payload,
  );
  return resolveRegistryOperationIfNeeded<RegistrySkill>(raw, projectId, pollOptions);
};

export const updateRegistrySkill = async (
  name: string,
  payload: Partial<RegistrySkill>,
  updateMask: string[],
  config: Config,
  pollOptions?: RegistryOperationPollOptions,
): Promise<RegistrySkill> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const mask = updateMask.length > 0 ? `?updateMask=${updateMask.join(",")}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}${mask}`;
  const raw = await gapiRequest<RegistrySkill | LongRunningOperationResponse<RegistrySkill>>(
    url,
    "PATCH",
    projectId,
    undefined,
    payload,
  );
  return resolveRegistryOperationIfNeeded<RegistrySkill>(raw, projectId, pollOptions);
};

export const updateRegistrySkillScanningPolicy = async (
  skillName: string,
  policy: SkillScanningPolicy,
  config: Config,
  pollOptions?: RegistryOperationPollOptions,
): Promise<RegistrySkill> => {
  if (!VALID_SCANNING_POLICIES.includes(policy)) {
    throw new Error(
      `Invalid skill scanning policy "${String(policy)}". Expected one of: ${VALID_SCANNING_POLICIES.join(", ")}.`,
    );
  }
  return updateRegistrySkill(
    skillName,
    { scanningConfig: { policy } },
    ["scanningConfig"],
    config,
    pollOptions,
  );
};

export const deleteRegistrySkill = async (
  name: string,
  config: Config,
  pollOptions?: RegistryOperationPollOptions,
): Promise<Record<string, unknown>> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}`;
  const raw = await gapiRequest<
    Record<string, unknown> | LongRunningOperationResponse<Record<string, unknown>>
  >(url, "DELETE", projectId);
  return resolveRegistryOperationIfNeeded<Record<string, unknown>>(raw, projectId, pollOptions);
};

export const listRegistrySkillRevisions = async (
  skillName: string,
  config: Config,
): Promise<RegistrySkillRevision[]> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = skillName.startsWith("projects/")
    ? skillName
    : `projects/${projectId}/locations/${appLocation}/skills/${skillName}`;
  const baseUrl = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}/revisions`;
  const allRevisions: RegistrySkillRevision[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page++) {
    const url = pageToken
      ? `${baseUrl}?pageToken=${encodeURIComponent(pageToken)}`
      : baseUrl;
    const response = await gapiRequest<ListRegistrySkillRevisionsResponse>(url, "GET", projectId);
    if (Array.isArray(response?.skillRevisions)) {
      allRevisions.push(...response.skillRevisions);
    }
    if (!response?.nextPageToken) {
      break;
    }
    pageToken = response.nextPageToken;
  }

  return allRevisions;
};

export const getRegistrySkillRevision = async (
  revisionName: string,
  config: Config,
): Promise<RegistrySkillRevision> => {
  if (!revisionName || !revisionName.includes("/revisions/")) {
    throw new Error(
      `Invalid skill revision resource name "${String(revisionName)}". Expected projects/{project}/locations/{location}/skills/{skill}/revisions/{revision}.`,
    );
  }
  const { projectId } = config;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${revisionName}`;
  return gapiRequest<RegistrySkillRevision>(url, "GET", projectId);
};

export const createRegistrySkillRevision = async (
  skillName: string,
  payload: Partial<RegistrySkillRevision> | Record<string, unknown>,
  config: Config,
  revisionId?: string,
  pollOptions?: RegistryOperationPollOptions,
): Promise<RegistrySkillRevision> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = skillName.startsWith("projects/")
    ? skillName
    : `projects/${projectId}/locations/${appLocation}/skills/${skillName}`;
  const queryParam = revisionId ? `?skillRevisionId=${encodeURIComponent(revisionId)}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}/revisions${queryParam}`;
  const raw = await gapiRequest<
    RegistrySkillRevision | LongRunningOperationResponse<RegistrySkillRevision>
  >(url, "POST", projectId, undefined, payload);
  return resolveRegistryOperationIfNeeded<RegistrySkillRevision>(raw, projectId, pollOptions);
};

export const listRegistryFindings = async (
  config: Config,
  filter?: string,
): Promise<RegistrySkillFinding[]> => {
  const { projectId, appLocation = "global" } = config;
  const baseUrl = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/projects/${projectId}/locations/${appLocation}/findings`;
  const allFindings: RegistrySkillFinding[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams();
    if (filter && filter.trim()) {
      params.set("filter", filter.trim());
    }
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const qs = params.toString();
    const url = qs ? `${baseUrl}?${qs}` : baseUrl;
    const response = await gapiRequest<ListRegistryFindingsResponse>(url, "GET", projectId);
    if (Array.isArray(response?.findings)) {
      allFindings.push(...response.findings);
    }
    if (!response?.nextPageToken) {
      break;
    }
    pageToken = response.nextPageToken;
  }

  return allFindings;
};

export const getRegistryFinding = async (
  findingName: string,
  config: Config,
): Promise<RegistrySkillFinding> => {
  if (!findingName || !findingName.includes("/findings/")) {
    throw new Error(
      `Invalid finding resource name "${String(findingName)}". Expected projects/{project}/locations/{location}/findings/{finding}.`,
    );
  }
  const { projectId } = config;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${findingName}`;
  return gapiRequest<RegistrySkillFinding>(url, "GET", projectId);
};

export interface ScanSkillMarkdownParams {
  skillKey: string;
  displayName: string;
  description?: string;
  markdownContent: string;
  cleanupAfterScan?: boolean;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export interface ScanSkillMarkdownVerdict {
  skillResourceName: string;
  revisionName: string;
  scanResult: RegistrySkillScanResult;
  findings: RegistrySkillFinding[];
  cleanedUp: boolean;
}

const TERMINAL_SCAN_STATES = new Set([
  "SUCCEEDED",
  "FAILED",
  "UNSUPPORTED_FORMAT",
  "DISABLED",
]);

/**
 * Packages a Gemini Enterprise SKILL.md instruction document into an isolated,
 * disabled staging skill in Cloud Agent Registry (v1) with `ENABLED_BLOCKING`
 * scanning, waits for the LLM security scan to reach a terminal state, and
 * retrieves line-level `Finding` resources before cleaning up the staging skill.
 */
export const scanSkillMarkdownViaRegistry = async (
  params: ScanSkillMarkdownParams,
  config: Config,
): Promise<ScanSkillMarkdownVerdict> => {
  const trimmedKey = (params.skillKey || "").trim();
  if (!trimmedKey) {
    throw new Error("Skill key is required to run an Agent Registry security scan.");
  }

  const trimmedMd = (params.markdownContent || "").trim();
  if (!trimmedMd) {
    throw new Error("SKILL.md content cannot be empty when running a security scan.");
  }

  const byteLen = new TextEncoder().encode(trimmedMd).length;
  if (byteLen > MAX_SCAN_SINGLE_FILE_BYTES) {
    throw new Error(
      `SKILL.md size (${byteLen} bytes) exceeds the 1 MB (${MAX_SCAN_SINGLE_FILE_BYTES} bytes) single-file scanning limit enforced by Cloud Agent Registry.`,
    );
  }

  const sanitizedKey = trimmedKey
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "skill";

  let normalizedSkillMd: string;
  const parsed = parseSkillMarkdown(trimmedMd);
  if (parsed.hasFrontmatter) {
    normalizedSkillMd = buildSkillMarkdownDocument({
      name: parsed.name || sanitizedKey,
      description:
        parsed.description || params.description || params.displayName || sanitizedKey,
      body: parsed.body,
    });
  } else {
    normalizedSkillMd = buildSkillMarkdownDocument({
      name: sanitizedKey,
      description: params.description || params.displayName || sanitizedKey,
      body: trimmedMd,
    });
  }

  const zip = new JSZip();
  zip.file("SKILL.md", normalizedSkillMd);
  const b64Zip = await zip.generateAsync({ type: "base64" });

  const { projectId, appLocation = "global" } = config;
  const stagingSkillId = `gem-scan-${sanitizedKey}`;
  const fallbackSkillResourceName = `projects/${projectId}/locations/${appLocation}/skills/private-${stagingSkillId}`;
  const pollOpts: RegistryOperationPollOptions = {
    pollIntervalMs: params.pollIntervalMs ?? 1500,
    maxPollAttempts: params.maxPollAttempts ?? 20,
  };

  let skillResourceName = fallbackSkillResourceName;
  let targetRevisionName = "";

  try {
    const created = await createRegistrySkill(
      {
        displayName: `[Security Audit] ${params.displayName || sanitizedKey}`.slice(0, 64),
        description:
          params.description ||
          `Temporary governance security scan for Gemini Enterprise skill ${sanitizedKey}.`,
        type: "SIMPLE",
        targetState: "TARGET_STATE_DISABLED",
        scanningConfig: {
          policy: "ENABLED_BLOCKING",
        },
        initialRevision: {
          archiveUploadSource: {
            archiveContent: b64Zip,
          },
        },
      },
      config,
      stagingSkillId,
      pollOpts,
    );
    if (created?.name && created.name.includes("/skills/")) {
      skillResourceName = created.name;
    }
    if (created?.defaultRevision && created.defaultRevision.includes("/revisions/")) {
      targetRevisionName = created.defaultRevision;
    }
  } catch (createErr: unknown) {
    const msg = createErr instanceof Error ? createErr.message : String(createErr);
    const isAlreadyExists =
      msg.includes("409") ||
      msg.includes("ALREADY_EXISTS") ||
      msg.toLowerCase().includes("already exists");
    if (!isAlreadyExists) {
      throw createErr;
    }
    await updateRegistrySkillScanningPolicy(
      skillResourceName,
      "ENABLED_BLOCKING",
      config,
      pollOpts,
    );
    const createdRev = await createRegistrySkillRevision(
      skillResourceName,
      {
        archiveUploadSource: {
          archiveContent: b64Zip,
        },
      },
      config,
      undefined,
      pollOpts,
    );
    if (createdRev?.name && createdRev.name.includes("/revisions/")) {
      targetRevisionName = createdRev.name;
    }
  }

  const pollIntervalMs = params.pollIntervalMs ?? 2000;
  const maxPollAttempts = params.maxPollAttempts ?? 20;
  let latestRevision: RegistrySkillRevision | undefined;

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    if (!targetRevisionName) {
      const revs = await listRegistrySkillRevisions(skillResourceName, config);
      if (revs.length > 0) {
        const sorted = [...revs].sort((a, b) =>
          (b.createTime || "").localeCompare(a.createTime || ""),
        );
        latestRevision = sorted[0];
        targetRevisionName = latestRevision.name;
      }
    } else {
      latestRevision = await getRegistrySkillRevision(targetRevisionName, config);
    }

    const scanState = latestRevision?.scanResult?.scanState;
    if (scanState && TERMINAL_SCAN_STATES.has(scanState)) {
      break;
    }

    if (pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  if (!latestRevision || !targetRevisionName) {
    throw new Error(
      `Agent Registry created staging skill ${skillResourceName}, but no skill revision could be located for scanning.`,
    );
  }

  const scanResult: RegistrySkillScanResult = latestRevision.scanResult || {
    scanState: "RUNNING",
  };

  if (!scanResult.scanState || !TERMINAL_SCAN_STATES.has(scanResult.scanState)) {
    throw new Error(
      `Agent Registry security scan for ${targetRevisionName} is still ${scanResult.scanState || "RUNNING"} after ${maxPollAttempts} polling attempts.`,
    );
  }

  let findings: RegistrySkillFinding[] = [];
  if (
    (scanResult.findings && scanResult.findings.length > 0) ||
    scanResult.scanState === "SUCCEEDED"
  ) {
    findings = await listRegistryFindings(config, `resource="${targetRevisionName}"`);
  }

  let cleanedUp = false;
  if (params.cleanupAfterScan !== false) {
    try {
      await deleteRegistrySkill(skillResourceName, config, pollOpts);
      cleanedUp = true;
    } catch (cleanupErr: unknown) {
      console.warn(
        `Non-fatal: could not delete temporary scan staging skill ${skillResourceName}:`,
        cleanupErr,
      );
      cleanedUp = false;
    }
  }

  return {
    skillResourceName,
    revisionName: targetRevisionName,
    scanResult,
    findings,
    cleanedUp,
  };
};
