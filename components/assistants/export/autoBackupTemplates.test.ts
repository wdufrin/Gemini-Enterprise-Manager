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

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDeploySh } from './autoBackupTemplates';

const script = () => generateDeploySh(1);

describe('generateDeploySh', () => {
  it('emits syntactically valid bash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auto-backup-'));
    const file = join(dir, 'deploy.sh');
    writeFileSync(file, script());
    // Throws on a syntax error. The script is handed to a customer to run
    // against their own project, so a broken heredoc or unbalanced quote is
    // their problem to debug, not ours to ship.
    execFileSync('bash', ['-n', file], { stdio: 'pipe' });
  });

  it('substitutes shell variables rather than TypeScript ones', () => {
    const s = script();
    expect(s).toContain('${REGION}');
    expect(s).toContain('${PROJECT_ID}');
    expect(s).toContain('${COMPUTE_SA}');
    // A leaked `undefined` would mean a template literal escaped incorrectly.
    expect(s).not.toContain('undefined');
  });

  // Without the invoker binding, Cloud Scheduler cannot trigger the function,
  // so the scheduled backup never runs -- and nobody discovers that until they
  // need a restore. `|| true` made that outcome indistinguishable from success.
  it('does not suppress failures of the invoker role grants', () => {
    const invokerLines = script()
      .split('\n')
      .filter((line) => line.includes('add-iam-policy-binding'));

    expect(invokerLines.length).toBeGreaterThan(0);
    for (const line of invokerLines) {
      expect(line, line).not.toContain('|| true');
    }
  });

  it('aborts when neither the Gen1 nor the Gen2 invoker grant succeeds', () => {
    const s = script();
    expect(s).toContain('INVOKER_GRANTED=0');
    expect(s).toMatch(/if \[ "\$\{INVOKER_GRANTED\}" -eq 0 \]; then/);
    expect(s).toContain('exit 1');
  });

  // Exactly one of the two grants is expected to fail depending on whether the
  // function deployed as Gen1 or Gen2, so a single failure must stay tolerated.
  it('tolerates one of the two grants failing', () => {
    const s = script();
    expect(s).toMatch(/if gcloud functions add-iam-policy-binding/);
    expect(s).toMatch(/if gcloud run services add-iam-policy-binding/);
  });

  it('keeps set -e so an unhandled failure still stops the deploy', () => {
    expect(script().split('\n').slice(0, 3).join('\n')).toContain('set -e');
  });
});
