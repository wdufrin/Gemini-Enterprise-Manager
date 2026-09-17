/// <reference types="vitest" />
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

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Ensure docs screenshots are available under public/docs/assets for in-app User Guide
const docsAssetsSrc = path.resolve(__dirname, 'docs/assets');
const docsAssetsDest = path.resolve(__dirname, 'public/docs/assets');
if (fs.existsSync(docsAssetsSrc)) {
  fs.mkdirSync(docsAssetsDest, { recursive: true });
  fs.cpSync(docsAssetsSrc, docsAssetsDest, { recursive: true });
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        '**/.venv/**',
        '**/venv/**',
        '**/.git/**',
        '**/dist/**',
        '**/scratch/**',
        '**/examples/**'
      ]
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // `scratch/` and `examples/` are gitignored. Without this, a throwaway
    // *.test.ts dropped in there joins the suite locally but does not exist in
    // CI -- so the two disagree about what "all tests pass" means.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.venv/**',
      '**/scratch/**',
      '**/examples/**'
    ],
  },
  build: {
    outDir: 'dist',
    target: 'esnext'
  }
})