import { ViewDefinition, hasTable, hasMatchingTable, getLogsSource } from "./helpers";

export const connectorViews: Record<string, ViewDefinition> = {
v_user_connector_usage: {
        id: 'v_user_connector_usage',
        viewName: 'v_user_connector_usage',
        title: 'Connector Usage (All-Time)',
        description: 'Cumulative invocations across Sharepoint, Drive, Jira, Cosmere, Search, and custom agent tools.',
        category: 'Connectors & Tools',
        columns: [
            { key: 'user_email', header: 'User Email' },
            { key: 'connector_name', header: 'Connector Name', type: 'badge' },
            { key: 'connector_type', header: 'Type', type: 'badge' },
            { key: 'usage_count', header: 'Usage Count' },
            { key: 'tools_used', header: 'Tools Invoked', type: 'mono' },
            { key: 'first_used_at', header: 'First Used', type: 'timestamp' },
            { key: 'last_used_at', header: 'Last Used', type: 'timestamp' }
        ],
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            const logsSource = getLogsSource(projectId, dataset, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_user_connector_usage\` AS
WITH unified_calls AS (
  SELECT
    t.trace,
    t.timestamp,
    COALESCE(
      JSON_VALUE(p, "$.id"),
      t.span_id,
      t.insert_id,
      TO_HEX(SHA256(CONCAT(t.trace, CAST(t.timestamp AS STRING), JSON_VALUE(p, "$.name"))))
    ) AS call_id,
    JSON_VALUE(p, "$.name") AS tool_name,
    "Agent Tool" AS connector_type
  FROM ${logsSource} t,
  UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$."gen_ai.output.messages"')) m,
  UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
  WHERE t.log_name LIKE '%gen_ai.client.inference.operation.details%'
    AND JSON_VALUE(p, "$.name") IS NOT NULL

  UNION DISTINCT

  SELECT
    t.trace,
    t.timestamp,
    t.insert_id AS call_id,
    COALESCE(
      REGEXP_EXTRACT(JSON_VALUE(t.json_payload, "$.logMetadata.name"), r"/engines/([a-zA-Z0-9_-]+?)(?:[-_][0-9]{10,})"),
      REGEXP_EXTRACT(JSON_VALUE(t.json_payload, "$.logMetadata.name"), r"/engines/([^/]+)")
    ) AS tool_name,
    "Search Data Source" AS connector_type
  FROM ${logsSource} t
  WHERE t.log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(t.json_payload, "$.logMetadata.methodName") = "Search"
),
user_map AS (
  SELECT
    trace,
    JSON_VALUE(json_payload.userIamPrincipal) AS user_email
  FROM ${logsSource}
  WHERE log_name LIKE "%gemini_enterprise_user_activity%"
    AND JSON_VALUE(json_payload.userIamPrincipal) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY trace ORDER BY timestamp DESC) = 1
)
SELECT
  COALESCE(u.user_email, "Unattributed Service / Job") AS user_email,
  c.connector_type,
  INITCAP(REPLACE(
    REGEXP_REPLACE(
      COALESCE(
        REGEXP_EXTRACT(c.tool_name, r"^([a-zA-Z0-9_]+?)(?:_agent)?__"),
        REGEXP_EXTRACT(c.tool_name, r"^([a-zA-Z0-9_]+?)_tool$"),
        c.tool_name
      ),
      r"_agent$", ""
    ),
    "_", " "
  )) AS connector_name,
  COUNT(DISTINCT c.call_id) AS usage_count,
  MIN(c.timestamp) AS first_used_at,
  MAX(c.timestamp) AS last_used_at,
  STRING_AGG(DISTINCT c.tool_name, ", ") AS tools_used
FROM unified_calls c
LEFT JOIN user_map u ON c.trace = u.trace
WHERE NOT REGEXP_CONTAINS(c.tool_name, r"^(selfawareness|generate_memories|transfer_to|tool_code_executor|invalid_tool_call|google:python)")
GROUP BY user_email, connector_name, connector_type;`;
        },
        getQuery: (projectId: string, dataset: string) => `SELECT
  connector_name,
  connector_type,
  SUM(usage_count) AS total_usage,
  COUNT(DISTINCT user_email) AS unique_users
FROM \`${projectId}.${dataset}.v_user_connector_usage\`
GROUP BY connector_name, connector_type
ORDER BY total_usage DESC;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  user_email,
  connector_name,
  connector_type,
  usage_count,
  tools_used,
  first_used_at,
  last_used_at
FROM \`${projectId}.${dataset}.v_user_connector_usage\`
ORDER BY CAST(usage_count AS INT64) DESC
LIMIT 100;`
    },

    // 4. User Connector Usage (30 Days),
v_user_connector_usage_30d: {
        id: 'v_user_connector_usage_30d',
        viewName: 'v_user_connector_usage_30d',
        title: 'Connector Usage (Past 30 Days)',
        description: 'Rolling 30-day active connector adoption with first and last usage timestamps.',
        category: 'Connectors & Tools',
        columns: [
            { key: 'user_email', header: 'User Email' },
            { key: 'connector_name', header: 'Connector Name', type: 'badge' },
            { key: 'connector_type', header: 'Type', type: 'badge' },
            { key: 'usage_count', header: 'Usage Count' },
            { key: 'tools_used', header: 'Tools Invoked', type: 'mono' },
            { key: 'first_used_at', header: 'First Used', type: 'timestamp' },
            { key: 'last_used_at', header: 'Last Used', type: 'timestamp' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_user_connector_usage_30d\` AS
SELECT *
FROM \`${projectId}.${dataset}.v_user_connector_usage\`
WHERE last_used_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
   OR first_used_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY);`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  connector_name,
  connector_type,
  SUM(usage_count) AS total_usage,
  COUNT(DISTINCT user_email) AS unique_users
FROM \`${projectId}.${dataset}.v_user_connector_usage_30d\`
GROUP BY connector_name, connector_type
ORDER BY total_usage DESC;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  user_email,
  connector_name,
  connector_type,
  usage_count,
  tools_used,
  first_used_at,
  last_used_at
FROM \`${projectId}.${dataset}.v_user_connector_usage_30d\`
ORDER BY CAST(usage_count AS INT64) DESC
LIMIT 100;`
  },
};

