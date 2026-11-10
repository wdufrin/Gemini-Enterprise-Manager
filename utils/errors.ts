/**
 * Helpers for turning a caught value into something safe to show a user.
 *
 * A `catch` binding is `unknown`, not `Error`: any value can be thrown, and
 * rejected fetches / thrown strings / thrown objects all show up here. Typing
 * the binding as `any` silences the compiler but leaves `err.message` free to
 * evaluate to `undefined`, which is how a real failure ends up rendered to the
 * user as "Deployment failed: undefined".
 */

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * @param fallback Shown when the thrown value carries no usable message.
 */
export const toErrorMessage = (err: unknown, fallback = 'An unknown error occurred.'): string => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'string' && err) {
    return err;
  }
  // Objects thrown by some APIs carry a `message` without being an Error.
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) {
      return message;
    }
  }
  return fallback;
};

/**
 * Uses Regex Pattern Matching on single-line GCP IAM gRPC errors of the form:
 * `caller does not have permission to act as service account projects/<proj>/serviceAccounts/<idOrEmail>`
 * (Known limit: matches single-line resource tokens `projects/.../serviceAccounts/...` or emails;
 * non-matching messages are returned unchanged via `toErrorMessage`).
 */
const ACT_AS_SA_REGEX =
  /permission to act as service account\s+(?:projects\/([A-Za-z0-9_.:-]+)\/serviceAccounts\/([A-Za-z0-9_@.-]+)|([A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+))/i;

export const formatActAsServiceAccountError = (
  err: unknown,
  fallback = 'An unknown error occurred.',
  fallbackProjectId?: string,
): string => {
  const raw = toErrorMessage(err, fallback);
  const match = raw.match(ACT_AS_SA_REGEX);
  if (!match) {
    return raw;
  }

  const projectId = (match[1] || fallbackProjectId || 'YOUR_PROJECT_ID').replace(/\.+$/, '');
  const saIdentifier = (match[2] || match[3] || '').replace(/\.+$/, '');
  const isNumericUniqueId = /^\d+$/.test(saIdentifier);

  if (isNumericUniqueId) {
    return (
      `${raw} — GCP IAM Fix (no Google Workspace Admin required): Your GCP account lacks ` +
      `roles/iam.serviceAccountUser ("Service Account User") on service account uniqueId ${saIdentifier}. ` +
      `1) Find its email: gcloud iam service-accounts list --project="${projectId}" --filter="uniqueId=${saIdentifier}" --format="table(email,displayName,uniqueId)" ` +
      `2) Grant Service Account User in GCP IAM: gcloud iam service-accounts add-iam-policy-binding <SA_EMAIL> --member="user:<YOUR_EMAIL>" --role="roles/iam.serviceAccountUser" --project="${projectId}"`
    );
  }

  return (
    `${raw} — GCP IAM Fix (no Google Workspace Admin required): Grant roles/iam.serviceAccountUser ("Service Account User") ` +
    `on ${saIdentifier}: gcloud iam service-accounts add-iam-policy-binding "${saIdentifier}" --member="user:<YOUR_EMAIL>" --role="roles/iam.serviceAccountUser" --project="${projectId}"`
  );
};

