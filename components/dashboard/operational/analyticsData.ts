// BigQuery View DDLs, Column Definitions, and Fallback Snapshot Data for Operational Analytics
import { ViewDefinition } from "./views/helpers";
import { userViews } from "./views/userViews";
import { telemetryFeedbackViews } from "./views/telemetryFeedbackViews";
import { connectorViews } from "./views/connectorViews";

export * from "./views/helpers";
export * from "./views/categories";
export { FALLBACK_ROWS } from "./fallbackRows";
export { FALLBACK_SNAPSHOT } from "./fallbacks/fallbackSnapshot";

export const OPERATIONAL_VIEWS: Record<string, ViewDefinition> = {
  ...userViews,
  ...telemetryFeedbackViews,
  ...connectorViews,
};

