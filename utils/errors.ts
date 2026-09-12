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
