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

import React, { useState, useRef } from 'react';
import {
  NormalizedSkillExportRecord,
  formatSkillsToCsv,
  formatSkillsToJson,
  formatSkillsToJsonl,
  formatSkillsToMarkdown,
} from '../../utils/skillExportUtils';
import { useModalA11y } from '../../hooks/useModalA11y';

export type SkillExportFormat = 'csv' | 'json' | 'jsonl' | 'markdown';

interface ExportSkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: NormalizedSkillExportRecord[];
  title?: string;
  filenamePrefix?: string;
}

export const ExportSkillsModal: React.FC<ExportSkillsModalProps> = ({
  isOpen,
  onClose,
  records,
  title = 'Export Skills Inventory',
  filenamePrefix = 'gemini-enterprise-skills',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<SkillExportFormat>('csv');
  const [includeRawResource, setIncludeRawResource] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
  });

  if (!isOpen) return null;

  const generateExportContent = (): string => {
    if (records.length === 0) return '';
    switch (format) {
      case 'csv':
        return formatSkillsToCsv(records);
      case 'json':
        return formatSkillsToJson(records, includeRawResource);
      case 'jsonl':
        return formatSkillsToJsonl(records, includeRawResource);
      case 'markdown':
        return formatSkillsToMarkdown(records);
    }
  };

  const handleDownload = () => {
    if (records.length === 0) return;
    const content = generateExportContent();
    const extMap: Record<SkillExportFormat, string> = {
      csv: 'csv',
      json: 'json',
      jsonl: 'jsonl',
      markdown: 'md',
    };
    const mimeMap: Record<SkillExportFormat, string> = {
      csv: 'text/csv;charset=utf-8;',
      json: 'application/json;charset=utf-8;',
      jsonl: 'application/x-ndjson;charset=utf-8;',
      markdown: 'text/markdown;charset=utf-8;',
    };
    const ext = extMap[format];
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename =
      records.length === 1 && format === 'markdown'
        ? `${records[0].skill_id}-SKILL.md`
        : `${filenamePrefix}-${timestamp}.${ext}`;

    const blob = new Blob([content], { type: mimeMap[format] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  const handleCopyClipboard = () => {
    if (records.length === 0) return;
    const content = generateExportContent();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewText = records.length > 0 ? generateExportContent() : 'No skills available to export.';

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-skills-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
          <div>
            <h3 id="export-skills-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {title}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Exporting <strong className="text-gray-200">{records.length}</strong> skill{records.length === 1 ? '' : 's'} with lifecycle state, origin, owner, and instructions.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close export modal"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Select Export Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  { id: 'csv', label: 'CSV Spreadsheet', desc: 'Excel / Sheets audit' },
                  { id: 'json', label: 'JSON Array', desc: 'Full structured spec' },
                  { id: 'jsonl', label: 'JSON Lines (.jsonl)', desc: 'BigQuery / SIEM' },
                  { id: 'markdown', label: 'SKILL.md Bundle', desc: 'Portable prompt spec' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormat(opt.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    format === opt.id
                      ? 'bg-blue-900/30 border-blue-500 text-white shadow'
                      : 'bg-gray-900/60 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {(format === 'json' || format === 'jsonl') && (
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeRawResource}
                onChange={(e) => setIncludeRawResource(e.target.checked)}
                className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
              />
              Include raw API resource payload (<code className="text-blue-300">raw_resource</code>)
            </label>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Export Preview
              </label>
              <button
                type="button"
                onClick={handleCopyClipboard}
                disabled={records.length === 0}
                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded text-xs font-semibold transition-colors"
              >
                {copied ? '✓ Copied to Clipboard' : 'Copy to Clipboard'}
              </button>
            </div>
            <pre
              data-testid="skills-export-preview"
              className="p-3 bg-gray-900 border border-gray-700 rounded-lg font-mono text-[11px] text-gray-300 overflow-x-auto max-h-56 whitespace-pre-wrap"
            >
              {previewText.slice(0, 3500)}
              {previewText.length > 3500 ? '\n... (preview truncated)' : ''}
            </pre>
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={records.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shadow flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Export
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportSkillsModal;
