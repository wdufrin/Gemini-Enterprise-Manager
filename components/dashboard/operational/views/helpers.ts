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

export const getShardedTables = (
  tables: Set<string> | string[] | undefined,
  baseTable: string,
  maxShards: number = 90,
): string[] => {
  if (!tables) return [];
  const list = tables instanceof Set ? Array.from(tables) : tables;
  const prefix = `${baseTable}_`;
  return list
    .filter((t) => {
      if (!t.startsWith(prefix)) return false;
      const suffix = t.slice(prefix.length);
      return /^\d{8}$/.test(suffix);
    })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxShards);
};

/**
 * Resolves the appropriate BigQuery table reference for a Cloud Logging sink table.
 * - When multiple date-sharded fragments (`${baseTable}_YYYYMMDD`) exist in `tables` and
 *   the un-suffixed partitioned base table does not exist, builds a per-shard `UNION ALL`
 *   subquery that serializes each shard's `jsonPayload` independently via
 *   `PARSE_JSON(TO_JSON_STRING(jsonPayload))`. This avoids BigQuery wildcard (`_*`)
 *   cross-shard STRUCT unification failures (e.g. `Cannot resolve field 'parts' inside
 *   leaf column 'jsonPayload.request.query' of type STRING`) and prevents wildcard scans
 *   from dropping nested STRUCT fields absent from the newest daily shard.
 * - Uses `${baseTable}_*` when only a single shard or non-date suffix exists.
 * - Uses `${baseTable}` (without trailing `_*`) when the un-suffixed partitioned table
 *   exists OR when no date-sharded fragments exist.
 */
export const resolveSinkTable = (
  projectId: string,
  dataset: string,
  baseTable: string,
  tables?: Set<string> | string[],
): { tableRef: string; isWildcard: boolean; hasAnyTable: boolean } => {
  const hasExact = hasTable(tables, baseTable);
  const shardTables = getShardedTables(tables, baseTable);
  const hasShards = shardTables.length > 0 || hasShardedTable(tables, baseTable);
  const useWildcard = !hasExact && hasShards;

  if (useWildcard && shardTables.length > 1) {
    const unionBranches = shardTables.map((t) => {
      const suffix = t.slice(baseTable.length + 1);
      return `SELECT timestamp, insertId, trace, spanId, severity, PARSE_JSON(TO_JSON_STRING(jsonPayload)) AS jsonPayload, '${suffix}' AS _TABLE_SUFFIX FROM \`${projectId}.${dataset}.${t}\``;
    });
    return {
      tableRef: `(\n    ${unionBranches.join('\n    UNION ALL\n    ')}\n  )`,
      isWildcard: true,
      hasAnyTable: true,
    };
  }

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

export type DataSourceMode = 'views' | 'tables';

/**
 * Filters a set/array of table names to exclude `v_*` operational views,
 * leaving only base Cloud Logging sink tables.
 */
export const getNonViewTableSet = (
  tables?: Set<string> | string[],
): Set<string> => {
  if (!tables) return new Set();
  const list = tables instanceof Set ? Array.from(tables) : tables;
  return new Set(
    list.filter((t) => typeof t === 'string' && t.length > 0 && !t.toLowerCase().startsWith('v_')),
  );
};

/**
 * Returns true if the dataset contains the underlying Cloud Logging sink table(s)
 * needed to execute `viewId` directly without creating a BigQuery view.
 */
export const hasMainTablesForView = (
  viewId: string,
  tables?: Set<string> | string[],
): boolean => {
  const baseTables = getNonViewTableSet(tables);
  if (baseTables.size === 0) return false;
  if (hasTable(baseTables, '_AllLogs')) return true;

  switch (viewId) {
    case 'v_consolidated_user_messages':
      return (
        hasTable(baseTables, USER_MESSAGE_TABLE) ||
        hasShardedTable(baseTables, USER_MESSAGE_TABLE)
      );
    case 'v_gemini_genai_telemetry':
      return (
        hasTable(baseTables, INFERENCE_DETAILS_TABLE) ||
        hasShardedTable(baseTables, INFERENCE_DETAILS_TABLE) ||
        hasTable(baseTables, 'gemini_genai_telemetry')
      );
    case 'v_consolidated_ai_choices':
      return (
        hasTable(baseTables, AI_CHOICE_TABLE) ||
        hasShardedTable(baseTables, AI_CHOICE_TABLE) ||
        hasTable(baseTables, 'gemini_genai_telemetry')
      );
    default:
      return (
        hasTable(baseTables, USER_ACTIVITY_TABLE) ||
        hasShardedTable(baseTables, USER_ACTIVITY_TABLE)
      );
  }
};

/**
 * Extracts the standalone `SELECT ...` / `WITH ... SELECT ...` body from a
 * `CREATE OR REPLACE VIEW \`project.dataset.view\` AS ...;` DDL statement.
 */
export const extractViewSelectBody = (ddl: string): string => {
  return ddl
    .replace(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+`[^`]+`\s+AS\s+/i, '')
    .replace(/;\s*$/, '')
    .trim();
};

