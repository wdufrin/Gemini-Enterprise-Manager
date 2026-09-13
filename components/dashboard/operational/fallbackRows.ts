// Snapshot fallback rows extracted from actual BigQuery logs for offline or uninstalled operational views
import { feedbackFallbacks } from "./fallbacks/feedbackFallbacks";
import { activityFallbacks } from "./fallbacks/activityFallbacks";
import { connectorFallbacks } from "./fallbacks/connectorFallbacks";

export const FALLBACK_ROWS: Record<string, any[]> = {
  ...feedbackFallbacks,
  ...activityFallbacks,
  ...connectorFallbacks,
};
