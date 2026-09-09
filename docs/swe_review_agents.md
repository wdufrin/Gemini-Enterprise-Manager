# Gemini Enterprise Manager - SWE Expert Reviewer Agents

This document defines the persistent SWE Expert Reviewer Agents configured for forensic code audits of Gemini Enterprise Manager (`GEM`).

These agents are registered globally in `~/.gemini/config/agents/` and backed by the `gem-tab-audit` skill in `~/.gemini/config/skills/gem-tab-audit/SKILL.md`.

---

## Core Operational Directives

### 1. Tabula Rasa (Zero Memory Carryover)
- **Complete Statelessness**: Each agent invocation runs in an isolated, brand-new conversation context.
- **No Reliance on Past Audits**: Agents are strictly forbidden from reading prior audit reports, summaries, or scratch logs. They evaluate the codebase strictly as it exists at the exact moment of invocation.
- **Live Source Verification**: Every claim must be verified by directly reading the live source files (`pages/`, `components/`, `services/`, `App.tsx`, `types.ts`, backend routes) using file inspection tools.
- **Never Assume Fixes**: Agents must never assume an issue was resolved without directly verifying current code lines.

### 2. Radical Honesty & End-User Protection Protocol
- **End-User First**: Gemini Enterprise Manager controls critical enterprise search, agent deployments, access permissions, and data governance. Concealing, downplaying, or sugarcoating defects directly hurts end users and compromises security.
- **Expose All Mocks and Stubs**: If a tab displays hardcoded mock arrays, fake metrics, or in-memory state instead of real GCP APIs (Discovery Engine, Vertex AI, Cloud Logging, BigQuery), it must be prominently exposed as `MOCK / UNCONNECTED`.
- **Zero Hallucinated Passes**: An agent will never declare a feature "production ready" without inspecting its real error handling, authentication, loading states, and edge cases.
- **Flag Swallowed Errors**: Catch blocks that do nothing or log silently to the console without alerting users are classified as critical reliability risks.
- **Strict Separation of Verified vs Inferred**: Clear distinction between verified facts observed in code vs inferences or UI appearances.

---

## Agent Suite Architecture

### Master Auditor
- **`gem-swe-reviewer`**: Master Senior Software Engineer capable of conducting forensic code audits of any individual tab, group of tabs, or the entire application on demand.

### Domain Specialist Reviewers
1. **`gem-agent-management-reviewer`**
   - **Scope**: Agent Manager (`/agent-manager`), Skills Registry (`/skills-registry`), Agent Builder (`/agent-builder`), Catalog (`/catalog`), Engines (`/engines`).
   - **Focus**: GCP Discovery Engine Agent APIs, LC/ADK agent configurations, tool schemas, system instructions, session parameters.

2. **`gem-knowledge-reviewer`**
   - **Scope**: Data Stores (`/data-stores`), GE Quota Usage (`/ge-quota-usage`).
   - **Focus**: Discovery Engine DataStore ingestion pipelines, Cloud Storage buckets, document indexing schemas, GCP Service Usage / Cloud Monitoring quota polling.

3. **`gem-testing-reviewer`**
   - **Scope**: Assistant (`/assistant`), Connectors (`/connectors`), Architecture (`/architecture`).
   - **Focus**: Conversational inference streaming, grounding citations, connector OAuth2 lifecycle (SharePoint, Jira, Drive), dynamic architecture graph rendering.

4. **`gem-security-reviewer`**
   - **Scope**: Authorizations (`/authorizations`), Agent Permissions (`/agent-permissions`), Model Armor (`/model-armor`), Observability (`/observability`).
   - **Focus**: Google Cloud IAM synchronization, RBAC permission matrices, Model Armor safety guardrail APIs (`modelarmor.googleapis.com`), BigQuery log analytics queries, Cloud Logging sink validation.

5. **`gem-system-reviewer`**
   - **Scope**: Backup & Recovery (`/backup-recovery`), Config Audit (`/config-audit`), Licenses (`/licenses`), Vanity URLs (`/vanity-urls`).
   - **Focus**: GCS backup snapshot integrity, configuration drift diff algorithms, Google Workspace / Cloud Identity license syncing, Cloud DNS records and SSL status.

---

## How to Invoke the Reviewers

### 1. Command Shorthand (Instant Execution)
You can simply type:
- `/gemfullaudit`
  - Instantly launches all 5 domain reviewer subagents in parallel across all 18 tabs and generates the consolidated master audit report.
- `/gemaudit [tab-name]`
  - Runs an audit on a specific tab (e.g. `/gemaudit assistant`, `/gemaudit observability`).

### 2. Natural Language Requests
You can also ask in plain English:
- *"Run a full forensic review of the Assistant tab."*
- *"Audit the Observability tab with the security reviewer."*
- *"Run a full forensic audit across all 18 tabs with the SWE reviewer agents."*

### 2. Programmatic Invocation (via `invoke_subagent`)
```json
{
  "Subagents": [
    {
      "TypeName": "gem-swe-reviewer",
      "Role": "Master SWE Tab Auditor",
      "Prompt": "Perform a forensic code audit of the Observability tab (`pages/OperationalAnalyticsDashboard.tsx`). Verify BigQuery queries, log sinks, and filter behaviors. Enforce zero memory and radical honesty."
    }
  ]
}
```

### 3. Parallel Full-App Audit
To audit the entire application simultaneously:
```json
{
  "Subagents": [
    { "TypeName": "gem-agent-management-reviewer", "Role": "Agent Management Auditor", "Prompt": "Audit Agent Manager, Skills Registry, Agent Builder, Catalog, and Engines." },
    { "TypeName": "gem-knowledge-reviewer", "Role": "Knowledge Auditor", "Prompt": "Audit Data Stores and GE Quota Usage." },
    { "TypeName": "gem-testing-reviewer", "Role": "Testing Auditor", "Prompt": "Audit Assistant, Connectors, and Architecture." },
    { "TypeName": "gem-security-reviewer", "Role": "Security Auditor", "Prompt": "Audit Authorizations, Agent Permissions, Model Armor, and Observability." },
    { "TypeName": "gem-system-reviewer", "Role": "System Auditor", "Prompt": "Audit Backup & Recovery, Config Audit, Licenses, and Vanity URLs." }
  ]
}
```

---

## Standard Report Format

Every review generated by these agents adheres to the following structure:
```markdown
### Tab: [Tab Name] (`[Route]`)
- **Primary Component**: `[path/to/Component.tsx]`
- **Integrations & Services**: `[services/apiService.ts, etc.]`
- **Maturity Rating**: [Production Ready | Functional with Caveats | Stubbed Mock | Broken]

#### 1. Verified What's Good
- [Specific item with exact file:line citation]

#### 2. Verified What's Bad & Gaps
- [Specific code smell, missing loading/empty state, mock masquerading]

#### 3. Critical Issues & Prioritized Bugs
- **[P0/P1/P2] [Title]**: [Description, blast radius on end users, file:line]

#### 4. Actionable Improvements & MCP Integrations
- [Concrete code refactoring recommendation]
- [MCP tool integration opportunity]
```
