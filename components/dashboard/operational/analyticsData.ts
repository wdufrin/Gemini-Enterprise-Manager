// BigQuery View DDLs, Column Definitions, and Fallback Snapshot Data for Operational Analytics
import {
  ViewDefinition,
  getNonViewTableSet,
  extractViewSelectBody,
} from "./views/helpers";
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

/**
 * Builds an inline parenthesized subquery `(WITH ... SELECT ...)` that reads directly
 * from the main Cloud Logging BigQuery sink tables for `viewId` without requiring any
 * `v_*` views to be created in the dataset.
 */
export const buildMainTableSubqueryForView = (
  viewId: string,
  projectId: string,
  dataset: string,
  tables?: Set<string> | string[],
): string => {
  const viewDef = OPERATIONAL_VIEWS[viewId];
  if (!viewDef) {
    return `\`${projectId}.${dataset}.${viewId}\``;
  }
  const baseTables = getNonViewTableSet(tables);
  let body = extractViewSelectBody(viewDef.getDdl(projectId, dataset, baseTables));

  // Inline upstream view reference for v_user_connector_usage_30d -> v_user_connector_usage
  const upstreamViewRef = `\`${projectId}.${dataset}.v_user_connector_usage\``;
  if (viewId === "v_user_connector_usage_30d" && body.includes(upstreamViewRef)) {
    const upstreamSubquery = buildMainTableSubqueryForView(
      "v_user_connector_usage",
      projectId,
      dataset,
      baseTables,
    );
    body = body.split(upstreamViewRef).join(upstreamSubquery);
  }

  return `(\n${body}\n)`;
};

/**
 * Rewrites any SQL query targeting `\`projectId.dataset.viewName\`` so that it queries
 * the underlying main Cloud Logging sink tables directly via an inline subquery.
 */
export const rewriteViewQueryToMainTables = (
  sql: string,
  viewId: string,
  projectId: string,
  dataset: string,
  tables?: Set<string> | string[],
  actualViewName?: string,
): string => {
  if (!OPERATIONAL_VIEWS[viewId]) return sql;
  const subquery = buildMainTableSubqueryForView(viewId, projectId, dataset, tables);
  let rewritten = sql;

  const targetNames = Array.from(
    new Set([actualViewName, OPERATIONAL_VIEWS[viewId].viewName, viewId].filter(Boolean) as string[]),
  );

  for (const name of targetNames) {
    const fullRef = `\`${projectId}.${dataset}.${name}\``;
    if (rewritten.includes(fullRef)) {
      rewritten = rewritten.split(fullRef).join(subquery);
    }
  }

  return rewritten;
};


