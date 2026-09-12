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

/**
 * Redaction helpers for anything that gets *displayed* rather than sent.
 *
 * The debug panel shows the cURL equivalent of every API call and the raw
 * request body. Those bodies routinely carry live credentials: OAuth client
 * secrets (Authorizations), connector `client_secret` / `refresh_token`
 * values, and arbitrary user-supplied action params. A screenshot or a
 * copy-pasted bug report then leaks them.
 *
 * Everything here is display-only. Callers must keep passing the ORIGINAL
 * object to the transport layer; these functions never mutate their input.
 *
 * Hard requirement: this runs on every API call, so it must never throw.
 * Every entry point is wrapped in a try/catch whose fallback is a redaction
 * marker (never the raw value -- failing open would defeat the purpose).
 */

/** Replacement for a sensitive value. */
export const REDACTED = "[REDACTED]";

/** Emitted when a cycle is detected, so the shape stays readable. */
export const CIRCULAR = "[Circular]";

/** Emitted past MAX_DEPTH, which exists to keep recursion bounded. */
export const TRUNCATED = "[Truncated]";

/** Last-resort marker: redaction itself failed, so nothing is shown. */
export const REDACTION_FAILED = "[REDACTION FAILED]";

const MAX_DEPTH = 64;

/**
 * Keys whose value is always secret. Compared after normalization
 * (lowercased, `_`/`-`/spaces stripped), so `client_secret`, `clientSecret`
 * and `Client-Secret` all collapse to `clientsecret`.
 *
 * Sourced from real call sites, not guesswork:
 *  - `serverSideOauth2.clientSecret` (types.ts Oauth2Config, AuthForm.tsx)
 *  - `action_config.action_params.client_secret` (BYOMCPConfigTab.tsx)
 *  - connector `params.refresh_token` / `client_secret` (DuplicateConnectorModal.tsx)
 *  - generic `password` / `api_key` / `private_key` style action params, which
 *    users can add freely via the custom action-param editor.
 */
const SENSITIVE_KEYS = new Set<string>([
  "accesstoken",
  "apikey",
  "apisecret",
  "apitoken",
  "assisttoken",
  "authorization",
  "authtoken",
  "bearer",
  "bearertoken",
  "clientsecret",
  "credential",
  "credentials",
  "idtoken",
  "jsonkey",
  "jwt",
  "passphrase",
  "passwd",
  "password",
  "pat",
  "personalaccesstoken",
  "privatekey",
  "privatekeydata",
  "privatekeyid",
  "refreshtoken",
  "secret",
  "secretaccesskey",
  "secretkey",
  "serviceaccountkey",
  "sessiontoken",
  "signature",
  "token",
  "xgoogapikey",
]);

/**
 * Keys that LOOK sensitive to the substring heuristic below but are not, and
 * are genuinely useful when debugging. Checked before the heuristic.
 * `tokenUri` / `authorizationUri` are plain endpoints (types.ts Oauth2Config);
 * `*PageToken` is pagination; `secretKeyRef` is a Secret Manager *reference*
 * whose child `secret` key is still redacted by the exact-match set above.
 *
 * Plural `authorizations` is a list of resource NAMES attached to an agent
 * (`projects/<p>/locations/<l>/authorizations/<id>`) -- no secret material,
 * and one of the most frequently debugged fields in this app. Singular
 * `authorization` stays in the sensitive set, since that is the header name.
 */
const NON_SENSITIVE_KEYS = new Set<string>([
  "authorizationendpoint",
  "authorizationid",
  "authorizations",
  "authorizationuri",
  "nextpagetoken",
  "pagetoken",
  "secretkeyref",
  "tokencount",
  "tokenendpoint",
  "tokenuri",
]);

/**
 * Fallback for keys nobody enumerated -- users can type arbitrary key names
 * into the custom action-params editor (BYOMCPConfigTab.tsx), so an exact
 * list can never be complete. Deliberately narrow to avoid shredding the log.
 */
const SENSITIVE_SUBSTRINGS = [
  "secret",
  "password",
  "passwd",
  "credential",
  "apikey",
  "privatekey",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "sessiontoken",
];

/**
 * Value-level patterns, applied to strings under non-sensitive keys. Covers
 * credentials that travel inside an innocuously named field (for example a
 * user-supplied `auth_uri_params` string, or a custom header map value).
 */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /^\s*bearer\s+\S+/i, // "Bearer ya29...."
  /\bya29\.[\w.-]+/, // Google OAuth2 access token
  /\bAIza[0-9A-Za-z_-]{35}\b/, // Google API key
  /-----BEGIN[A-Z ]*PRIVATE KEY-----/, // PEM private key block
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/, // JWT
];

const normalizeKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when a key's value should be treated as a secret. */
export const isSensitiveKey = (key: string): boolean => {
  if (typeof key !== "string" || !key) return false;
  const normalized = normalizeKey(key);
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (NON_SENSITIVE_KEYS.has(normalized)) return false;
  return SENSITIVE_SUBSTRINGS.some((fragment) => normalized.includes(fragment));
};

const looksLikeSecretString = (value: string): boolean =>
  SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));

/**
 * Own enumerable keys, tolerating exotic objects. A throwing getter or a
 * revoked Proxy must not take down the request.
 */
const safeKeys = (value: object): string[] => {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
};

const safeGet = (value: Record<string, unknown>, key: string): unknown => {
  try {
    return value[key];
  } catch {
    // A getter threw. We cannot know whether it was sensitive, so redact.
    return REDACTED;
  }
};

/**
 * Replaces every leaf with REDACTED while preserving the container shape.
 * Used when the KEY is sensitive but the value is a structure, e.g.
 * `credentials: { username, password }` -> both values redacted, both keys
 * kept, so the log still shows what was sent.
 */
const redactAllLeaves = (
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return REDACTED;
  if (depth >= MAX_DEPTH) return TRUNCATED;
  if (seen.has(value as object)) return CIRCULAR;

  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactAllLeaves(item, depth + 1, seen));
    }
    if (value instanceof Date) return REDACTED;
    const out: Record<string, unknown> = {};
    const source = value as Record<string, unknown>;
    for (const key of safeKeys(source)) {
      out[key] = redactAllLeaves(safeGet(source, key), depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value as object);
  }
};

const redactValue = (
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown => {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return looksLikeSecretString(value) ? REDACTED : value;
  }

  if (typeof value !== "object") {
    // number | boolean | bigint | symbol | function. Functions are dropped so
    // the displayed body matches what JSON.stringify would have produced.
    return typeof value === "function" ? undefined : value;
  }

  if (depth >= MAX_DEPTH) return TRUNCATED;
  if (seen.has(value as object)) return CIRCULAR;

  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, depth + 1, seen));
    }
    if (value instanceof Date) return new Date(value.getTime());

    const out: Record<string, unknown> = {};
    const source = value as Record<string, unknown>;
    for (const key of safeKeys(source)) {
      const child = safeGet(source, key);
      out[key] = isSensitiveKey(key)
        ? redactAllLeaves(child, depth + 1, seen)
        : redactValue(child, depth + 1, seen);
    }
    return out;
  } finally {
    // Sibling branches may legitimately reference the same object; only true
    // ancestors count as a cycle.
    seen.delete(value as object);
  }
};

/**
 * Deep-clones `value`, replacing sensitive values with REDACTED.
 *
 * Keys are preserved so the log stays useful. Never mutates the input and
 * never throws: on internal failure it returns REDACTION_FAILED rather than
 * the original value.
 */
export const redactSensitive = (value: unknown): unknown => {
  try {
    return redactValue(value, 0, new WeakSet<object>());
  } catch {
    return REDACTION_FAILED;
  }
};

/**
 * Same as redactSensitive, but also handles a body that arrives as a JSON
 * string (cURL bodies are stringified downstream, and some callers pre-encode).
 * Non-JSON strings fall back to value-level scrubbing.
 */
export const redactRequestBody = (body: unknown): unknown => {
  try {
    if (typeof body === "string") {
      const trimmed = body.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return JSON.stringify(redactSensitive(JSON.parse(trimmed)));
        } catch {
          // Not valid JSON after all -- fall through to string scrubbing.
        }
      }
    }
    return redactSensitive(body);
  } catch {
    return REDACTION_FAILED;
  }
};
