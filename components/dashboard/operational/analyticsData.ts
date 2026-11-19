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

export const DEFAULT_PARTITION_PRUNING_DAYS = 30;

const VIEW_TIME_COLUMNS: Record<string, string> = {
  v_consolidated_user_activity: "event_time",
  v_consolidated_user_messages: "timestamp",
  v_gemini_assist_activity: "timestamp",
  v_gemini_search_activity: "timestamp",
  v_gemini_genai_telemetry: "timestamp",
  v_consolidated_ai_choices: "timestamp",
  v_agent_feedback: "event_time",
  v_admin_feedback_review: "feedback_time",
  v_agent_feedback_detailed: "feedback_time",
  v_user_connector_usage: "last_used_at",
  v_user_connector_usage_30d: "last_used_at",
};

/**
 * Injects a 30-day partition-pruning filter into a flat BigQuery view query if no
 * TIMESTAMP_SUB lookback clause is already present.
 *
 * Note: Uses Regex Pattern Matching on structured template SQL clauses (WHERE / GROUP BY / ORDER BY / LIMIT).
 * Known limits: Designed for single-SELECT view queries in OPERATIONAL_VIEWS rather than arbitrary nested SQL ASTs.
 */
export const applyPartitionPruningToQuery = (
  sql: string,
  timeColumn: string = "timestamp",
  lookbackDays: number = DEFAULT_PARTITION_PRUNING_DAYS,
): string => {
  if (/TIMESTAMP_SUB\s*\(\s*CURRENT_TIMESTAMP\s*\(\s*\)/i.test(sql)) {
    return sql;
  }
  const condition = `${timeColumn} >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${lookbackDays} DAY)`;
  const tailClauseMatch = sql.match(/\n\s*(GROUP\s+BY|ORDER\s+BY|LIMIT)\b/i);
  if (tailClauseMatch && tailClauseMatch.index !== undefined) {
    const head = sql.slice(0, tailClauseMatch.index);
    const tail = sql.slice(tailClauseMatch.index);
    const hasWhere = /\bWHERE\b/i.test(head);
    return hasWhere
      ? `${head}\n  AND ${condition}${tail}`
      : `${head}\nWHERE ${condition}${tail}`;
  }
  const trimmed = sql.replace(/;\s*$/, "");
  const hasWhere = /\bWHERE\b/i.test(trimmed);
  return hasWhere ? `${trimmed}\n  AND ${condition};` : `${trimmed}\nWHERE ${condition};`;
};

/**
 * Injects `timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)` partition pruning
 * onto raw Cloud Logging BigQuery sink table scans inside an inline subquery.
 *
 * Note: Uses Regex Pattern Matching on known Cloud Logging sink table SQL templates; does not parse arbitrary SQL ASTs.
 */
export const applyRawSinkPartitionPruning = (
  subqueryBody: string,
  lookbackDays: number = DEFAULT_PARTITION_PRUNING_DAYS,
): string => {
  const tsFilter = `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${lookbackDays} DAY)`;
  let pruned = subqueryBody;

  // 1. _AllLogs scans aliased as `t`
  pruned = pruned.replace(
    /(FROM\s+`[^`]+\._AllLogs`\s+t[\s\S]*?\bWHERE\s+)(?!t\.timestamp\s*>=)/g,
    `$1t.timestamp >= ${tsFilter} AND `,
  );

  // 2. Unaliased _AllLogs scans
  pruned = pruned.replace(
    /(FROM\s+`[^`]+\._AllLogs`\s*\n\s*WHERE\s+)(?!timestamp\s*>=)/g,
    `$1timestamp >= ${tsFilter} AND `,
  );

  // 3. Per-shard UNION ALL branches (`SELECT timestamp, ... FROM \`proj.ds.table_YYYYMMDD\``)
  pruned = pruned.replace(
    /(SELECT\s+timestamp,\s+insertId,\s+trace,\s+spanId,\s+severity,\s+PARSE_JSON\(TO_JSON_STRING\(jsonPayload\)\)\s+AS\s+jsonPayload,\s+'[0-9]{8}'\s+AS\s+_TABLE_SUFFIX\s+FROM\s+`[^`]+`)(?!\s+WHERE)/g,
    `$1 WHERE timestamp >= ${tsFilter}`,
  );

  // 4. Inner projection subqueries `(SELECT ... FROM \`proj.ds.sink_table\`\n  )` without a WHERE clause
  pruned = pruned.replace(
    /(FROM\s+`[^`]+\.(?:discoveryengine_googleapis_com_[a-z0-9_*]+|gemini_assist_activity|gemini_genai_telemetry)`)(\s*\n\s*\))/g,
    `$1\n    WHERE timestamp >= ${tsFilter}$2`,
  );

  // 5. Direct sink scans followed immediately by WHERE or QUALIFY
  pruned = pruned.replace(
    /(FROM\s+`[^`]+\.(?:discoveryengine_googleapis_com_[a-z0-9_*]+|gemini_assist_activity|gemini_genai_telemetry)`\s*\n)(\s*WHERE\s+)(?!timestamp\s*>=)/g,
    `$1$2timestamp >= ${tsFilter} AND `,
  );
  pruned = pruned.replace(
    /(FROM\s+`[^`]+\.(?:discoveryengine_googleapis_com_[a-z0-9_*]+|gemini_assist_activity|gemini_genai_telemetry)`\s*\n)(\s*QUALIFY\b)/g,
    `$1WHERE timestamp >= ${tsFilter}\n$2`,
  );
  pruned = pruned.replace(
    /(FROM\s+`[^`]+\.gemini_assist_activity`)(\s*)$/,
    `$1\nWHERE timestamp >= ${tsFilter}$2`,
  );

  return pruned;
};

const RAW_OPERATIONAL_VIEWS: Record<string, ViewDefinition> = {
  ...userViews,
  ...telemetryFeedbackViews,
  ...connectorViews,
};

export const OPERATIONAL_VIEWS: Record<string, ViewDefinition> = Object.fromEntries(
  Object.entries(RAW_OPERATIONAL_VIEWS).map(([viewId, def]) => {
    const timeCol = VIEW_TIME_COLUMNS[viewId] || "timestamp";
    return [
      viewId,
      {
        ...def,
        getQuery: (projectId: string, dataset: string) =>
          applyPartitionPruningToQuery(def.getQuery(projectId, dataset), timeCol),
        getRowsQuery: (projectId: string, dataset: string) =>
          applyPartitionPruningToQuery(def.getRowsQuery(projectId, dataset), timeCol),
      },
    ];
  }),
);

/**
 * Builds an inline parenthesized subquery `(WITH ... SELECT ...)` that reads directly
 * from the main Cloud Logging BigQuery sink tables for `viewId` without requiring any
 * `v_*` views to be created in the dataset, applying 30-day partition pruning on base tables.
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
  } else {
    body = applyRawSinkPartitionPruning(body);
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


