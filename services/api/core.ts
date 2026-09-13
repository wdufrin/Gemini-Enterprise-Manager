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

import { getGapiClient } from "../gapiService";
import { redactRequestBody } from "../redaction";

export const DISCOVERY_API_VERSION = "v1alpha";
export const DISCOVERY_API_BETA = "v1beta";

// Helper to determine base URL for Discovery Engine
export const getDiscoveryEngineUrl = (location: string) => {
  return location === "global"
    ? "https://discoveryengine.googleapis.com"
    : `https://${location}-discoveryengine.googleapis.com`;
};

// Debug Logger Callback Type
export type DebugLogger = (log: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  curlCommand: string;
}) => void;

let debugLogger: DebugLogger | null = null;

export const setDebugLogger = (logger: DebugLogger | null) => {
  debugLogger = logger;
};

// Helper to generate cURL command
export const generateCurlCommand = (
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
): string => {
  let command = `curl -X ${method} \\\n  "${url}"`;

  Object.keys(headers).forEach((key) => {
    command += ` \\\n  -H "${key}: ${headers[key]}"`;
  });

  if (body) {
    // Ensure body is stringified if it's an object
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    // Escape single quotes (basic escaping)
    const escapedBody = bodyStr.replace(/'/g, "'\\''");
    command += ` \\\n  -d '${escapedBody}'`;
  }

  return command;
};

export class GapiError extends Error {
  status: number;
  code?: string | number;
  details?: unknown[];
  raw?: unknown;

  constructor(
    message: string,
    status: number = 0,
    code?: string | number,
    details?: unknown[],
    raw?: unknown,
  ) {
    super(message);
    this.name = "GapiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.raw = raw;
    Object.setPrototypeOf(this, GapiError.prototype);
  }
}

export type AuthExpiredHandler = () => void;
const authExpiredHandlers = new Set<AuthExpiredHandler>();

export const onAuthExpired = (handler: AuthExpiredHandler): (() => void) => {
  authExpiredHandlers.add(handler);
  return () => {
    authExpiredHandlers.delete(handler);
  };
};

let lastAuthExpiredNotification = 0;
const AUTH_EXPIRED_DEBOUNCE_MS = 2000;

export const resetAuthExpiredCooldown = () => {
  lastAuthExpiredNotification = 0;
};

export const notifyAuthExpired = () => {
  const now = Date.now();
  if (now - lastAuthExpiredNotification < AUTH_EXPIRED_DEBOUNCE_MS) {
    return;
  }
  lastAuthExpiredNotification = now;
  authExpiredHandlers.forEach((h) => {
    try {
      h();
    } catch (e) {
      console.error("Error in auth expired handler", e);
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gapi:auth-expired"));
  }
};

export function createConcurrencyLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift();
      if (run) run();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

// Global concurrency limiter: max 6 in-flight calls to prevent client-side socket saturation and 429 bursts
export const globalApiLimiter = createConcurrencyLimiter(6);

export const MAX_API_RETRIES = 3;

// Generic gapi request wrapper
export const gapiRequest = async <T>(
  path: string,
  method: string = "GET",
  projectId?: string,
  params?: Record<string, unknown>,
  body?: unknown,
  headers?: Record<string, string>,
  suppressErrorLog: boolean = false,
): Promise<T> => {
  return globalApiLimiter(async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
      const client = await getGapiClient();
      const requestHeaders: Record<string, string> = headers ? { ...headers } : {};

      if (projectId) {
        requestHeaders["X-Goog-User-Project"] = projectId;
      }

      // Ensure Content-Type is set for POST/PUT if body exists
      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        if (!requestHeaders["Content-Type"]) {
          requestHeaders["Content-Type"] = "application/json";
        }
      }

      // Basic cURL logging
      if (debugLogger) {
        const token = client.getToken()?.access_token;
        const logHeaders = { ...requestHeaders };
        if (token) {
          logHeaders["Authorization"] = `Bearer $(gcloud auth print-access-token)`;
        }
        const logBody = redactRequestBody(body);
        const curlCommand = generateCurlCommand(path, method, logHeaders, logBody);
        debugLogger({
          method,
          url: path,
          headers: logHeaders,
          body: logBody,
          curlCommand,
        });
      }

      const requestOptions = {
        path,
        method,
        params,
        body,
        headers: requestHeaders,
      };

      try {
        const response = await client.request(requestOptions);
        return response.result as T;
      } catch (error: unknown) {
        const errObj = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
        let status = typeof errObj?.status === "number" ? errObj.status : 0;
        let code: string | number | undefined = typeof errObj?.code === "string" || typeof errObj?.code === "number" ? errObj.code : undefined;
        let details: unknown[] | undefined = undefined;
        let errorMessage = "Unknown API Error";

        const errResult = errObj?.result as { error?: { code?: number; status?: string | number; details?: unknown[]; message?: string } } | undefined;
        if (errResult?.error) {
          const apiErr = errResult.error;
          if (typeof apiErr.code === "number") status = apiErr.code;
          if (apiErr.status) code = apiErr.status;
          if (Array.isArray(apiErr.details)) details = apiErr.details;
          if (apiErr.message) {
            errorMessage = apiErr.message;
            if (details && details.length > 0) {
              const detailTexts = details
                .map((d: unknown) => {
                  if (typeof d === "object" && d !== null) {
                    const dobj = d as { detail?: string; message?: string };
                    return dobj.detail || dobj.message;
                  }
                  return String(d);
                })
                .filter(Boolean);
              if (detailTexts.length > 0) {
                errorMessage = `${errorMessage} (${detailTexts.join("; ").trim()})`;
              }
            }
          }
        } else if (errObj?.body) {
          try {
            const parsed = typeof errObj.body === "string" ? JSON.parse(errObj.body) : errObj.body;
            if (parsed?.error) {
              if (typeof parsed.error.code === "number") status = parsed.error.code;
              if (parsed.error.status) code = parsed.error.status;
              if (Array.isArray(parsed.error.details)) details = parsed.error.details;
              if (parsed.error.message) errorMessage = parsed.error.message;
              else errorMessage = typeof errObj.body === "string" ? errObj.body : JSON.stringify(errObj.body);
            } else {
              errorMessage = typeof errObj.body === "string" ? errObj.body : JSON.stringify(errObj.body);
            }
          } catch {
            errorMessage = String(errObj.body);
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        } else if (errObj?.result) {
          errorMessage = JSON.stringify(errObj.result, null, 2);
        } else if (errObj) {
          try {
            errorMessage = JSON.stringify(errObj, null, 2);
          } catch {
            errorMessage = "Complex Error Object (cannot stringify)";
          }
        } else if (error) {
          errorMessage = String(error);
        }

        // Retry on 429 (Too Many Requests / RESOURCE_EXHAUSTED) or 503 (Service Unavailable)
        if (
          (status === 429 || status === 503 || code === "RESOURCE_EXHAUSTED") &&
          attempt < MAX_API_RETRIES
        ) {
          const backoffMs =
            Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
          if (!suppressErrorLog) {
            console.warn(
              `[gapiRequest] Rate limited / service unavailable (${status} ${code || ""}). Retrying attempt ${attempt + 1}/${MAX_API_RETRIES} in ${Math.round(backoffMs)}ms...`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Auth expiration notification on 401 or UNAUTHENTICATED
        if (status === 401 || code === "UNAUTHENTICATED") {
          notifyAuthExpired();
          if (!suppressErrorLog) {
            console.warn(
              `[gapiRequest] Authentication credential expired or invalid (401 UNAUTHENTICATED) for ${method} ${path}. Re-authentication triggered.`,
            );
          }
        } else if (!suppressErrorLog) {
          console.error("API Request Failed", error);
        }

        lastError = new GapiError(errorMessage, status, code, details, error);
        throw lastError;
      }
    }
    throw lastError || new GapiError("API request exceeded retry budget", 503);
  });
};

// Helper to extract location from resource name
export const getLocationFromResourceName = (name: string): string => {
  const match = name.match(/locations\/([a-zA-Z0-9-]+)\//);
  return match ? match[1] : "global";
};
