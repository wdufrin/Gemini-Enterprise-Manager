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
import {
  generatePrivateModeScript,
  generatePublicModeScript,
  type PrivateModeScriptArgs,
  type PublicModeScriptArgs,
} from './vanityBuildScript';

const privateDefaults: PrivateModeScriptArgs = {
  pscIpName: 'psc-ip-default-testengine',
  pscRuleName: 'pscrldefatestengine',
  customPscIp: '10.128.0.100',
  autoAllocatePscIp: false,
  vpcNetwork: 'default',
  useVpcScBundle: false,
  automatePrivateDns: true,
  customDomain: 'assistant.example.com',
  serviceName: 'assistant-test-engine',
  location: 'us-central1',
  widgetConfigId: 'cid_test_widget_123',
  vpcSubnet: 'default',
};

const publicDefaults: PublicModeScriptArgs = {
  serviceName: 'assistant-test-engine',
  customDomain: 'assistant.example.com',
  widgetConfigId: 'cid_test_widget_123',
  automateDNS: true,
};

const bodyOf = (step: any): string => step.args[1];

/**
 * Cloud Build substitutes `$$` with a literal `$` before handing the string to
 * bash, so the syntax check has to run against the de-escaped form -- checking
 * the raw template would validate a script that never actually executes.
 */
const asExecutedByBash = (script: string): string => script.replace(/\$\$/g, '$');

const assertValidBash = (script: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'vanity-script-'));
  const file = join(dir, 'step.sh');
  writeFileSync(file, asExecutedByBash(script));
  // `bash -n` parses without executing. Throws (non-zero exit) on a syntax error.
  execFileSync('bash', ['-n', file], { stdio: 'pipe' });
};

describe('vanityBuildScript', () => {
  const variants: Array<[string, () => string]> = [
    ['private, dns + custom domain', () => bodyOf(generatePrivateModeScript(privateDefaults))],
    [
      'private, auto-allocated PSC IP',
      () => bodyOf(generatePrivateModeScript({ ...privateDefaults, autoAllocatePscIp: true })),
    ],
    [
      'private, no dns automation',
      () => bodyOf(generatePrivateModeScript({ ...privateDefaults, automatePrivateDns: false })),
    ],
    [
      'private, no custom domain',
      () => bodyOf(generatePrivateModeScript({ ...privateDefaults, customDomain: '' })),
    ],
    ['public, dns automation on', () => bodyOf(generatePublicModeScript(publicDefaults))],
    [
      'public, dns automation off',
      () => bodyOf(generatePublicModeScript({ ...publicDefaults, automateDNS: false })),
    ],
  ];

  it.each(variants)('emits syntactically valid bash for %s', (_label, build) => {
    assertValidBash(build());
  });

  // A `|| true` makes the Cloud Build step exit 0 even when the certificate,
  // forwarding rule or DNS record was never created. The build then reports
  // SUCCESS and the operator only finds out the redirect is missing when a
  // user hits the domain.
  it.each(variants)('never suppresses a failure with `|| true` in %s', (_label, build) => {
    expect(build()).not.toContain('|| true');
  });

  it.each(variants)('fails the build when any step failed in %s', (_label, build) => {
    const script = build();
    expect(script).toContain('FAILURES=0');
    expect(script).toMatch(/if \[ "\$\$FAILURES" -gt 0 \]; then/);
    expect(script).toContain('exit 1');
  });

  // `gcloud dns record-sets delete` prompts for confirmation. Without --quiet
  // it aborts with a non-zero exit in Cloud Build's non-interactive shell --
  // which the old `|| true` silently hid, so the stale record was never
  // removed and the subsequent create failed as ALREADY_EXISTS.
  it.each(variants)('passes --quiet to every record-sets delete in %s', (_label, build) => {
    const deletes = build()
      .split('\n')
      .filter((line) => line.includes('record-sets delete'));
    for (const line of deletes) {
      expect(line, line).toContain('--quiet');
    }
  });

  it('does not write a DNS record when the load balancer IP could not be resolved', () => {
    const script = bodyOf(generatePrivateModeScript(privateDefaults));
    expect(script).toMatch(/if \[ -z "\$\$ILB_IP" \]; then/);
    expect(script).toContain('fail_step');
  });

  it('still classifies an already-existing resource as non-fatal', () => {
    // Re-running a deploy against a partially provisioned project must not be
    // reported as a failure, otherwise the fix above breaks every retry.
    const script = bodyOf(generatePublicModeScript(publicDefaults));
    expect(script).toMatch(/already exists\|ALREADY_EXISTS\|alreadyExists/);
    expect(script).toMatch(/was not found\|NOT_FOUND\|notFound/);
  });
});
