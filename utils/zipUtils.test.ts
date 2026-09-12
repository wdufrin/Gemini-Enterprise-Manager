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
import { createZipBase64 } from './zipUtils';

describe('zipUtils', () => {
  it('creates valid base64-encoded zip with SKILL.md', () => {
    const files = {
      'SKILL.md': '---\nname: test-skill\n---\n# Test Skill',
    };
    const b64 = createZipBase64(files);
    expect(b64).toBeTruthy();
    expect(typeof b64).toBe('string');
    
    // Decode base64 and verify PK header signature (0x50, 0x4b, 0x03, 0x04)
    const raw = atob(b64);
    expect(raw.charCodeAt(0)).toBe(0x50); // P
    expect(raw.charCodeAt(1)).toBe(0x4b); // K
    expect(raw.charCodeAt(2)).toBe(0x03);
    expect(raw.charCodeAt(3)).toBe(0x04);
  });
});
