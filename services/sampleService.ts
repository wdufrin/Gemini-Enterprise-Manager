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


export interface SampleAgent {
  name: string;
  path: string;
  description?: string; // Fetched from README or hardcoded list if needed
}

export interface SampleFile {
  path: string;
  content: string; // Base64 or text
  encoding: 'base64' | 'utf-8';
}

interface GitHubContentItem {
  type: string;
  name: string;
  path: string;
  url?: string;
  [key: string]: unknown;
}

export class SampleService {
  private baseUrl = 'https://api.github.com/repos/google/adk-samples/contents/python/agents';
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async getSamples(): Promise<SampleAgent[]> {
    try {
      const response = await fetch(this.baseUrl, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed to fetch samples: ${response.statusText}`);

      const data = (await response.json()) as GitHubContentItem[];
      // Filter for directories only and exclude 'README.md' or other files
      return data
        .filter((item) => item.type === 'dir')
        .map((item) => ({
          name: item.name,
          path: item.path,
        }));
    } catch (error) {
      console.error('Error fetching samples:', error);
      throw error;
    }
  }

  // Recursive fetch of all files in a directory
  async getSampleFiles(sampleName: string): Promise<SampleFile[]> {
    const files: SampleFile[] = [];
    await this.fetchRecursive(`${this.baseUrl}/${sampleName}`, '', files);
    return files;
  }

  private async fetchRecursive(url: string, basePath: string, files: SampleFile[]) {
    const response = await fetch(url, { headers: this.getHeaders() });
    if (!response.ok) throw new Error(`Failed to fetch files at ${url}: ${response.statusText}`);

    const data = (await response.json()) as GitHubContentItem[];

    for (const item of data) {
      if (item.type === 'file' && item.url) {
        const fileResponse = await fetch(item.url, { headers: this.getHeaders() }); // Fetch blob/content
        if (!fileResponse.ok) continue;
        const fileData = (await fileResponse.json()) as { content?: string };
        // GitHub API returns content in base64
        const isText = /\.(py|md|txt|json|yaml|yml|toml|lock|sh|gitignore|env|example)$/i.test(item.name);
        let content = fileData.content;
        let encoding: 'base64' | 'utf-8' = 'base64';

        if (isText && content) {
          try {
            // Decode base64 to utf-8 string for editing
            content = atob(content.replace(/\n/g, ''));
            encoding = 'utf-8';
          } catch (e) {
            console.warn(`Failed to decode ${item.name}, keeping as base64`);
          }
        }

        files.push({
          path: basePath ? `${basePath}/${item.name}` : item.name,
          content: content || '',
          encoding: encoding
        });
      } else if (item.type === 'dir' && item.url) {
        await this.fetchRecursive(item.url, basePath ? `${basePath}/${item.name}` : item.name, files);
      }
    }
  }
}
