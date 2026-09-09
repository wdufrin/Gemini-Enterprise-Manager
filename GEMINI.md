# Gemini Enterprise Manager - Workspace Rules & Shortcuts

## Custom Command Shortcuts

### `/gemfullaudit`
When the user sends `/gemfullaudit` (or asks to run `/gemfullaudit`), the assistant must immediately interpret this as:
**"Run a full forensic audit across all 18 tabs with our SWE reviewer agents."**

#### Execution Steps:
1. **Parallel Domain Reviewers**: Launch the 5 domain reviewer subagents concurrently via `invoke_subagent`:
   - `gem-agent-management-reviewer`: Agent Manager, Skills Registry, Agent Builder, Catalog, Engines
   - `gem-knowledge-reviewer`: Data Stores, GE Quota Usage
   - `gem-testing-reviewer`: Assistant (Playground), Connectors, Architecture
   - `gem-security-reviewer`: Authorizations, Agent Permissions, Model Armor, Observability
   - `gem-system-reviewer`: Backup & Recovery, Config Audit, Licenses, Vanity URLs

2. **Core Directives**:
   - **Tabula Rasa**: Zero memory of past reviews. Inspect live source code directly (`pages/`, `components/`, `services/`, `App.tsx`, `types.ts`).
   - **Radical Honesty & End-User Protection**: Uncompromising exposure of mock data, broken APIs, unhandled promise rejections, security risks, and missing error states.

3. **Master Consolidation**:
   - Consolidate domain reports into a master artifact `master_forensic_swe_audit.md`.
   - Provide the user with an executive summary and priority action matrix.

---

## Single Tab Shorthands
- `/gemaudit [tab-name]`: Run a forensic audit on a specific tab using `gem-swe-reviewer`.
