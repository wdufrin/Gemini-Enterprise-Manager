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

export interface AgentTool {
  type: "VertexAiSearchTool" | "A2AClientTool";
  dataStoreId?: string;
  url?: string;
  variableName: string;
  displayName?: string;
}

/**
 * SECURITY (task 2.7): who is allowed to invoke a generated Cloud Run service.
 *
 * This replaces the old `allowUnauthenticated: boolean`. A boolean cannot
 * express the three deployments people actually want, and the "off" state of a
 * boolean was never surfaced in most of the generators -- several of them
 * hardcoded `--allow-unauthenticated`, publishing the agent to the entire
 * internet with no opt-out and no warning.
 *
 *   - "authenticated" -> `--no-allow-unauthenticated`. THE DEFAULT. Callers
 *     need `roles/run.invoker`; this is what Gemini Enterprise and other agents
 *     use when they call the service with a service-account identity token.
 *   - "public"        -> `--allow-unauthenticated`. Anyone on the internet can
 *     invoke the service. Explicit opt-in only.
 *   - "iap"           -> `--no-allow-unauthenticated --iap`. Identity-Aware
 *     Proxy in front of the service. IAP is NOT a replacement for removing
 *     unauthenticated access -- Google's own documented command pairs the two
 *     flags -- and it needs manual setup, see `cloudRunAccessNotes`.
 */
export type CloudRunAccessMode = "authenticated" | "public" | "iap";

/**
 * Secure by default. Anything that does not state a mode gets IAM-only access.
 */
export const DEFAULT_CLOUD_RUN_ACCESS: CloudRunAccessMode = "authenticated";

/** Option metadata for the access pickers in the builder/deploy UIs. */
export const CLOUD_RUN_ACCESS_OPTIONS: ReadonlyArray<{
  value: CloudRunAccessMode;
  label: string;
  summary: string;
  /** true for the option that exposes the service to the open internet. */
  dangerous: boolean;
}> = [
  {
    value: "authenticated",
    label: "Authenticated callers only (IAM)",
    summary:
      "Recommended. Only principals holding roles/run.invoker can call the service -- this is what Gemini Enterprise and agent-to-agent calls use.",
    dangerous: false,
  },
  {
    value: "public",
    label: "Public (allow unauthenticated)",
    summary:
      "Anyone on the internet who learns the URL can invoke this agent, with no login. Only choose this for a deliberately public demo.",
    dangerous: true,
  },
  {
    value: "iap",
    label: "Identity-Aware Proxy (IAP)",
    summary:
      "Puts IAP in front of the service for human end users. Requires one-time setup in the Cloud Console; see the notes in the generated files.",
    dangerous: false,
  },
];

/**
 * Never throw: these helpers run on React render paths where a bad value must
 * degrade to the safe mode rather than blank the page.
 */
export const resolveCloudRunAccess = (
  mode?: CloudRunAccessMode | null,
): CloudRunAccessMode =>
  mode === "public" || mode === "iap" || mode === "authenticated"
    ? mode
    : DEFAULT_CLOUD_RUN_ACCESS;

/** The gcloud flags for a mode, ready to splice into a `gcloud run deploy`. */
export const cloudRunAccessFlags = (mode?: CloudRunAccessMode): string => {
  switch (resolveCloudRunAccess(mode)) {
    case "public":
      return "--allow-unauthenticated";
    case "iap":
      // Both flags, deliberately. IAP does not remove unauthenticated access on
      // its own; Google's documented command passes them together.
      return "--no-allow-unauthenticated --iap";
    default:
      return "--no-allow-unauthenticated";
  }
};

/** Human label for a mode, for headings and comment banners. */
export const cloudRunAccessLabel = (mode?: CloudRunAccessMode): string =>
  CLOUD_RUN_ACCESS_OPTIONS.find((o) => o.value === resolveCloudRunAccess(mode))
    ?.label ?? "Authenticated callers only (IAM)";

export interface CloudRunAccessContext {
  serviceName?: string;
  region?: string;
}

/**
 * Plain-text guidance emitted alongside every generated deploy command.
 *
 * Deliberately no `$`, no backticks and no parentheses in the command lines:
 * these strings get embedded in Makefiles, bash heredocs and YAML, and any of
 * those characters would be interpreted by make or the shell.
 */
export const cloudRunAccessNotes = (
  mode?: CloudRunAccessMode,
  ctx: CloudRunAccessContext = {},
): string[] => {
  const service = ctx.serviceName || "SERVICE_NAME";
  const region = ctx.region || "REGION";
  const resolved = resolveCloudRunAccess(mode);

  if (resolved === "public") {
    return [
      "Access: Public. --allow-unauthenticated makes this service callable by",
      "ANYONE on the internet who learns its URL. No login, no IAM check.",
      "To lock it down later, redeploy with --no-allow-unauthenticated.",
    ];
  }

  if (resolved === "iap") {
    return [
      "Access: Identity-Aware Proxy. --iap is paired with",
      "--no-allow-unauthenticated on purpose: IAP does not remove",
      "unauthenticated access by itself. Enabling IAP directly on Cloud Run",
      "protects all ingress paths, including the default run.app URL.",
      "",
      "REQUIRED MANUAL STEPS - this deploy alone is not enough:",
      "1. Grant the IAP service agent permission to invoke the service:",
      `     gcloud run services add-iam-policy-binding ${service} \\`,
      `       --region=${region} \\`,
      "       --member=serviceAccount:service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com \\",
      "       --role=roles/run.invoker",
      "   Replace PROJECT_NUMBER with your project number.",
      "2. First-time IAP enablement in a project that is not in an organization",
      "   requires creating an OAuth client in the Cloud Console. OAuth clients",
      "   cannot be created programmatically, so this command will fail until",
      "   that is done: Console > Security > Identity-Aware Proxy.",
      "3. By default IAP only admits users inside your own organization.",
      "   External users need a custom OAuth client.",
      "4. Grant end users roles/iap.httpsResourceAccessor.",
    ];
  }

  return [
    "Access: Authenticated callers only. Callers need roles/run.invoker and",
    "must present a Google-signed ID token. Grant a caller with:",
    `     gcloud run services add-iam-policy-binding ${service} \\`,
    `       --region=${region} \\`,
    "       --member=serviceAccount:CALLER@PROJECT_ID.iam.gserviceaccount.com \\",
    "       --role=roles/run.invoker",
  ];
};

/**
 * `cloudRunAccessNotes` rendered as a comment block. `prefix` is the comment
 * marker plus indentation for the target file format.
 */
export const cloudRunAccessCommentBlock = (
  mode?: CloudRunAccessMode,
  ctx: CloudRunAccessContext = {},
  prefix = "# ",
): string =>
  cloudRunAccessNotes(mode, ctx)
    .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
    .join("\n");

export interface A2aConfig {
  serviceName: string;
  displayName: string;
  providerOrganization: string;
  model: string;
  region: string;
  memory: string;
  instruction: string;
  /**
   * Replaces the old `allowUnauthenticated: boolean`, whose default was `true`.
   * Omitted means "authenticated" -- see DEFAULT_CLOUD_RUN_ACCESS.
   */
  cloudRunAccess?: CloudRunAccessMode;
  enableCors: boolean;
  useGoogleSearch: boolean;
  tools: AgentTool[];
}

export interface DiscoveryConfig {
  projectId: string;
  location: string;
  collection: string;
  engineId: string;
  dataStoreIds: string;
}

export interface AdkAgentConfig {
  adkVersion?: "1.35.1" | "2.2";
  name: string;
  description: string;
  model: string;
  instruction: string;
  tools: AgentTool[];
  useGoogleSearch: boolean;
  enableOAuth: boolean;
  authId: string;
  allowAdcFallback: boolean;
  enableDiscoveryApi: boolean;
  discoveryConfig: DiscoveryConfig;
  enableBqAnalytics: boolean;
  bqDatasetId: string;
  bqTableId: string;
  enableThinking: boolean;
  thinkingBudget: number;
  thinkingLevel: string;
  enableStreaming: boolean;
  enableBigQueryMcp: boolean;
  enableCodeExecution: boolean;
  enableGraphvizRendering: boolean;
  enableEmailTool: boolean;
  enableSecurityCommandCenterApi: boolean;
  enableRecommenderApi: boolean;
  enableServiceHealthApi: boolean;
  enableNetworkManagementApi: boolean;
  enableCloudAssistApi: boolean;
  enableCloudLoggingApi: boolean;
  enableCloudMonitoringApi: boolean;
  enableCloudRunApi: boolean;
  enableResourceManagerApi: boolean;
  enableAdminActivityApi: boolean;
  enableDatabaseFleetApi: boolean;
  enableCloudLoggingMcp: boolean;
  enableBigtableAdminMcp: boolean;
  enableCloudSqlMcp: boolean;
  enableCloudMonitoringMcp: boolean;
  enableComputeEngineMcp: boolean;
  enableFirestoreMcp: boolean;
  enableGkeMcp: boolean;
  enableResourceManagerMcp: boolean;
  enableSpannerMcp: boolean;
  enableDeveloperKnowledgeMcp: boolean;
  enableMapsGroundingMcp: boolean;
  enableTelemetry: boolean;
  enableMessageLogging: boolean;
  enableEvaluation: boolean;
  enableCiCd: boolean;
  ciCdRunner: "github_actions" | "google_cloud_build" | "none";
  deploymentTarget: "agent_engine" | "cloud_run";
  /**
   * Who may invoke the generated Cloud Run service. Optional so that existing
   * partial configs (starter templates, tests) keep compiling; `undefined`
   * resolves to the secure default, never to public.
   */
  cloudRunAccess?: CloudRunAccessMode;
  githubWifProvider?: string;
  githubServiceAccount?: string;
  enableModelArmor?: boolean;
  modelArmorTemplate?: string;
  customMcpEndpoints: { name: string; url: string }[];
}

export const ADK_TABS = [
  { id: "agent", label: "agent.py" },
  { id: "deploy_re", label: "deploy_re.py" },
  { id: "env", label: ".env" },
  { id: "requirements", label: "requirements.txt" },
  { id: "readme", label: "README.md" },
  { id: "auth", label: "auth.py" },
  { id: "tools", label: "tools.py" },
] as const;

export const A2A_TABS = [
  { id: "main", label: "main.py" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "requirements", label: "requirements.txt" },
  { id: "env", label: "env.yaml" },
] as const;
