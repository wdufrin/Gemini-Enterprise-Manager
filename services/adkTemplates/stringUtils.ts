/**
 * Renders an arbitrary user string as a Python triple-quoted literal.
 */
export function formatPythonString(str: string): string {
  if (str === null || str === undefined) return '""';
  if (str === "") return '""';
  return JSON.stringify(str);
}
