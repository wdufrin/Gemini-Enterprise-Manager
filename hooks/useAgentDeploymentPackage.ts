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

import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/apiService';
import { GcsBucket } from '../types';
import {
  CloudRunAccessMode,
  DEFAULT_CLOUD_RUN_ACCESS,
} from '../services/adkTemplates/types';
import { EnvVar } from '../components/agent-catalog/types';

interface UseAgentDeploymentPackageProps {
  isOpen: boolean;
  files: { name: string; content: string }[];
  projectNumber: string;
  initialBucket?: string;
}

export function useAgentDeploymentPackage({
  isOpen,
  files,
  projectNumber,
  initialBucket,
}: UseAgentDeploymentPackageProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [target, setTarget] = useState<'cloud_run' | 'reasoning_engine'>(
    'reasoning_engine'
  );
  const [region, setRegion] = useState('us-central1');
  const [accessMode, setAccessMode] = useState<CloudRunAccessMode>(
    DEFAULT_CLOUD_RUN_ACCESS
  );
  const [tools, setTools] = useState<string[]>([]);
  const [readmeContent, setReadmeContent] = useState<string>('');

  const [projectId, setProjectId] = useState(projectNumber);
  const [isResolvingId, setIsResolvingId] = useState(false);

  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

  const [entryPoint, setEntryPoint] = useState('app');
  const [entryModulePath, setEntryModulePath] = useState('agent');

  useEffect(() => {
    if (!isOpen) return;

    // Reset state
    setEnvVars([]);
    setTools([]);
    setProjectId(projectNumber);
    setReadmeContent('');
    setBuckets([]);
    setSelectedBucket('');

    // 1. Resolve Project ID
    const resolveProject = async () => {
      setIsResolvingId(true);
      try {
        const p = await api.getProject(projectNumber);
        if (p.projectId) setProjectId(p.projectId);
      } catch {
        console.warn('Could not resolve Project ID string');
      } finally {
        setIsResolvingId(false);
      }
    };
    resolveProject();

    // 2. Parse Files
    const readme =
      files.find(
        (f) =>
          f.name.toLowerCase() === 'readme.md' ||
          f.name.toLowerCase().endsWith('/readme.md')
      )?.content || '';
    const envExample =
      files.find(
        (f) => f.name === '.env.example' || f.name.endsWith('/.env.example')
      )?.content || '';
    const envFile =
      files.find((f) => f.name === '.env' || f.name.endsWith('/.env'))
        ?.content || '';
    const hasDockerfile = files.some((f) => f.name === 'Dockerfile');
    const isA2a = files.some((f) => f.content.includes('to_a2a('));

    setReadmeContent(readme);

    if (hasDockerfile || isA2a) {
      setTarget('cloud_run');
    } else {
      setTarget('reasoning_engine');
    }

    // Detect Main File and Entry Point (Recursive Search)
    let mainFileContent = '';

    let detectedFile = files.find(
      (f) => f.name === 'app.py' || f.name.endsWith('/app.py')
    );

    if (!detectedFile) {
      detectedFile = files.find(
        (f) => f.name === 'agent.py' || f.name.endsWith('/agent.py')
      );
    }

    if (!detectedFile) {
      detectedFile = files.find(
        (f) => f.name === 'main.py' || f.name.endsWith('/main.py')
      );
    }

    if (!detectedFile) {
      detectedFile = files.find(
        (f) =>
          f.name.endsWith('.py') &&
          (f.content.includes('AdkApp(') ||
            f.content.includes('ReasoningEngine.create(') ||
            f.content.includes('Agent(') ||
            f.content.includes('to_a2a('))
      );
    }

    if (detectedFile) {
      mainFileContent = detectedFile.content;

      const filePath = detectedFile.name;
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop();
      const moduleName = fileName?.replace('.py', '') || 'agent';

      if (pathParts.length > 0) {
        setEntryModulePath(`${pathParts.join('.')}.${moduleName}`);
      } else {
        setEntryModulePath(moduleName);
      }

      if (mainFileContent.includes('root_agent =')) {
        setEntryPoint('root_agent');
      } else {
        const appMatch = mainFileContent.match(
          /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z0-9_.]*Agent|[a-zA-Z0-9_.]*AdkApp|[a-zA-Z0-9_.]*ReasoningEngine|to_a2a)\(/m
        );
        if (appMatch && appMatch[1]) {
          setEntryPoint(appMatch[1]);
        } else if (mainFileContent.includes('agent =')) {
          setEntryPoint('agent');
        } else if (mainFileContent.includes('app =')) {
          setEntryPoint('app');
        } else {
          setEntryPoint('app');
        }
      }
    } else {
      setEntryModulePath('agent');
      setEntryPoint('app');
    }

    // Extract Tools
    const detectedTools = new Set<string>();
    if (mainFileContent.includes('GoogleSearch'))
      detectedTools.add('Google Search');
    if (mainFileContent.includes('VertexAiSearchTool'))
      detectedTools.add('Vertex AI Search');
    if (mainFileContent.includes('LangchainTool'))
      detectedTools.add('Langchain Tool');

    const toolsMatch = mainFileContent.match(/tools\s*=\s*\[(.*?)\]/s);
    if (toolsMatch && toolsMatch[1]) {
      const rawTools = toolsMatch[1]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      rawTools.forEach((t) => {
        const cleanName = t.replace(/_tool$/, '').replace(/_/g, ' ');
        if (
          !detectedTools.has('Google Search') &&
          !detectedTools.has('Vertex AI Search')
        ) {
          if (cleanName)
            detectedTools.add(
              cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
            );
        }
      });
    }
    setTools(Array.from(detectedTools));

    // Extract Env Vars
    const varsMap = new Map<string, EnvVar>();

    const parseEnvContent = (
      content: string,
      source: '.env.example' | '.env'
    ) => {
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        const val =
          parts.length > 1
            ? parts.slice(1).join('=').trim().replace(/^"|"$/g, '')
            : '';

        if (varsMap.has(key)) {
          const existing = varsMap.get(key)!;
          if (source === '.env' && val) {
            varsMap.set(key, { ...existing, value: val, source: '.env' });
          }
        } else {
          varsMap.set(key, {
            key,
            value: val,
            source: source,
            placeholder: val,
          });
        }
      }
    };

    if (envExample) parseEnvContent(envExample, '.env.example');
    if (envFile) parseEnvContent(envFile, '.env');

    const regex = /os\.getenv\s*\(\s*["']([^"']+)["']/g;
    let match;
    while ((match = regex.exec(mainFileContent)) !== null) {
      const key = match[1];
      if (!varsMap.has(key)) {
        varsMap.set(key, {
          key,
          value: '',
          source: 'code',
        });
      }
    }

    const standardVars = [
      'GOOGLE_CLOUD_PROJECT',
      'GOOGLE_CLOUD_LOCATION',
      'DEPLOYMENT_LOCATION',
      'MODEL',
      'GOOGLE_GENAI_USE_VERTEXAI',
      'GOOGLE_CLOUD_STORAGE_BUCKET',
    ];
    standardVars.forEach((key) => {
      if (!varsMap.has(key)) {
        let defaultValue = '';
        if (key === 'GOOGLE_GENAI_USE_VERTEXAI') defaultValue = 'TRUE';
        if (key === 'DEPLOYMENT_LOCATION') defaultValue = 'us-central1';
        if (key === 'GOOGLE_CLOUD_LOCATION') defaultValue = 'us-central1';
        varsMap.set(key, {
          key,
          value: defaultValue,
          source: 'code',
          description: 'Standard GCP Env Var',
        });
      }
    });

    setEnvVars(Array.from(varsMap.values()));
  }, [isOpen, files, projectNumber]);

  // Fetch Buckets
  useEffect(() => {
    if (!isOpen || !projectId) return;

    const fetchBuckets = async () => {
      setIsLoadingBuckets(true);
      try {
        const res = await api.listBuckets(projectId);
        const items = res.items || [];
        setBuckets(items);
        if (items.length > 0) {
          setSelectedBucket((prev) => {
            if (prev) return prev;
            if (initialBucket && items.some((b) => b.name === initialBucket))
              return initialBucket;
            return items[0].name;
          });
        }
      } catch (e) {
        console.error('Failed to fetch buckets', e);
      } finally {
        setIsLoadingBuckets(false);
      }
    };
    fetchBuckets();
  }, [isOpen, projectId, initialBucket]);

  const handleRefreshBuckets = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingBuckets(true);
    try {
      const res = await api.listBuckets(projectId);
      const items = res.items || [];
      setBuckets(items);
      if (items.length > 0 && !items.some((b) => b.name === selectedBucket)) {
        setSelectedBucket(items[0].name);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBuckets(false);
    }
  }, [projectId, selectedBucket]);

  // Update Env Vars when projectId, region, or selectedBucket changes
  useEffect(() => {
    setEnvVars((prev) =>
      prev.map((v) => {
        if (v.key === 'GOOGLE_CLOUD_PROJECT') return { ...v, value: projectId };
        if (v.key === 'GOOGLE_CLOUD_LOCATION') {
          const modelVar = prev.find((item) => item.key === 'MODEL');
          const isGlobalModel =
            modelVar?.value?.startsWith('gemini-3') ||
            modelVar?.value?.includes('3.5') ||
            modelVar?.value?.includes('latest');
          return { ...v, value: isGlobalModel ? 'global' : region };
        }
        if (v.key === 'MODEL')
          return { ...v, value: v.value || 'gemini-2.5-flash' };
        if (v.key === 'GOOGLE_GENAI_USE_VERTEXAI')
          return { ...v, value: v.value || 'TRUE' };
        if (v.key === 'GOOGLE_CLOUD_STORAGE_BUCKET')
          return { ...v, value: selectedBucket };
        return v;
      })
    );
  }, [projectId, region, selectedBucket]);

  const handleVarChange = (index: number, value: string) => {
    const newVars = [...envVars];
    newVars[index].value = value;
    setEnvVars(newVars);
  };

  return {
    envVars,
    setEnvVars,
    handleVarChange,
    target,
    setTarget,
    region,
    setRegion,
    accessMode,
    setAccessMode,
    tools,
    readmeContent,
    projectId,
    isResolvingId,
    buckets,
    selectedBucket,
    setSelectedBucket,
    isLoadingBuckets,
    handleRefreshBuckets,
    entryPoint,
    setEntryPoint,
    entryModulePath,
    setEntryModulePath,
  };
}
