/**
 * Copyright 2026 Google LLC
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

import React, { useState, useEffect, useRef } from 'react';
import * as api from '../../services/apiService';

export interface ProjectEngineSelectorValue {
  project: string;
  location: string;
  engine: string;
}

export interface ProjectEngineSelectorProps {
  title: string;
  subtitle?: string;
  badgeColor?: 'blue' | 'emerald' | 'purple' | 'amber';
  value: ProjectEngineSelectorValue;
  onChange: (value: ProjectEngineSelectorValue) => void;
  projectPlaceholder?: string;
  locations?: string[];
  disabled?: boolean;
  required?: boolean;
}

const DEFAULT_LOCATIONS = ['global', 'us', 'eu'];

export const ProjectEngineSelector: React.FC<ProjectEngineSelectorProps> = ({
  title,
  subtitle,
  badgeColor = 'blue',
  value,
  onChange,
  projectPlaceholder = 'e.g. my-project or 123456789',
  locations = DEFAULT_LOCATIONS,
  disabled = false,
  required = true,
}) => {
  const [apps, setApps] = useState<any[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState<boolean>(false);
  const [isCustomEngine, setIsCustomEngine] = useState<boolean>(false);

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const badgeColorClass = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
  }[badgeColor];

  const focusRingClass = {
    blue: 'focus:ring-blue-500',
    emerald: 'focus:ring-emerald-500',
    purple: 'focus:ring-purple-500',
    amber: 'focus:ring-amber-500',
  }[badgeColor];

  // Fetch Engines / Apps when project or location changes
  useEffect(() => {
    const proj = value.project.trim();
    if (!proj) {
      setApps([]);
      return;
    }
    let isMounted = true;
    const fetchApps = async () => {
      setIsLoadingApps(true);
      try {
        const res = await api.listResources('engines', {
          projectId: proj,
          appLocation: value.location,
          collectionId: 'default_collection',
          appId: '',
          assistantId: '',
        }, undefined, 100, true);

        if (isMounted) {
          const engines = res?.engines || [];
          setApps(engines);
          if (engines.length > 0) {
            const currentEngine = valueRef.current.engine;
            const hasCurrent = engines.some((e: any) => e.name.split('/').pop() === currentEngine);
            if (!hasCurrent) {
              const defaultEng = engines.find((e: any) => e.name.split('/').pop() === 'default_engine');
              const chosen = defaultEng ? 'default_engine' : (engines[0].name.split('/').pop() || '');
              if (chosen) {
                onChangeRef.current({ ...valueRef.current, engine: chosen });
              }
            }
          }
        }
      } catch (e) {
        if (isMounted) {
          console.warn(`Could not list engines for project ${proj}:`, e);
          setApps([]);
        }
      } finally {
        if (isMounted) setIsLoadingApps(false);
      }
    };

    fetchApps();
    return () => {
      isMounted = false;
    };
  }, [value.project, value.location]);

  return (
    <div className="bg-gray-800/90 rounded-xl p-5 border border-gray-700/80 shadow-lg">
      <div className="flex items-center justify-between mb-4 border-b border-gray-700/60 pb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${badgeColorClass}`}></span>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">
            Project ID or Number {required && <span className="text-red-400">*</span>}
          </label>
          <input
            type="text"
            value={value.project}
            onChange={(e) => onChange({ ...value, project: e.target.value })}
            placeholder={projectPlaceholder}
            disabled={disabled}
            className={`w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 ${focusRingClass} disabled:opacity-50`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Region Location</label>
            <select
              value={value.location}
              onChange={(e) => onChange({ ...value, location: e.target.value })}
              disabled={disabled}
              className={`w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 ${focusRingClass} disabled:opacity-50`}
            >
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-300">
                Gemini Enterprise App ID
              </label>
              {apps.length > 0 && !isCustomEngine && (
                <button
                  type="button"
                  onClick={() => setIsCustomEngine(true)}
                  disabled={disabled}
                  className="text-[11px] text-blue-400 hover:text-blue-300 underline focus:outline-none"
                >
                  Enter manually
                </button>
              )}
              {isCustomEngine && apps.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCustomEngine(false)}
                  disabled={disabled}
                  className="text-[11px] text-blue-400 hover:text-blue-300 underline focus:outline-none"
                >
                  Select from list
                </button>
              )}
            </div>

            {isLoadingApps ? (
              <select
                disabled
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400"
              >
                <option>Loading Gemini Enterprise Apps...</option>
              </select>
            ) : apps.length > 0 && !isCustomEngine ? (
              <select
                value={value.engine}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomEngine(true);
                  } else {
                    onChange({ ...value, engine: e.target.value });
                  }
                }}
                disabled={disabled}
                className={`w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 ${focusRingClass} disabled:opacity-50`}
              >
                <option value="">-- Select Gemini Enterprise App --</option>
                {apps.map((a: any) => {
                  const id = a.name.split('/').pop() || '';
                  return (
                    <option key={a.name} value={id}>
                      {a.displayName ? `${a.displayName} (${id})` : id}
                    </option>
                  );
                })}
                <option value="__custom__">+ Enter Custom App ID...</option>
              </select>
            ) : (
              <input
                type="text"
                value={value.engine}
                onChange={(e) => onChange({ ...value, engine: e.target.value })}
                placeholder="default_engine"
                disabled={disabled}
                className={`w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 ${focusRingClass} disabled:opacity-50`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectEngineSelector;
