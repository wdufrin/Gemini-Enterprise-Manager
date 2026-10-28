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

export type FeatureVisibility = 'GA' | 'PREVIEW' | 'INTERNAL';

export interface FeatureDefinition {
    key: string;
    displayName: string;
    description: string;
    isInverted: boolean;
    category: 'Access & Security' | 'Models & Intelligence' | 'Canvas & UI' | 'Connectors & Grounding' | 'Observability & Analytics';
    /** Rollout & visibility tier across Cloud Console and backend feature registry. */
    visibility: FeatureVisibility;
    /** Optional details on allowlist/flag gating or why a key is internal/unlaunched. */
    visibilityNote?: string;
    isCustom?: boolean;
    /** Optional parent feature key in FEATURE_DEFS that gates this child feature. */
    parentKey?: string;
    /** True when the backend defaults this toggle to FEATURE_STATE_ON when unspecified. */
    defaultOn?: boolean;
    /** Optional caution/warning note shown in the UI tooltip or badge. */
    warning?: string;
}

export const FEATURE_CATEGORIES = ['All', 'Access & Security', 'Models & Intelligence', 'Canvas & UI', 'Connectors & Grounding', 'Observability & Analytics'] as const;

export const FEATURE_VISIBILITY_FILTERS = ['All', 'Customer (GA & Preview)', 'Customer GA Only', 'Preview / Allowlist', 'Internal / Unlaunched'] as const;
export type FeatureVisibilityFilter = typeof FEATURE_VISIBILITY_FILTERS[number];

/**
 * Backend `kLegacyDisableFeatures` pairs (positive key <-> `disable-<key>`).
 * Used to initialize state when an engine only stores one side of the pair and to keep
 * paired keys synchronized on update so `SynchronizeLegacyFeatureToggles` never rejects
 * with `INVALID_ARGUMENT: Conflicting feature toggle states`.
 */
export const LEGACY_DISABLE_FEATURE_KEYS = [
    'agent-sharing',
    'canvas',
    'google-drive-upload',
    'image-generation',
    'multi-agent-orchestration',
    'onedrive-upload',
    'projects',
    'single-agent-orchestration',
    'talk-to-content',
    'video-generation',
    'welcome-emails',
] as const;

/**
 * Legacy or migrated keys that should not be surfaced as unknown "(Custom)" feature cards
 * when present on older Engine payloads.
 */
export const IGNORED_LEGACY_FEATURE_KEYS = new Set<string>([
    'disable-mobile-app-access',
    'enable-qr-code-widget',
    'disable-skills',
    'disable-projects',
    'disable-canvas-workspace',
    'cross-domain-documents',
    ...LEGACY_DISABLE_FEATURE_KEYS,
    ...LEGACY_DISABLE_FEATURE_KEYS.map(k => `disable-${k}`),
]);

export const FEATURE_DEFS: FeatureDefinition[] = [
    // Access & Security
    { key: 'mobile-app-access', displayName: 'Mobile App Access', description: 'Enables mobile app authentication, access on iOS/Android, and the mobile login QR code.', isInverted: false, visibility: 'GA', category: 'Access & Security' },
    { key: 'disable-agent-sharing', displayName: 'Workspace Agent Sharing', description: 'Allows team members to share and discover custom agents across the enterprise workspace.', isInverted: true, visibility: 'GA', category: 'Access & Security' },
    { key: 'agent-sharing-without-admin-approval', displayName: 'Auto-Approve Agent Sharing', description: 'Allows team members to share and publish agents instantly without requiring explicit workspace admin approval. Requires Workspace Agent Sharing.', isInverted: false, visibility: 'GA', parentKey: 'disable-agent-sharing', category: 'Access & Security' },
    { key: 'enable-end-user-sharing-with-groups', displayName: 'End Users Share with Groups', description: 'Allows end users to share custom agents directly with Workforce Identity & Google Groups. Requires Workspace Agent Sharing.', isInverted: false, visibility: 'GA', parentKey: 'disable-agent-sharing', category: 'Access & Security' },
    { key: 'skill-sharing', displayName: 'Workspace Skill Sharing', description: 'Allows team members to share and discover custom skills across the enterprise workspace. Requires Specialized Skills Engine.', isInverted: false, visibility: 'GA', parentKey: 'skills', category: 'Access & Security' },
    { key: 'skill-sharing-without-admin-approval', displayName: 'Auto-Approve Skill Sharing', description: 'Allows team members to share and publish skills instantly without requiring explicit workspace admin approval. Requires Workspace Skill Sharing.', isInverted: false, visibility: 'GA', parentKey: 'skill-sharing', category: 'Access & Security' },
    { key: 'code-extraction', displayName: 'Code Snippet Extraction', description: 'Allows end users to copy, download, and export code snippets from answers in the web app. Disable to prevent code extraction (requires project entitlement to turn off).', isInverted: false, visibility: 'PREVIEW', visibilityNote: 'Allowlisted Preview (GEMINI_ENTERPRISE_CODE_EXTRACTION_TOGGLE)', defaultOn: true, category: 'Access & Security' },
    { key: 'disable-welcome-emails', displayName: 'Automated Welcome Emails', description: 'Sends automated onboarding and welcome emails to new end users upon first login.', isInverted: true, visibility: 'GA', category: 'Access & Security' },

    // Models & Intelligence
    { key: 'model-selector', displayName: 'Dynamic Model Selector', description: 'Enables end users to select between available Gemini models (Flash, Pro, Thinking) in active sessions.', isInverted: false, visibility: 'GA', category: 'Models & Intelligence' },
    { key: 'workflow-agents', displayName: 'Autonomous Workflow Agents', description: 'Allows end users to create and run multi-step workflow sequences. Requires Workspace Agent Gallery.', isInverted: false, visibility: 'GA', parentKey: 'agent-gallery', category: 'Models & Intelligence' },
    { key: 'single-agent-orchestration', displayName: 'Single-Agent Intent Routing', description: 'Enables automated intent classification and routing to specialized single-agent endpoints.', isInverted: false, visibility: 'PREVIEW', visibilityNote: 'Gated in Cloud Console by UCS_ORCHESTRATION_ADMIN_TOGGLE', category: 'Models & Intelligence' },
    { key: 'multi-agent-orchestration', displayName: 'Multi-Agent Coordinator', description: 'Enables multi-agent coordination and cross-agent task delegation for complex enterprise workflows.', isInverted: false, visibility: 'PREVIEW', visibilityNote: 'Gated in Cloud Console by UCS_ORCHESTRATION_PLANNING_ADMIN_TOGGLE', category: 'Models & Intelligence' },
    {
        key: 'sobi',
        displayName: 'Project Sobi (Long-Running Agents)',
        description: 'Enables the Project Sobi experience and asynchronous Long-Running Agent (LRA) / Coworker execution runtime.',
        isInverted: false,
        visibility: 'INTERNAL',
        visibilityNote: 'Backend-only / Sobi-cohort gated (Customer.Config.experience_state)',
        category: 'Models & Intelligence',
        warning: 'One-way lock: Requires Sobi project provisioning. Once enabled on an engine, Sobi cannot be turned off and the engine cannot be deleted.'
    },
    { key: 'skills', displayName: 'Specialized Skills Engine', description: 'Enables users to create and invoke reusable agent skills and plugins.', isInverted: false, visibility: 'GA', category: 'Models & Intelligence' },
    { key: 'agent-scheduling', displayName: 'Scheduled & Recurring Agents (Preview)', description: 'Allows end users to schedule recurring or automated runs for agents.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Registered in feature_keys.textproto; not yet in feature_toggles.textproto or Cloud Console UI', category: 'Models & Intelligence' },
    { key: 'remote-vm', displayName: 'Persistent Agent Environments (Remote VM)', description: 'Allows agent tasks to use a persistent remote virtual machine sandbox for data practitioner and coding use cases.', isInverted: false, visibility: 'PREVIEW', visibilityNote: 'Preview (launch_stage: PREVIEW, gated by sobiFeatures.remoteVm)', category: 'Models & Intelligence' },
    { key: 'personalization-memory', displayName: 'Personalization & Persistent Memory', description: 'Remembers context from past conversations and user preferences to personalize future assistant answers.', isInverted: false, visibility: 'GA', category: 'Models & Intelligence' },
    { key: 'personalization-suggested-highlights', displayName: 'AI Suggested Highlights', description: 'Provides proactive contextual highlights and suggested cards based on user memory. Requires Personalization & Persistent Memory.', isInverted: false, visibility: 'GA', parentKey: 'personalization-memory', category: 'Models & Intelligence' },
    { key: 'bi-directional-audio', displayName: 'Bi-directional Real-Time Audio', description: 'Enables real-time two-way voice conversations with conversational Gemini models.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Unlaunched in Cloud Console (commented out in feature_control.ts)', category: 'Models & Intelligence' },

    // Canvas & UI
    { key: 'speech-to-text', displayName: 'Speech-to-Text (Voice Dictation)', description: 'Enables speech-to-text voice dictation microphone in the Enterprise Web App (served in global, us, and eu).', isInverted: false, visibility: 'PREVIEW', visibilityNote: 'launch_stage: PREVIEW in feature_toggles.textproto (global, us, eu)', category: 'Canvas & UI' },
    { key: 'projects', displayName: 'Projects Workspace', description: 'Enables end users to create, organize, and manage persistent project workspaces in the Enterprise Web App.', isInverted: false, visibility: 'GA', category: 'Canvas & UI' },
    { key: 'agent-gallery', displayName: 'Workspace Agent Gallery', description: 'Shows the enterprise catalog and gallery entry point for published agents (gates No-Code Agent Designer and Workflow Agents).', isInverted: false, visibility: 'GA', category: 'Canvas & UI' },
    { key: 'no-code-agent-builder', displayName: 'No-Code Agent Designer', description: 'Empowers non-technical users to build custom agents inside the web app without writing code. Requires Workspace Agent Gallery.', isInverted: false, visibility: 'GA', parentKey: 'agent-gallery', category: 'Canvas & UI' },
    { key: 'preview-agents', displayName: 'Preview Agents in Gallery', description: 'Lets admins opt end users in to preview agents in the Workspace Agent Gallery that are off by default in Enterprise. Requires Workspace Agent Gallery.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Registered in feature_keys.textproto; not yet in feature_toggles.textproto or Cloud Console UI', parentKey: 'agent-gallery', category: 'Canvas & UI' },
    { key: 'agent-marketplace', displayName: 'Agent Marketplace (Preview)', description: 'Enables discovering and launching partner agents from the Gemini Enterprise Agent Marketplace.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Registered in feature_keys.textproto; not yet in feature_toggles.textproto or Cloud Console UI', category: 'Canvas & UI' },
    { key: 'disable-canvas', displayName: 'Canvas Side-by-Side Editor', description: 'Enables the side-by-side Canvas editor beside chat for creating, editing, and exporting files (gates Canvas Workspace and App Builder).', isInverted: true, visibility: 'GA', category: 'Canvas & UI' },
    { key: 'canvas-workspace', displayName: 'Canvas Interactive Workspace', description: 'Enables Google Workspace editors inside the side-by-side Canvas pane. Requires Canvas Side-by-Side Editor.', isInverted: false, visibility: 'GA', parentKey: 'disable-canvas', category: 'Canvas & UI' },
    { key: 'canvas-app-builder', displayName: 'Canvas App Builder', description: 'Allows end users to build, preview, and iterate on interactive apps inside the Canvas workspace. Requires Canvas Side-by-Side Editor.', isInverted: false, visibility: 'GA', parentKey: 'disable-canvas', category: 'Canvas & UI' },
    { key: 'prompt-gallery', displayName: 'Prompt Template Gallery', description: 'Shows recommended prompt starters and company-wide template libraries in the search interface.', isInverted: false, visibility: 'GA', category: 'Canvas & UI' },
    { key: 'notebook-lm', displayName: 'Gemini Notebook Integration', description: 'Allows users to ground queries against interactive Gemini Notebooks / NotebookLM in the web app (global, us, eu).', isInverted: false, visibility: 'GA', category: 'Canvas & UI' },
    { key: 'in-app-notifications', displayName: 'In-App Notifications & Alerts', description: 'Renders in-app notifications and proactive assistant announcements in the web app.', isInverted: false, visibility: 'PREVIEW', visibilityNote: 'Gated in Cloud Console by GEM_ENT_IN_APP_NOTIFICATIONS_TOGGLE', category: 'Canvas & UI' },
    { key: 'license-tier-badge', displayName: 'Show License Tier Badge', description: "Displays the app's license edition badge (for example, Standard or Plus) in the web app.", isInverted: false, visibility: 'PREVIEW', visibilityNote: 'Gated in Cloud Console by UCS_LICENSE_TIER_BADGE_ADMIN_TOGGLE', defaultOn: true, category: 'Canvas & UI' },
    { key: 'disable-image-generation', displayName: 'Imagen Image Generation', description: 'Allows end users to generate and iterate on images in conversational chat (global, us, eu).', isInverted: true, visibility: 'GA', category: 'Canvas & UI' },
    { key: 'disable-video-generation', displayName: 'Veo Video Generation', description: 'Allows end users to synthesize short video clips directly in chat (global, us).', isInverted: true, visibility: 'GA', category: 'Canvas & UI' },

    // Connectors & Grounding
    { key: 'cross-product-intelligence', displayName: 'Cross-Product Workspace Intelligence', description: 'Shares user context across trusted Google Workspace and connected apps.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Managed via Personalization tab & personalizationConfig in Cloud Console (not on Feature Control tab)', category: 'Connectors & Grounding' },
    { key: 'disable-onedrive-upload', displayName: 'OneDrive Direct File Upload', description: 'Enables users to directly attach and ground documents from Microsoft OneDrive.', isInverted: true, visibility: 'GA', category: 'Connectors & Grounding' },
    { key: 'disable-google-drive-upload', displayName: 'Google Drive Direct File Upload', description: 'Enables users to directly attach and ground documents from Google Drive.', isInverted: true, visibility: 'GA', category: 'Connectors & Grounding' },
    { key: 'disable-talk-to-content', displayName: 'Talk to Content (Document Q&A)', description: 'Allows conversational deep-dives over attached documents with exact source citations.', isInverted: true, visibility: 'GA', category: 'Connectors & Grounding' },
    { key: 'people-search', displayName: 'People & Employee Directory Search', description: 'Allows searching for employees, team members, and role directories within the company.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Default ON in WidgetConfig; no toggle in Cloud Console Feature Control tab', category: 'Connectors & Grounding' },
    { key: 'people-search-org-chart', displayName: 'Org Chart in People Search', description: 'Displays organizational tree charts in people search results. Requires People & Employee Directory Search.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Unlaunched in Cloud Console (commented out in feature_control.ts)', parentKey: 'people-search', category: 'Connectors & Grounding' },

    // Observability & Analytics
    { key: 'feedback', displayName: 'Thumbs Up/Down Quality Feedback', description: 'Collects user response ratings and feedback to monitor agent answer quality.', isInverted: false, visibility: 'INTERNAL', visibilityNote: 'Configured via WidgetConfig.uiSettings.enableQualityFeedback; not in Cloud Console FeatureControlKeys', category: 'Observability & Analytics' },
    { key: 'session-sharing', displayName: 'Conversation Session Sharing', description: 'Allows end users to generate shareable links for assistant conversations.', isInverted: false, visibility: 'GA', category: 'Observability & Analytics' }
];
