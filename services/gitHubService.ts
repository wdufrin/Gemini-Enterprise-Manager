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

import { Octokit } from '@octokit/rest';

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Verifies the stored token is valid.
   */
  async checkToken(): Promise<string> {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      return data.login;
    } catch (error) {
      throw new Error('Invalid GitHub Token');
    }
  }

  /**
   * Creates a new repository for the authenticated user.
   */
  async createRepository(name: string, isPrivate: boolean, description: string = ''): Promise<{ html_url: string; name: string; full_name: string; default_branch: string }> {
    try {
      const { data } = await this.octokit.repos.createForAuthenticatedUser({
        name,
        private: isPrivate,
        description,
        auto_init: true, // Initialize with README to get a main branch
      });
      return {
        html_url: data.html_url,
        name: data.name,
        full_name: data.full_name,
        default_branch: data.default_branch || 'main',
      };
    } catch (error: unknown) {
      // If it already exists, checking if we can use it would be complex (might need to check permissions/empty).
      // For now, simpler to fail or let user handle "already exists" by picking a new name.
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create repository: ${msg}`);
    }
  }

  /**
   * Lists repositories for the authenticated user.
   */
  async getUserRepositories(page: number = 1, perPage: number = 30): Promise<{ name: string; full_name: string; html_url: string; private: boolean; updated_at: string | null }[]> {
    try {
      const { data } = await this.octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        direction: 'desc',
        page,
        per_page: perPage,
        type: 'all' // owner, public, private, member
      });
      return data.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        private: repo.private,
        updated_at: repo.updated_at,
      }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to list repositories: ${msg}`);
    }
  }

  /**
   * Pushes multiple files to the repository using the Git Data API.
   * This is efficient for initial commits.
   */
  async pushFilesToRepository(
    owner: string,
    repo: string,
    branch: string,
    files: { path: string; content: string; encoding?: 'utf-8' | 'base64' }[],
    message: string = 'Update from Agent Starter Pack'
  ): Promise<void> {

    let latestCommitSha: string | undefined;
    let baseTreeSha: string | undefined;
    const filesToPush = files;

    if (files.length === 0) return;

    try {
      // 1. Get the latest commit SHA
      const { data: refData } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      latestCommitSha = refData.object.sha;

      // 2. Get the tree SHA
      const { data: commitData } = await this.octokit.git.getCommit({
        owner,
        repo,
        commit_sha: latestCommitSha,
      });
      baseTreeSha = commitData.tree.sha;
    } catch (e: unknown) {
      const status = typeof e === 'object' && e !== null && 'status' in e ? (e as { status: unknown }).status : undefined;
      if (status === 409 || status === 404) {
        console.log('Repo empty. Initializing with first file...');
        const firstFile = files[0];
        // Ensure content is base64 encoded for createOrUpdateFileContents
        const contentBase64 = firstFile.encoding === 'base64'
          ? firstFile.content
          : btoa(unescape(encodeURIComponent(firstFile.content)));

        await this.octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: firstFile.path,
          message: 'Initialize repository',
          content: contentBase64,
        });

        // After init, we can proceed to push the rest if any.
        if (files.length > 1) {
          // Wait a bit for consistency
          await new Promise(r => setTimeout(r, 1000));
          // Push remaining files
          await this.pushFilesToRepository(owner, repo, branch, files.slice(1), message);
        }
        return;
      } else {
        throw e;
      }
    }

    // 3. Create a new tree
    const treeItems = await Promise.all(filesToPush.map(async file => {
      if (file.encoding === 'base64') {
        const { data } = await this.octokit.git.createBlob({
          owner,
          repo,
          content: file.content,
          encoding: 'base64'
        });
        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: data.sha
        };
      } else {
        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          content: file.content
        };
      }
    }));

    const { data: newTreeData } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha, // undefined if no base (root)
      tree: treeItems,
    });
    const newTreeSha = newTreeData.sha;

    // 4. Create a new commit
    const { data: newCommitData } = await this.octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: newTreeSha,
      parents: latestCommitSha ? [latestCommitSha] : [],
    });
    const newCommitSha = newCommitData.sha;

    // 5. Update or Create reference
    if (latestCommitSha) {
      await this.octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommitSha,
      });
    } else {
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: newCommitSha,
      });
    }
  }
}
