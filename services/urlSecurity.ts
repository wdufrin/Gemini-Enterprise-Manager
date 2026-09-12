/**
 * URL trust checks for outbound requests that may carry the caller's Google
 * OAuth bearer token.
 *
 * WHY THIS EXISTS
 * ---------------
 * The previous checks were substring tests such as:
 *
 *     url.includes(".run.app")
 *
 * That is trivially defeated. All of the following pass a substring test while
 * pointing at an attacker-controlled origin:
 *
 *     https://untrusted.example.com/.run.app
 *     https://untrusted.example.com/?redirect=.run.app
 *     https://untrusted.example.com#.run.app
 *     https://.run.app.untrusted.example.com
 *
 * Any of those would have received the user's `cloud-platform`-scoped access
 * token. These helpers parse the URL and match against the real hostname.
 */

/**
 * Suffixes whose hosts are operated by Google and reachable only over
 * Google-managed TLS. A match means "this is a Google endpoint", NOT "this is
 * an endpoint you own".
 */
const GOOGLE_API_SUFFIXES = [".googleapis.com"] as const;

/**
 * Google-hosted *runtime* suffixes. Critically, ANY Google Cloud customer can
 * deploy to these -- an attacker can stand up `https://untrusted-abc123-uc.a.run.app`
 * in their own project. Matching here means the host is Google-hosted, it does
 * NOT mean the host is trustworthy.
 *
 * See `isGoogleHostedRuntime` for the caveat that applies to callers.
 */
const GOOGLE_RUNTIME_SUFFIXES = [".run.app", ".cloudfunctions.net"] as const;

/**
 * Parses a URL and returns its normalized hostname, or null when the input is
 * not a syntactically valid absolute URL, is not HTTPS, or embeds credentials.
 *
 * Embedded credentials (`https://user:pass@host/`) are rejected outright: they
 * are never legitimate here and they are a classic way to make a hostile URL
 * read as a familiar one.
 */
export const getSecureHostname = (rawUrl: string): string | null => {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // Plaintext HTTP would expose the bearer token on the wire.
  if (parsed.protocol !== "https:") return null;

  // `https://attacker@trusted.run.app` style confusion.
  if (parsed.username || parsed.password) return null;

  // Normalize case and the legal-but-unusual fully-qualified trailing dot,
  // so `EXAMPLE.RUN.APP.` and `example.run.app` compare equal.
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return host || null;
};

const hostMatchesSuffix = (
  host: string,
  suffixes: readonly string[],
): boolean => suffixes.some((suffix) => host.endsWith(suffix));

/**
 * True only for genuine `*.googleapis.com` API endpoints over HTTPS.
 *
 * These are first-party Google APIs and are the only hosts that should
 * unconditionally receive the user's OAuth token.
 */
export const isGoogleApiEndpoint = (rawUrl: string): boolean => {
  const host = getSecureHostname(rawUrl);
  return host !== null && hostMatchesSuffix(host, GOOGLE_API_SUFFIXES);
};

/**
 * True for Google-hosted serverless runtimes (`*.run.app`,
 * `*.cloudfunctions.net`) over HTTPS.
 *
 * IMPORTANT: a `true` result means "Google hosts this", not "you own this".
 * Any Google Cloud customer can deploy to these domains. Callers that attach
 * credentials based on this check are trusting every Cloud Run tenant on the
 * internet. Prefer requiring the user to explicitly confirm the specific
 * endpoint before sending credentials to it.
 */
export const isGoogleHostedRuntime = (rawUrl: string): boolean => {
  const host = getSecureHostname(rawUrl);
  return host !== null && hostMatchesSuffix(host, GOOGLE_RUNTIME_SUFFIXES);
};

/**
 * Whether it is acceptable to attach the caller's Google OAuth bearer token to
 * a request for `rawUrl`.
 *
 * This is the direct, hardened replacement for the old substring check.
 */
export const mayReceiveGoogleCredentials = (rawUrl: string): boolean =>
  isGoogleApiEndpoint(rawUrl) || isGoogleHostedRuntime(rawUrl);

/**
 * Joins a validated HTTPS base URL with a fixed path.
 *
 * Returns null when the base URL fails validation, so callers cannot
 * accidentally build a request against an unvalidated origin. The path is
 * fixed by the caller (never user input), so no escaping is performed here.
 */
export const buildValidatedUrl = (
  baseUrl: string,
  path: string,
): string | null => {
  if (getSecureHostname(baseUrl) === null) return null;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
};
