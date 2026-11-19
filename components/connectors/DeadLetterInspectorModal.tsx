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

import React, { useState, useEffect, useMemo, useRef } from "react";
import { GcsObject } from "../../types";
import * as cloudStorageApi from "../../services/api/cloudStorage";
import { useModalA11y } from "../../hooks/useModalA11y";
import { toErrorMessage } from "../../utils/errors";

export interface DeadLetterRecord {
  id: string;
  sourceFile: string;
  lineNumber: number;
  errorCode: string;
  errorReason: string;
  message: string;
  documentUri: string;
  documentId: string;
  raw: unknown;
}

export interface ParsedGcsUri {
  bucket: string;
  prefix: string;
}

const GRPC_CODE_NAMES: Record<string, string> = {
  "0": "OK",
  "1": "CANCELLED",
  "2": "UNKNOWN",
  "3": "INVALID_ARGUMENT",
  "4": "DEADLINE_EXCEEDED",
  "5": "NOT_FOUND",
  "6": "ALREADY_EXISTS",
  "7": "PERMISSION_DENIED",
  "8": "RESOURCE_EXHAUSTED",
  "9": "FAILED_PRECONDITION",
  "10": "ABORTED",
  "11": "OUT_OF_RANGE",
  "12": "UNIMPLEMENTED",
  "13": "INTERNAL",
  "14": "UNAVAILABLE",
  "15": "DATA_LOSS",
  "16": "UNAUTHENTICATED",
};

export function parseGcsPrefixUri(rawUri: string): ParsedGcsUri {
  const trimmed = typeof rawUri === "string" ? rawUri.trim() : "";
  if (!trimmed.startsWith("gs://")) {
    throw new Error(
      `Invalid GCS URI "${rawUri}": path must start with "gs://bucket/prefix".`,
    );
  }
  const withoutScheme = trimmed.slice("gs://".length);
  const slashIdx = withoutScheme.indexOf("/");
  const bucket =
    slashIdx === -1 ? withoutScheme : withoutScheme.slice(0, slashIdx);
  const prefix = slashIdx === -1 ? "" : withoutScheme.slice(slashIdx + 1);

  if (!bucket || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/i.test(bucket)) {
    throw new Error(
      `Invalid GCS bucket name "${bucket}" in "${rawUri}".`,
    );
  }
  return { bucket, prefix };
}

function extractRecordFields(
  obj: Record<string, unknown>,
  sourceFile: string,
  lineNumber: number,
): DeadLetterRecord {
  const statusObj =
    obj.status && typeof obj.status === "object"
      ? (obj.status as Record<string, unknown>)
      : undefined;
  const errorObj =
    obj.error && typeof obj.error === "object"
      ? (obj.error as Record<string, unknown>)
      : undefined;
  const docObj =
    obj.document && typeof obj.document === "object"
      ? (obj.document as Record<string, unknown>)
      : undefined;
  const docContentObj =
    docObj?.content && typeof docObj.content === "object"
      ? (docObj.content as Record<string, unknown>)
      : undefined;

  const rawCode =
    statusObj?.code ??
    errorObj?.code ??
    obj.code ??
    errorObj?.status ??
    statusObj?.status ??
    "UNKNOWN";
  const errorCode = String(rawCode);

  const explicitStatus =
    (typeof errorObj?.status === "string" && errorObj.status) ||
    (typeof statusObj?.status === "string" && statusObj.status) ||
    (typeof obj.reason === "string" && obj.reason) ||
    GRPC_CODE_NAMES[errorCode] ||
    (errorCode !== "UNKNOWN" ? `CODE_${errorCode}` : "UNCLASSIFIED_ERROR");

  const message = String(
    statusObj?.message ||
      errorObj?.message ||
      (typeof obj.error === "string" ? obj.error : "") ||
      obj.message ||
      obj.errorMessage ||
      obj.details ||
      JSON.stringify(obj),
  );

  const documentUri = String(
    obj.uri ||
      obj.sourceUri ||
      obj.documentUri ||
      obj.gcsUri ||
      obj.link ||
      obj.url ||
      docContentObj?.uri ||
      docObj?.uri ||
      "",
  ).trim();

  const documentId = String(
    obj.documentId || obj.docId || obj.id || docObj?.id || docObj?.name || "",
  ).trim();

  return {
    id: `${sourceFile}:${lineNumber}`,
    sourceFile,
    lineNumber,
    errorCode,
    errorReason: explicitStatus,
    message,
    documentUri,
    documentId,
    raw: obj,
  };
}

export function parseDeadLetterContent(
  rawContent: string,
  sourceFile: string,
): { records: DeadLetterRecord[]; parseErrorCount: number } {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return { records: [], parseErrorCount: 0 };
  }

  const records: DeadLetterRecord[] = [];
  let parseErrorCount = 0;

  // Handle full JSON array or single multi-line JSON object first
  if (trimmed.startsWith("[")) {
    try {
      const parsedArr = JSON.parse(trimmed);
      if (Array.isArray(parsedArr)) {
        parsedArr.forEach((item, idx) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            records.push(
              extractRecordFields(
                item as Record<string, unknown>,
                sourceFile,
                idx + 1,
              ),
            );
          } else {
            records.push({
              id: `${sourceFile}:${idx + 1}`,
              sourceFile,
              lineNumber: idx + 1,
              errorCode: "NON_OBJECT_RECORD",
              errorReason: "MALFORMED_RECORD",
              message: String(item),
              documentUri: "",
              documentId: "",
              raw: item,
            });
          }
        });
        return { records, parseErrorCount: 0 };
      }
    } catch {
      // Fall through to line-by-line JSONL parser so individual lines are reported accurately
    }
  }

  const lines = rawContent.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        records.push(
          extractRecordFields(
            parsed as Record<string, unknown>,
            sourceFile,
            i + 1,
          ),
        );
      } else {
        records.push({
          id: `${sourceFile}:${i + 1}`,
          sourceFile,
          lineNumber: i + 1,
          errorCode: "NON_OBJECT_JSON",
          errorReason: "MALFORMED_RECORD",
          message: line,
          documentUri: "",
          documentId: "",
          raw: parsed,
        });
      }
    } catch (err: unknown) {
      parseErrorCount++;
      const errMsg = err instanceof Error ? err.message : String(err);
      records.push({
        id: `${sourceFile}:${i + 1}`,
        sourceFile,
        lineNumber: i + 1,
        errorCode: "MALFORMED_JSONL",
        errorReason: "JSON_PARSE_ERROR",
        message: `Line ${i + 1} invalid JSON (${errMsg}): ${line.slice(0, 240)}`,
        documentUri: "",
        documentId: "",
        raw: line,
      });
    }
  }

  return { records, parseErrorCount };
}

function escapeCsvCell(value: string): string {
  const safeFormula = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safeFormula)) {
    return `"${safeFormula.replace(/"/g, '""')}"`;
  }
  return safeFormula;
}

export function buildDeadLetterCsv(records: DeadLetterRecord[]): string {
  const header = [
    "source_file",
    "line_number",
    "document_uri",
    "document_id",
    "error_code",
    "error_reason",
    "error_message",
  ].join(",");

  const rows = records.map((r) =>
    [
      escapeCsvCell(r.sourceFile),
      String(r.lineNumber),
      escapeCsvCell(r.documentUri),
      escapeCsvCell(r.documentId),
      escapeCsvCell(r.errorCode),
      escapeCsvCell(r.errorReason),
      escapeCsvCell(r.message),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

export interface DeadLetterInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  collectionName?: string;
  initialGcsPrefix?: string;
}

const MAX_AUTO_LOAD_FILES = 10;

export const DeadLetterInspectorModal: React.FC<DeadLetterInspectorModalProps> = ({
  isOpen,
  onClose,
  projectId,
  collectionName,
  initialGcsPrefix = "",
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y({
    isOpen,
    onClose,
    containerRef: dialogRef,
  });

  const [gcsPrefixInput, setGcsPrefixInput] = useState(initialGcsPrefix);
  const [objects, setObjects] = useState<GcsObject[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<Set<string>>(new Set());
  const [records, setRecords] = useState<DeadLetterRecord[]>([]);
  const [parseWarnings, setParseWarnings] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroupKey, setSelectedGroupKey] = useState<string>("ALL");
  const [filterText, setFilterText] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGcsPrefixInput(initialGcsPrefix || "");
      setObjects([]);
      setLoadedFiles(new Set());
      setRecords([]);
      setParseWarnings(0);
      setError(null);
      setSelectedGroupKey("ALL");
      setFilterText("");
      setExpandedRowId(null);
    }
  }, [isOpen, initialGcsPrefix]);

  const handleLoadObjectContent = async (
    bucket: string,
    objectName: string,
    append: boolean = true,
  ) => {
    setLoadingFile(objectName);
    try {
      const content = await cloudStorageApi.getGcsObjectContent(bucket, objectName, projectId);
      const parsed = parseDeadLetterContent(content, objectName);
      setLoadedFiles((prev) => new Set(prev).add(objectName));
      setParseWarnings((prev) => (append ? prev + parsed.parseErrorCount : parsed.parseErrorCount));
      setRecords((prev) => {
        const withoutExisting = append
          ? prev.filter((r) => r.sourceFile !== objectName)
          : [];
        return [...withoutExisting, ...parsed.records];
      });
    } catch (err: unknown) {
      setError(
        `Failed to read GCS object "${objectName}": ${toErrorMessage(err)}`,
      );
    } finally {
      setLoadingFile(null);
    }
  };

  const handleScanGcs = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setObjects([]);
    setRecords([]);
    setLoadedFiles(new Set());
    setParseWarnings(0);
    setSelectedGroupKey("ALL");

    let parsedUri: ParsedGcsUri;
    try {
      parsedUri = parseGcsPrefixUri(gcsPrefixInput);
    } catch (validationErr: unknown) {
      setError(toErrorMessage(validationErr));
      return;
    }

    setIsScanning(true);
    try {
      const listRes = await cloudStorageApi.listGcsObjects(
        parsedUri.bucket,
        parsedUri.prefix || undefined,
        projectId,
      );
      const candidateFiles = (listRes.items || []).filter(
        (item) => item.name && !item.name.endsWith("/"),
      );
      setObjects(candidateFiles);

      if (candidateFiles.length === 0) {
        setError(
          `No error log objects found under gs://${parsedUri.bucket}/${parsedUri.prefix}`,
        );
        return;
      }

      // Automatically inspect JSONL / JSON dead-letter objects (up to MAX_AUTO_LOAD_FILES)
      const jsonFiles = candidateFiles
        .filter((f) => /\.(jsonl|ndjson|json|txt|log)$/i.test(f.name) || !f.name.includes("."))
        .slice(0, MAX_AUTO_LOAD_FILES);

      const aggregated: DeadLetterRecord[] = [];
      let totalParseErrors = 0;
      const loadedSet = new Set<string>();

      for (const fileObj of jsonFiles) {
        const content = await cloudStorageApi.getGcsObjectContent(
          parsedUri.bucket,
          fileObj.name,
          projectId,
        );
        const parsed = parseDeadLetterContent(content, fileObj.name);
        aggregated.push(...parsed.records);
        totalParseErrors += parsed.parseErrorCount;
        loadedSet.add(fileObj.name);
      }

      setLoadedFiles(loadedSet);
      setRecords(aggregated);
      setParseWarnings(totalParseErrors);
    } catch (err: unknown) {
      setError(toErrorMessage(err, "Failed to list or read GCS dead-letter objects."));
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen && initialGcsPrefix && initialGcsPrefix.trim().startsWith("gs://")) {
      void handleScanGcs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialGcsPrefix]);

  const errorGroups = useMemo(() => {
    const counts = new Map<
      string,
      { key: string; code: string; reason: string; count: number }
    >();
    for (const r of records) {
      const key = `${r.errorCode}::${r.errorReason}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, {
          key,
          code: r.errorCode,
          reason: r.errorReason,
          count: 1,
        });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedGroupKey !== "ALL") {
        const key = `${r.errorCode}::${r.errorReason}`;
        if (key !== selectedGroupKey) return false;
      }
      if (filterText.trim()) {
        const q = filterText.toLowerCase();
        const hay = `${r.documentUri} ${r.documentId} ${r.message} ${r.errorCode} ${r.errorReason} ${r.sourceFile}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, selectedGroupKey, filterText]);

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;
    const csvContent = buildDeadLetterCsv(filteredRecords);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const shortCol = collectionName?.split("/").pop() || "connector";
    link.href = url;
    link.download = `${shortCol}-dead-letter-errors.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const shortCollection = collectionName?.split("/").pop() || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dead-letter-modal-title"
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2
              id="dead-letter-modal-title"
              className="text-lg font-bold text-white flex items-center gap-2"
            >
              <span>GCS Dead-Letter Inspector</span>
              {shortCollection && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-900 border border-gray-700 text-blue-300">
                  {shortCollection}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Inspect Discovery Engine connector &amp; document import failure records written to{" "}
              <code className="text-gray-300">errorConfig.gcsPrefix</code> (.jsonl / .json).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Dead-Letter Inspector"
            className="text-gray-400 hover:text-white px-2 py-1 text-lg font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <form onSubmit={handleScanGcs} className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1">
              <label
                htmlFor="dead-letter-gcs-uri"
                className="sr-only"
              >
                GCS Error Prefix URI
              </label>
              <input
                id="dead-letter-gcs-uri"
                type="text"
                value={gcsPrefixInput}
                onChange={(e) => setGcsPrefixInput(e.target.value)}
                placeholder="gs://my-error-bucket/connector-errors/2026-11-19/"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={isScanning || !gcsPrefixInput.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              {isScanning ? "Scanning GCS..." : "Scan Dead-Letter Files"}
            </button>
          </form>

          {error && (
            <div
              role="alert"
              className="bg-red-900/30 border border-red-700/60 text-red-200 p-3 rounded-lg text-xs"
            >
              {error}
            </div>
          )}

          {parseWarnings > 0 && (
            <div
              role="status"
              className="bg-amber-900/30 border border-amber-700/60 text-amber-200 p-2.5 rounded-lg text-xs"
            >
              Detected {parseWarnings} malformed JSONL line(s); included below under{" "}
              <code className="font-mono">MALFORMED_JSONL</code> for forensic inspection.
            </div>
          )}

          {objects.length > 0 && (
            <div className="bg-gray-800/70 border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">
                  Discovered Error Files ({objects.length}) — Loaded {loadedFiles.size}
                </span>
                {objects.length > loadedFiles.size && (
                  <span className="text-[11px] text-gray-400">
                    Click an unloaded object below to inspect its contents
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {objects.map((obj) => {
                  const isLoaded = loadedFiles.has(obj.name);
                  const shortObj = obj.name.split("/").pop() || obj.name;
                  return (
                    <button
                      key={obj.name}
                      type="button"
                      disabled={loadingFile === obj.name}
                      onClick={() => {
                        try {
                          const parsed = parseGcsPrefixUri(gcsPrefixInput);
                          void handleLoadObjectContent(parsed.bucket, obj.name, true);
                        } catch (err: unknown) {
                          setError(toErrorMessage(err));
                        }
                      }}
                      title={obj.name}
                      className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                        isLoaded
                          ? "bg-blue-900/40 border-blue-600/60 text-blue-200"
                          : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {loadingFile === obj.name ? "Loading..." : shortObj}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {records.length > 0 && (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedGroupKey("ALL")}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                        selectedGroupKey === "ALL"
                          ? "bg-blue-600 text-white border-blue-500"
                          : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                      }`}
                    >
                      All Failures ({records.length})
                    </button>
                    {errorGroups.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() =>
                          setSelectedGroupKey((prev) =>
                            prev === g.key ? "ALL" : g.key,
                          )
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
                          selectedGroupKey === g.key
                            ? "bg-red-700 text-white border-red-500"
                            : "bg-red-950/40 text-red-200 border-red-800/60 hover:bg-red-900/40"
                        }`}
                      >
                        {g.reason} ({g.code}): {g.count}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={filteredRecords.length === 0}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Export Failed URIs (CSV) ({filteredRecords.length})
                  </button>
                </div>

                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter failed records by document URI, ID, error code, or message..."
                  aria-label="Filter dead-letter records"
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-700 text-xs">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">
                        Code / Reason
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">
                        Document URI / ID
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-300">
                        Error Message
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-300">
                        Raw
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 bg-gray-900">
                    {filteredRecords.slice(0, 250).map((rec) => (
                      <React.Fragment key={rec.id}>
                        <tr className="hover:bg-gray-800/60">
                          <td className="px-3 py-2 whitespace-nowrap align-top">
                            <span className="inline-block px-2 py-0.5 rounded bg-red-900/60 border border-red-700/60 text-red-200 font-mono">
                              {rec.errorReason} ({rec.errorCode})
                            </span>
                            <div className="text-[10px] text-gray-500 font-mono mt-1">
                              L{rec.lineNumber}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top font-mono text-gray-200 break-all max-w-xs">
                            {rec.documentUri || rec.documentId || (
                              <span className="text-gray-500 italic">No URI</span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-gray-300 break-words max-w-md">
                            {rec.message}
                          </td>
                          <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRowId((prev) =>
                                  prev === rec.id ? null : rec.id,
                                )
                              }
                              className="text-blue-400 hover:text-blue-300 font-semibold"
                            >
                              {expandedRowId === rec.id ? "Hide" : "JSON"}
                            </button>
                          </td>
                        </tr>
                        {expandedRowId === rec.id && (
                          <tr className="bg-gray-950">
                            <td colSpan={4} className="px-4 py-2">
                              <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto">
                                {JSON.stringify(rec.raw, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 bg-gray-800 border-t border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeadLetterInspectorModal;
