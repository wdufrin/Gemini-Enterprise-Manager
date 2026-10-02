import { ColumnDef } from '../DataTable';

export interface ViewDefinition {
  id: string;
  viewName: string;
  title: string;
  description: string;
  category: string;
  columns: ColumnDef[];
  getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => string;
  getQuery: (projectId: string, dataset: string) => string;
  getRowsQuery: (projectId: string, dataset: string) => string;
}

export const USER_ACTIVITY_TABLE =
  'discoveryengine_googleapis_com_gemini_enterprise_user_activity';
export const USER_MESSAGE_TABLE =
  'discoveryengine_googleapis_com_gen_ai_user_message';
export const AI_CHOICE_TABLE =
  'discoveryengine_googleapis_com_gen_ai_choice';
export const INFERENCE_DETAILS_TABLE =
  'discoveryengine_googleapis_com_gen_ai_client_inference_operation_details';

export const hasTable = (
  tables: Set<string> | string[] | undefined,
  name: string,
): boolean => {
  if (!tables) return false;
  return tables instanceof Set ? tables.has(name) : tables.includes(name);
};

export const hasMatchingTable = (
  tables: Set<string> | string[] | undefined,
  prefix: string,
): boolean => {
  if (!tables) return false;
  const list = tables instanceof Set ? Array.from(tables) : tables;
  return list.some((t) => t.includes(prefix));
};

/**
 * Returns true if `tables` contains any date-sharded fragments for `baseTable`
 * (e.g. `discoveryengine_googleapis_com_gemini_enterprise_user_activity_20260801`).
 */
export const hasShardedTable = (
  tables: Set<string> | string[] | undefined,
  baseTable: string,
): boolean => {
  if (!tables) return false;
  const list = tables instanceof Set ? Array.from(tables) : tables;
  const prefix = `${baseTable}_`;
  return list.some((t) => t.startsWith(prefix));
};

/**
 * Resolves the appropriate BigQuery table reference for a Cloud Logging sink table.
 * - Uses `${baseTable}_*` ONLY when date-sharded fragments (`${baseTable}_YYYYMMDD`)
 *   exist in `tables` and the un-suffixed partitioned base table does not exist.
 * - Uses `${baseTable}` (without trailing `_*`) when the un-suffixed partitioned table
 *   exists OR when no date-sharded fragments exist, preventing BigQuery from failing with:
 *   `<project>:<dataset>.<baseTable>_* does not match any table.`
 */
export const resolveSinkTable = (
  projectId: string,
  dataset: string,
  baseTable: string,
  tables?: Set<string> | string[],
): { tableRef: string; isWildcard: boolean; hasAnyTable: boolean } => {
  const hasExact = hasTable(tables, baseTable);
  const hasShards = hasShardedTable(tables, baseTable);
  const useWildcard = !hasExact && hasShards;
  const tableName = useWildcard ? `${baseTable}_*` : baseTable;
  return {
    tableRef: `\`${projectId}.${dataset}.${tableName}\``,
    isWildcard: useWildcard,
    hasAnyTable: hasExact || hasShards,
  };
};

export const getLogsSource = (
  projectId: string,
  dataset: string,
  tables?: Set<string> | string[],
): string => {
  if (hasTable(tables, '_AllLogs')) {
    return `\`${projectId}.${dataset}._AllLogs\``;
  }
  return `\`${projectId}.ge_analytics_link._AllLogs\``;
};

/**
 * Toggles a DDL string between un-suffixed partitioned sink table references
 * and `_*` date-sharded wildcard table references. Used as an automatic retry
 * when the local `tables` list in state is stale relative to BigQuery.
 */
export const toggleWildcardInDdl = (ddl: string): string | null => {
  const sinkBases = [
    USER_ACTIVITY_TABLE,
    USER_MESSAGE_TABLE,
    AI_CHOICE_TABLE,
    INFERENCE_DETAILS_TABLE,
  ];

  let changed = false;
  let updated = ddl;

  for (const base of sinkBases) {
    const wildcardPattern = new RegExp(`\\.${base}_\\*\``, 'g');
    const exactPattern = new RegExp(`\\.${base}\``, 'g');

    if (wildcardPattern.test(updated)) {
      updated = updated.replace(wildcardPattern, `.${base}\``);
      updated = updated.replace(
        /\b_TABLE_SUFFIX\s+AS\s+table_date\b/g,
        "FORMAT_TIMESTAMP('%Y%m%d', timestamp) AS table_date",
      );
      changed = true;
    } else if (exactPattern.test(updated)) {
      updated = updated.replace(exactPattern, `.${base}_*\``);
      changed = true;
    }
  }

  return changed ? updated : null;
};

/**
 * Generates an empty, schema-compatible BigQuery view DDL (`FROM (SELECT 1) WHERE FALSE`)
 * for newly created log sinks where Cloud Logging has not flushed any log tables or
 * fragments into the dataset yet. This allows views to be provisioned immediately
 * without failing with `does not match any table` or `Not found: Table`.
 */
export const getEmptyViewDdl = (
  projectId: string,
  dataset: string,
  viewId: string,
): string | null => {
  const target = `\`${projectId}.${dataset}.${viewId}\``;
  switch (viewId) {
    case 'v_consolidated_user_activity':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS STRING) AS user_email,
  CAST(NULL AS TIMESTAMP) AS event_time,
  CAST(NULL AS STRING) AS agent_name,
  CAST(NULL AS STRING) AS agent_id,
  CAST(NULL AS STRING) AS session_id,
  CAST(NULL AS STRING) AS method_name,
  CAST(NULL AS STRING) AS insertId
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_consolidated_user_messages':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS TIMESTAMP) AS timestamp,
  CAST(NULL AS STRING) AS severity,
  CAST(NULL AS STRING) AS trace,
  CAST(NULL AS STRING) AS spanId,
  CAST(NULL AS STRING) AS role,
  CAST(NULL AS INT64) AS parts_count,
  CAST(NULL AS STRING) AS table_date
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_gemini_assist_activity':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS TIMESTAMP) AS timestamp,
  CAST(NULL AS STRING) AS trace,
  CAST(NULL AS STRING) AS user_email,
  CAST(NULL AS STRING) AS method_name,
  CAST(NULL AS STRING) AS user_query,
  CAST(NULL AS STRING) AS assistant_response,
  CAST(NULL AS STRING) AS answer_name,
  CAST(NULL AS STRING) AS answer_state
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_gemini_search_activity':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS TIMESTAMP) AS timestamp,
  CAST(NULL AS STRING) AS trace,
  CAST(NULL AS STRING) AS user_email,
  CAST(NULL AS STRING) AS method_name,
  CAST(NULL AS STRING) AS search_query,
  CAST(NULL AS STRING) AS attribution_token,
  ARRAY<STRING>[] AS result_ids
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_user_connector_usage':
    case 'v_user_connector_usage_30d':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS STRING) AS user_email,
  CAST(NULL AS STRING) AS connector_type,
  CAST(NULL AS STRING) AS connector_name,
  CAST(NULL AS INT64) AS usage_count,
  CAST(NULL AS TIMESTAMP) AS first_used_at,
  CAST(NULL AS TIMESTAMP) AS last_used_at,
  CAST(NULL AS STRING) AS tools_used
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_gemini_genai_telemetry':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS TIMESTAMP) AS timestamp,
  CAST(NULL AS STRING) AS trace,
  CAST(NULL AS STRING) AS span_id,
  CAST(NULL AS STRING) AS user_email,
  CAST(NULL AS STRING) AS conversation_id,
  CAST(NULL AS STRING) AS agent_name,
  CAST(NULL AS INT64) AS step_index,
  CAST(NULL AS INT64) AS total_steps,
  CAST(NULL AS BOOL) AS is_final_step,
  CAST(NULL AS STRING) AS user_prompt,
  CAST(NULL AS STRING) AS model_response,
  CAST(NULL AS STRING) AS tool_calls,
  CAST(NULL AS INT64) AS input_tokens,
  CAST(NULL AS INT64) AS output_tokens,
  CAST(NULL AS STRING) AS finish_reason
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_consolidated_ai_choices':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS TIMESTAMP) AS timestamp,
  CAST(NULL AS STRING) AS insertId,
  CAST(NULL AS STRING) AS trace,
  CAST(NULL AS STRING) AS finish_reason,
  CAST(NULL AS STRING) AS role,
  CAST(NULL AS STRING) AS table_date
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_agent_feedback':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS STRING) AS agent_name,
  CAST(NULL AS STRING) AS feedback,
  CAST(NULL AS STRING) AS reason,
  CAST(NULL AS STRING) AS comment,
  CAST(NULL AS TIMESTAMP) AS event_time,
  CAST(NULL AS STRING) AS user_email
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_admin_feedback_review':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS TIMESTAMP) AS feedback_time,
  CAST(NULL AS STRING) AS user_email,
  CAST(NULL AS STRING) AS agent_name,
  CAST(NULL AS STRING) AS feedback_type,
  CAST(NULL AS STRING) AS feedback_reasons,
  CAST(NULL AS STRING) AS feedback_comment,
  CAST(NULL AS STRING) AS prompt,
  CAST(NULL AS STRING) AS response,
  CAST(NULL AS STRING) AS assist_token,
  CAST(NULL AS STRING) AS trace
FROM (SELECT 1) WHERE FALSE;`;

    case 'v_agent_feedback_detailed':
      return `CREATE OR REPLACE VIEW ${target} AS
SELECT
  CAST(NULL AS TIMESTAMP) AS feedback_time,
  CAST(NULL AS STRING) AS user_email,
  CAST(NULL AS STRING) AS underlying_agent_name,
  CAST(NULL AS STRING) AS underlying_agent_id,
  CAST(NULL AS STRING) AS gemini_enterprise_app_id,
  CAST(NULL AS STRING) AS feedback_type,
  CAST(NULL AS STRING) AS feedback_reasons,
  CAST(NULL AS STRING) AS feedback_comment,
  CAST(NULL AS STRING) AS prompt,
  CAST(NULL AS STRING) AS result,
  CAST(NULL AS STRING) AS assist_token
FROM (SELECT 1) WHERE FALSE;`;

    default:
      return null;
  }
};
