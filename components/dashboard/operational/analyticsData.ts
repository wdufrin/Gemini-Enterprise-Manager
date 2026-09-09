// BigQuery View DDLs, Column Definitions, and Fallback Snapshot Data for Operational Analytics
import { ColumnDef } from './DataTable';
import { FALLBACK_ROWS } from './fallbackRows';

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

const hasTable = (tables: Set<string> | string[] | undefined, name: string): boolean => {
    if (!tables) return false;
    return tables instanceof Set ? tables.has(name) : tables.includes(name);
};

const hasMatchingTable = (tables: Set<string> | string[] | undefined, prefix: string): boolean => {
    if (!tables) return false;
    const list = tables instanceof Set ? Array.from(tables) : tables;
    return list.some(t => t.includes(prefix));
};

export const OPERATIONAL_VIEWS: Record<string, ViewDefinition> = {
    // 1. User Activity
    v_consolidated_user_activity: {
        id: 'v_consolidated_user_activity',
        viewName: 'v_consolidated_user_activity',
        title: 'User Activity & Sessions',
        description: 'Interactive session logs with agent attribution, method calls, and user activity timelines.',
        category: 'User Interactions',
        columns: [
            { key: 'event_time', header: 'Event Time', type: 'timestamp' },
            { key: 'user_email', header: 'User Email' },
            { key: 'agent_name', header: 'Agent Name', type: 'badge' },
            { key: 'method_name', header: 'Method', type: 'badge' },
            { key: 'session_id', header: 'Session ID', type: 'mono' }
        ],
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            if (hasTable(tables, 'gemini_assist_activity')) {
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_user_activity\` AS
SELECT 
  user_email, 
  timestamp AS event_time, 
  COALESCE(REGEXP_EXTRACT(answer_name, r'/engines/([^/]+)'), 'General Assistant') AS agent_name, 
  REGEXP_EXTRACT(answer_name, r'/engines/([^/]+)') AS agent_id, 
  COALESCE(REGEXP_EXTRACT(answer_name, r'sessions/([^/]+)'), trace) AS session_id, 
  method_name, 
  trace AS insertId 
FROM \`${projectId}.${dataset}.gemini_assist_activity\`;`;
            }
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_user_activity\` AS
SELECT 
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal') AS user_email, 
  timestamp AS event_time, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.displayname'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayname'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.name'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.engine'), r'/engines/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.name'), r'/engines/([^/]+)')
  ) AS agent_name, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agentsspec.agentspecs[0].agentid'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.agent'), r'/agents/([^/]+)'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.agentid')
  ) AS agent_id, 
  COALESCE(
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.name'), r'sessions/([^/]+)'), 
    trace
  ) AS session_id, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodName')
  ) AS method_name, 
  insertId 
FROM \`${projectId}.${dataset}.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*\`;`;
        },
        getQuery: (projectId: string, dataset: string) => `SELECT
  DATE(event_time) AS event_date,
  COALESCE(agent_name, 'General Assistant') AS agent_name,
  COUNT(1) AS activity_count,
  COUNT(DISTINCT session_id) AS session_count,
  COUNT(DISTINCT user_email) AS unique_users
FROM \`${projectId}.${dataset}.v_consolidated_user_activity\`
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC
LIMIT 100;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  event_time,
  user_email,
  COALESCE(agent_name, 'General Assistant') AS agent_name,
  method_name,
  session_id
FROM \`${projectId}.${dataset}.v_consolidated_user_activity\`
ORDER BY event_time DESC
LIMIT 100;`
    },

    // 2. GenAI Telemetry & Tools
    v_gemini_genai_telemetry: {
        id: 'v_gemini_genai_telemetry',
        viewName: 'v_gemini_genai_telemetry',
        title: 'GenAI Telemetry & Tool Invocations',
        description: 'Token consumption, model inferences, prompts, responses, and 1,800+ tool calls with full arguments.',
        category: 'Model & Ingestion',
        columns: [
            { key: 'timestamp', header: 'Timestamp', type: 'timestamp' },
            { key: 'agent_name', header: 'Agent Name', type: 'badge' },
            { key: 'finish_reason', header: 'Finish Reason', type: 'badge' },
            { key: 'input_tokens', header: 'In Tokens' },
            { key: 'output_tokens', header: 'Out Tokens' },
            { key: 'tool_calls', header: 'Tools Executed', type: 'mono' },
            { key: 'user_prompt', header: 'User Prompt' }
        ],
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            const hasAssist = hasTable(tables, 'gemini_assist_activity');
            if (hasAssist) {
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_genai_telemetry\` AS
WITH raw_inferences AS (
  SELECT
    t.timestamp,
    t.trace,
    COALESCE(JSON_VALUE(t.json_payload, '$.\"user.id\"'), 'user') AS user_id,
    JSON_VALUE(t.json_payload, '$.\"gen_ai.conversation.id\"') AS conversation_id,
    COALESCE(
      JSON_VALUE(t.json_payload, '$.\"gen_ai.agent.name\"'),
      'root_agent'
    ) AS raw_agent_name,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\n')
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$.\"gen_ai.input.messages\"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.content') IS NOT NULL
    ) AS user_prompt,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\n')
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$.\"gen_ai.output.messages\"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.content') IS NOT NULL
    ) AS model_response,
    (
      SELECT STRING_AGG(
        CONCAT(
          JSON_VALUE(p, '$.name'),
          IF(JSON_QUERY(p, '$.arguments') IS NOT NULL, CONCAT('(', TO_JSON_STRING(JSON_QUERY(p, '$.arguments')), ')'), '')
        ),
        '; '
      )
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$.\"gen_ai.output.messages\"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.name') IS NOT NULL
    ) AS tool_calls,
    CAST(JSON_VALUE(t.json_payload, '$.\"gen_ai.usage.input_tokens\"') AS INT64) AS input_tokens,
    CAST(JSON_VALUE(t.json_payload, '$.\"gen_ai.usage.output_tokens\"') AS INT64) AS output_tokens,
    COALESCE(
      JSON_VALUE(t.json_payload, '$.\"gen_ai.response.finish_reasons\"[0]'),
      'stop'
    ) AS finish_reason
  FROM \`${projectId}.ge_analytics_link._AllLogs\` t
  WHERE t.log_name LIKE '%gen_ai.client.inference.operation.details%'
  QUALIFY ROW_NUMBER() OVER(PARTITION BY t.insert_id ORDER BY t.timestamp DESC) = 1
),
assist_agents AS (
  SELECT
    COALESCE(REGEXP_EXTRACT(answer_name, r'sessions/([^/]+)'), trace) AS session_id,
    COALESCE(REGEXP_EXTRACT(answer_name, r'/engines/([^/]+)'), 'General Assistant') AS agent_name
  FROM \`${projectId}.${dataset}.gemini_assist_activity\`
  QUALIFY ROW_NUMBER() OVER(PARTITION BY COALESCE(REGEXP_EXTRACT(answer_name, r'sessions/([^/]+)'), trace) ORDER BY timestamp DESC) = 1
)
SELECT
  r.timestamp,
  r.trace,
  r.user_id,
  r.conversation_id,
  COALESCE(
    NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(a.agent_name, r'_[0-9]+.*$', ''), r'-[0-9]+.*$', ''), 'root_agent'),
    NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(r.raw_agent_name, r'_[0-9]+.*$', ''), r'-[0-9]+.*$', ''), 'root_agent'),
    'General Assistant'
  ) AS agent_name,
  r.user_prompt,
  r.model_response,
  r.tool_calls,
  r.input_tokens,
  r.output_tokens,
  r.finish_reason
FROM raw_inferences r
LEFT JOIN assist_agents a
ON COALESCE(r.conversation_id, r.trace) = a.session_id;`;
            }

            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_genai_telemetry\` AS
WITH raw_inferences AS (
  SELECT
    t.timestamp,
    t.trace,
    COALESCE(JSON_VALUE(t.json_payload, '$.\"user.id\"'), 'user') AS user_id,
    JSON_VALUE(t.json_payload, '$.\"gen_ai.conversation.id\"') AS conversation_id,
    COALESCE(
      JSON_VALUE(t.json_payload, '$.\"gen_ai.agent.name\"'),
      'General Assistant'
    ) AS raw_agent_name,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\n')
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$.\"gen_ai.input.messages\"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.content') IS NOT NULL
    ) AS user_prompt,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\n')
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$.\"gen_ai.output.messages\"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.content') IS NOT NULL
    ) AS model_response,
    (
      SELECT STRING_AGG(
        CONCAT(
          JSON_VALUE(p, '$.name'),
          IF(JSON_QUERY(p, '$.arguments') IS NOT NULL, CONCAT('(', TO_JSON_STRING(JSON_QUERY(p, '$.arguments')), ')'), '')
        ),
        '; '
      )
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$.\"gen_ai.output.messages\"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.name') IS NOT NULL
    ) AS tool_calls,
    CAST(JSON_VALUE(t.json_payload, '$.\"gen_ai.usage.input_tokens\"') AS INT64) AS input_tokens,
    CAST(JSON_VALUE(t.json_payload, '$.\"gen_ai.usage.output_tokens\"') AS INT64) AS output_tokens,
    COALESCE(
      JSON_VALUE(t.json_payload, '$.\"gen_ai.response.finish_reasons\"[0]'),
      'stop'
    ) AS finish_reason
  FROM \`${projectId}.ge_analytics_link._AllLogs\` t
  WHERE t.log_name LIKE '%gen_ai.client.inference.operation.details%'
)
SELECT
  timestamp,
  trace,
  user_id,
  conversation_id,
  COALESCE(
    NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(raw_agent_name, r'_[0-9]+.*$', ''), r'-[0-9]+.*$', ''), 'root_agent'),
    'General Assistant'
  ) AS agent_name,
  user_prompt,
  model_response,
  tool_calls,
  input_tokens,
  output_tokens,
  finish_reason
FROM raw_inferences;`;
        },
        getQuery: (projectId: string, dataset: string) => `SELECT
  agent_name,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  COUNT(1) AS inference_count
FROM \`${projectId}.${dataset}.v_gemini_genai_telemetry\`
GROUP BY agent_name
ORDER BY (total_input_tokens + total_output_tokens) DESC
LIMIT 10;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  timestamp,
  agent_name,
  finish_reason,
  input_tokens,
  output_tokens,
  tool_calls,
  user_prompt,
  model_response,
  trace,
  conversation_id
FROM \`${projectId}.${dataset}.v_gemini_genai_telemetry\`
ORDER BY timestamp DESC
LIMIT 100;`
    },

    // 3. User Connector Usage (All-Time)
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
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_user_connector_usage\` AS
WITH raw_tool_calls AS (
  SELECT
    t.trace,
    t.timestamp,
    COALESCE(JSON_VALUE(p, "$.id"), t.span_id, t.insert_id, GENERATE_UUID()) AS call_id,
    JSON_VALUE(p, "$.name") AS tool_name,
    "Agent Tool" AS connector_type,
    JSON_VALUE(t.json_payload, "$.\\"user.id\\"") AS direct_user_id
  FROM \`${projectId}.ge_analytics_link._AllLogs\` t,
  UNNEST(JSON_QUERY_ARRAY(t.json_payload, "$.\\"gen_ai.output.messages\\"")) m,
  UNNEST(JSON_QUERY_ARRAY(m, "$.parts")) p
  WHERE t.log_name LIKE "%gen_ai.client.inference.operation.details%"
    AND JSON_VALUE(p, "$.name") IS NOT NULL

  UNION ALL

  SELECT
    t.trace,
    t.timestamp,
    COALESCE(JSON_VALUE(p, "$.function_call.id"), t.insert_id) AS call_id,
    JSON_VALUE(p, "$.function_call.name") AS tool_name,
    "Agent Tool" AS connector_type,
    CAST(NULL AS STRING) AS direct_user_id
  FROM \`${projectId}.ge_analytics_link._AllLogs\` t,
  UNNEST(JSON_QUERY_ARRAY(t.json_payload, "$.content.parts")) p
  WHERE t.log_name LIKE "%gen_ai.user.message%"
    AND JSON_VALUE(p, "$.function_call.name") IS NOT NULL
),
search_calls AS (
  SELECT
    t.trace,
    t.timestamp,
    t.insert_id AS call_id,
    COALESCE(
      REGEXP_EXTRACT(JSON_VALUE(t.json_payload, "$.logMetadata.name"), r"/engines/([a-zA-Z0-9_-]+?)(?:[-_][0-9]{10,})"),
      REGEXP_EXTRACT(JSON_VALUE(t.json_payload, "$.logMetadata.name"), r"/engines/([^/]+)")
    ) AS tool_name,
    "Search Data Source" AS connector_type,
    JSON_VALUE(t.json_payload, "$.userIamPrincipal") AS direct_user_id
  FROM \`${projectId}.ge_analytics_link._AllLogs\` t
  WHERE t.log_name LIKE "%gemini_enterprise_user_activity%"
    AND JSON_VALUE(t.json_payload, "$.logMetadata.methodName") = "Search"
),
all_events AS (
  SELECT * FROM raw_tool_calls
  UNION ALL
  SELECT * FROM search_calls
),
user_map AS (
  SELECT
    trace,
    JSON_VALUE(json_payload, "$.userIamPrincipal") AS user_email
  FROM \`${projectId}.ge_analytics_link._AllLogs\`
  WHERE log_name LIKE "%gemini_enterprise_user_activity%"
    AND JSON_VALUE(json_payload, "$.userIamPrincipal") IS NOT NULL
    AND trace IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY trace ORDER BY timestamp DESC) = 1
),
connector_events AS (
  SELECT
    COALESCE(
      IF(CONTAINS_SUBSTR(e.direct_user_id, "@"), e.direct_user_id, NULL),
      u.user_email,
      e.direct_user_id,
      "Unknown / Unattributed"
    ) AS user_email,
    e.connector_type,
    INITCAP(REPLACE(
      REGEXP_REPLACE(
        COALESCE(
          REGEXP_EXTRACT(e.tool_name, r"^([a-zA-Z0-9_]+?)(?:_agent)?__"),
          REGEXP_EXTRACT(e.tool_name, r"^([a-zA-Z0-9_]+?)_tool$"),
          e.tool_name
        ),
        r"_agent$", ""
      ),
      "_", " "
    )) AS connector_name,
    e.tool_name,
    e.call_id,
    e.timestamp
  FROM all_events e
  LEFT JOIN user_map u ON e.trace = u.trace
  WHERE NOT REGEXP_CONTAINS(e.tool_name, r"^(selfawareness|generate_memories|transfer_to|tool_code_executor|invalid_tool_call|google:python)")
)
SELECT
  user_email,
  connector_name,
  connector_type,
  COUNT(DISTINCT call_id) AS usage_count,
  MIN(timestamp) AS first_used_at,
  MAX(timestamp) AS last_used_at,
  STRING_AGG(DISTINCT tool_name, ", ") AS tools_used
FROM connector_events
WHERE connector_name IS NOT NULL
GROUP BY user_email, connector_name, connector_type;`,
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

    // 4. User Connector Usage (30 Days)
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

    // 5. Consolidated AI Choices
    v_consolidated_ai_choices: {
        id: 'v_consolidated_ai_choices',
        viewName: 'v_consolidated_ai_choices',
        title: 'AI Generation Choices',
        description: 'Model finish reasons (STOP, MAX_TOKENS, SAFETY, UNEXPECTED_TOOL_CALL) and generation outputs.',
        category: 'Model & Ingestion',
        columns: [
            { key: 'timestamp', header: 'Timestamp', type: 'timestamp' },
            { key: 'finish_reason', header: 'Finish Reason', type: 'badge' },
            { key: 'role', header: 'Role', type: 'badge' },
            { key: 'table_date', header: 'Partition' },
            { key: 'trace', header: 'Trace ID', type: 'mono' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_ai_choices\` AS
SELECT 
  timestamp,
  insertId,
  trace,
  COALESCE(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.finishReason'), 'STOP') AS finish_reason,
  COALESCE(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.content.role'), 'model') AS role,
  _TABLE_SUFFIX AS table_date
FROM \`${projectId}.${dataset}.discoveryengine_googleapis_com_gen_ai_choice_*\`
QUALIFY ROW_NUMBER() OVER(PARTITION BY insertId ORDER BY timestamp DESC) = 1;`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  COALESCE(finish_reason, 'STOP') AS finish_reason,
  COUNT(1) AS count
FROM \`${projectId}.${dataset}.v_consolidated_ai_choices\`
GROUP BY finish_reason
ORDER BY count DESC;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  timestamp,
  finish_reason,
  role,
  table_date,
  trace
FROM \`${projectId}.${dataset}.v_consolidated_ai_choices\`
ORDER BY timestamp DESC
LIMIT 100;`
    },

    // 6. Agent Feedback Summary
    v_agent_feedback: {
        id: 'v_agent_feedback',
        viewName: 'v_agent_feedback',
        title: 'Agent Feedback Summary',
        description: 'End-user sentiment ratings, thumbs up / thumbs down counts, reasons, and comment feedback.',
        category: 'Feedback & Quality',
        columns: [
            { key: 'event_time', header: 'Submitted At', type: 'timestamp' },
            { key: 'agent_name', header: 'Agent Name', type: 'badge' },
            { key: 'feedback', header: 'Rating', type: 'badge' },
            { key: 'reason', header: 'Reason' },
            { key: 'comment', header: 'User Comment' },
            { key: 'user_email', header: 'User Email' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_agent_feedback\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS event_time,
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal') AS user_email,
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.feedbacktype') AS feedback,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.reasons[0]'),
      'REASON_UNSPECIFIED'
    ) AS reason,
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.comment') AS comment,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.name'),
      REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.engine'), r'/engines/([^/]+)')
    ) AS fallback_agent_name,
    trace
  FROM \`${projectId}.${dataset}.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*\`
  WHERE JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.eventtype') = 'add-feedback'
)
SELECT
  COALESCE(fallback_agent_name, 'General Assistant') AS agent_name,
  COALESCE(feedback, 'LIKE') AS feedback,
  reason,
  comment,
  event_time,
  user_email
FROM feedback_events;`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  agent_name,
  COUNTIF(feedback IN ('LIKE', 'THUMBS_UP', 'POSITIVE')) AS thumbs_up,
  COUNTIF(feedback IN ('DISLIKE', 'THUMBS_DOWN', 'NEGATIVE')) AS thumbs_down,
  COUNT(1) AS total_feedback
FROM \`${projectId}.${dataset}.v_agent_feedback\`
GROUP BY agent_name
ORDER BY total_feedback DESC;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  event_time,
  agent_name,
  feedback,
  reason,
  comment,
  user_email
FROM \`${projectId}.${dataset}.v_agent_feedback\`
ORDER BY event_time DESC
LIMIT 100;`
    },

    // 7. Admin Feedback Review
    v_admin_feedback_review: {
        id: 'v_admin_feedback_review',
        viewName: 'v_admin_feedback_review',
        title: 'Admin Feedback Review',
        description: 'Executive review feed of end-user feedback, sentiment ratings, and prompt/response triage.',
        category: 'Feedback & Quality',
        columns: [
            { key: 'feedback_time', header: 'Feedback Time', type: 'timestamp' },
            { key: 'user_email', header: 'User Email' },
            { key: 'agent_name', header: 'Agent Name', type: 'badge' },
            { key: 'feedback_type', header: 'Feedback', type: 'badge' },
            { key: 'feedback_comment', header: 'Comment' },
            { key: 'prompt', header: 'User Prompt' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_admin_feedback_review\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS feedback_time,
    JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
    JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType) AS feedback_type,
    TO_JSON_STRING(json_payload.request.userEvent.feedback.reasons) AS feedback_reasons,
    JSON_VALUE(json_payload.request.userEvent.feedback.comment) AS feedback_comment,
    JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken) AS assist_token,
    insert_id
  FROM \`${projectId}.ge_analytics_link._AllLogs\`
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.request.userEvent.eventType) = 'add-feedback'
  QUALIFY ROW_NUMBER() OVER(PARTITION BY insert_id ORDER BY timestamp DESC) = 1
),
interaction_events AS (
  SELECT
    JSON_VALUE(json_payload.response.assistToken) AS assist_token,
    trace,
    COALESCE(
      JSON_VALUE(json_payload.response.agentInfo.displayName),
      JSON_VALUE(json_payload.request.agent.displayName),
      REGEXP_EXTRACT(JSON_VALUE(json_payload.logMetadata.name), r'/engines/([^/]+)')
    ) AS agent_name,
    COALESCE(
      JSON_VALUE(json_payload.serviceTextReply),
      JSON_VALUE(json_payload.response.answer.replies[0].content.text),
      JSON_VALUE(json_payload.response.answer.replies[0].groundedContent.content.text)
    ) AS response_text,
    COALESCE(
      JSON_VALUE(json_payload.request.query.text),
      (SELECT STRING_AGG(JSON_VALUE(p.text), '\n') FROM UNNEST(JSON_QUERY_ARRAY(json_payload.request.query.parts)) p),
      JSON_VALUE(json_payload.request.userEvent.searchInfo.searchQuery)
    ) AS prompt
  FROM \`${projectId}.ge_analytics_link._AllLogs\`
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.response.assistToken) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY JSON_VALUE(json_payload.response.assistToken) ORDER BY timestamp DESC) = 1
)
SELECT
  f.feedback_time,
  f.user_email,
  i.agent_name,
  f.feedback_type,
  f.feedback_reasons,
  f.feedback_comment,
  i.prompt,
  i.response_text AS response,
  f.assist_token,
  i.trace
FROM feedback_events f
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  COALESCE(agent_name, 'General Assistant') AS agent_name,
  COUNT(1) AS count
FROM \`${projectId}.${dataset}.v_admin_feedback_review\`
GROUP BY 1
ORDER BY 2 DESC;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  feedback_time,
  user_email,
  agent_name,
  feedback_type,
  feedback_reasons,
  feedback_comment,
  prompt,
  response,
  assist_token
FROM \`${projectId}.${dataset}.v_admin_feedback_review\`
ORDER BY feedback_time DESC
LIMIT 100;`
    },

    // 8. Detailed Agent Feedback Turns
    v_agent_feedback_detailed: {
        id: 'v_agent_feedback_detailed',
        viewName: 'v_agent_feedback_detailed',
        title: 'Detailed Feedback Turns',
        description: 'Turn-by-turn prompts, agent answers, assist tokens, and feedback comments.',
        category: 'Feedback & Quality',
        columns: [
            { key: 'feedback_time', header: 'Time', type: 'timestamp' },
            { key: 'user_email', header: 'User' },
            { key: 'underlying_agent_name', header: 'Agent', type: 'badge' },
            { key: 'feedback_type', header: 'Rating', type: 'badge' },
            { key: 'prompt', header: 'User Prompt' },
            { key: 'result', header: 'Agent Answer' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_agent_feedback_detailed\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS feedback_time,
    JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
    JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType) AS feedback_type,
    TO_JSON_STRING(json_payload.request.userEvent.feedback.reasons) AS feedback_reasons,
    JSON_VALUE(json_payload.request.userEvent.feedback.comment) AS feedback_comment,
    JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken) AS assist_token
  FROM \`${projectId}.ge_analytics_link._AllLogs\`
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.request.userEvent.eventType) = 'add-feedback'
),
interaction_events AS (
  SELECT
    JSON_VALUE(json_payload.response.assistToken) AS assist_token,
    trace,
    COALESCE(
      JSON_VALUE(json_payload.serviceTextReply),
      JSON_VALUE(json_payload.response.answer.replies[0].content.text)
    ) AS result,
    COALESCE(
      JSON_VALUE(json_payload.response.agentInfo.displayName),
      JSON_VALUE(json_payload.request.agent.displayName)
    ) AS underlying_agent_name,
    COALESCE(
      JSON_VALUE(json_payload.request.agentsSpec.agentSpecs[0].agentId),
      REGEXP_EXTRACT(JSON_VALUE(json_payload.response.agentInfo.agent), r'/agents/([^/]+)')
    ) AS underlying_agent_id,
    REGEXP_EXTRACT(JSON_VALUE(json_payload.logMetadata.name), r'/engines/([^/]+)') AS gemini_enterprise_app_id,
    COALESCE(
      JSON_VALUE(json_payload.request.query.text),
      (SELECT STRING_AGG(JSON_VALUE(p.text), '\n') FROM UNNEST(JSON_QUERY_ARRAY(json_payload.request.query.parts)) p)
    ) AS prompt
  FROM \`${projectId}.ge_analytics_link._AllLogs\`
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.response.assistToken) IS NOT NULL
)
SELECT
  f.feedback_time,
  f.user_email,
  i.underlying_agent_name,
  i.underlying_agent_id,
  i.gemini_enterprise_app_id,
  f.feedback_type,
  f.feedback_reasons,
  f.feedback_comment,
  i.prompt,
  i.result,
  f.assist_token
FROM feedback_events f
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  COALESCE(underlying_agent_name, 'General Assistant') AS agent_name,
  COUNT(1) AS count
FROM \`${projectId}.${dataset}.v_agent_feedback_detailed\`
GROUP BY 1
ORDER BY 2 DESC;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  feedback_time,
  user_email,
  underlying_agent_name,
  feedback_type,
  prompt,
  result,
  feedback_comment,
  assist_token
FROM \`${projectId}.${dataset}.v_agent_feedback_detailed\`
ORDER BY feedback_time DESC
LIMIT 100;`
    },

    // 9. Consolidated User Messages
    v_consolidated_user_messages: {
        id: 'v_consolidated_user_messages',
        viewName: 'v_consolidated_user_messages',
        title: 'Consolidated User Messages',
        description: 'Chat turn histories, role payloads, and multi-shard message volumes across agent sessions.',
        category: 'User Interactions',
        columns: [
            { key: 'timestamp', header: 'Timestamp', type: 'timestamp' },
            { key: 'severity', header: 'Severity', type: 'badge' },
            { key: 'role', header: 'Role', type: 'badge' },
            { key: 'parts_count', header: 'Parts Count' },
            { key: 'table_date', header: 'Date Shard' },
            { key: 'trace', header: 'Trace ID', type: 'mono' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_user_messages\` AS
SELECT 
  timestamp,
  severity,
  trace,
  spanId,
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.content.role') AS role,
  ARRAY_LENGTH(JSON_QUERY_ARRAY(TO_JSON_STRING(jsonPayload), '$.content.parts')) AS parts_count,
  _TABLE_SUFFIX AS table_date
FROM \`${projectId}.${dataset}.discoveryengine_googleapis_com_gen_ai_user_message_*\`
WHERE _TABLE_SUFFIX >= '20260425'
QUALIFY ROW_NUMBER() OVER(PARTITION BY insertId ORDER BY timestamp DESC) = 1;`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  DATE(timestamp) AS message_date,
  COALESCE(severity, 'DEFAULT') AS severity,
  COUNT(1) AS message_count
FROM \`${projectId}.${dataset}.v_consolidated_user_messages\`
GROUP BY 1, 2
ORDER BY 1 DESC
LIMIT 100;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  timestamp,
  severity,
  role,
  parts_count,
  table_date,
  trace
FROM \`${projectId}.${dataset}.v_consolidated_user_messages\`
ORDER BY timestamp DESC
LIMIT 100;`
    },

    // 10. Gemini Assist Activity
    v_gemini_assist_activity: {
        id: 'v_gemini_assist_activity',
        viewName: 'v_gemini_assist_activity',
        title: 'Gemini Assist Activity',
        description: 'Assist-level queries, answers, and completion states from Enterprise assistants.',
        category: 'Gemini Enterprise',
        columns: [
            { key: 'timestamp', header: 'Timestamp', type: 'timestamp' },
            { key: 'user_email', header: 'User Email' },
            { key: 'method_name', header: 'Method', type: 'badge' },
            { key: 'answer_state', header: 'State', type: 'badge' },
            { key: 'user_query', header: 'User Query' },
            { key: 'assistant_response', header: 'Assistant Response' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_assist_activity\` AS
SELECT
  timestamp,
  trace,
  JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
  JSON_VALUE(json_payload.logMetadata.methodName) AS method_name,
  COALESCE(
    JSON_VALUE(json_payload.request.query.text),
    (SELECT STRING_AGG(JSON_VALUE(p.text), "\n") FROM UNNEST(JSON_QUERY_ARRAY(json_payload.request.query.parts)) p)
  ) AS user_query,
  JSON_VALUE(json_payload.serviceTextReply) AS assistant_response,
  JSON_VALUE(json_payload.response.answer.name) AS answer_name,
  JSON_VALUE(json_payload.response.answer.state) AS answer_state
FROM \`${projectId}.ge_analytics_link._AllLogs\`
WHERE log_name LIKE "%gemini_enterprise_user_activity%"
  AND JSON_VALUE(json_payload.logMetadata.methodName) IN ("StreamAssist", "Assist")
QUALIFY ROW_NUMBER() OVER(PARTITION BY insert_id ORDER BY timestamp DESC) = 1;`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  DATE(timestamp) AS assist_date,
  method_name,
  COUNT(1) AS query_count
FROM \`${projectId}.${dataset}.v_gemini_assist_activity\`
GROUP BY 1, 2
ORDER BY 1 DESC
LIMIT 100;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  timestamp,
  user_email,
  method_name,
  answer_state,
  user_query,
  assistant_response,
  trace
FROM \`${projectId}.${dataset}.v_gemini_assist_activity\`
ORDER BY timestamp DESC
LIMIT 100;`
    },

    // 11. Gemini Search Activity
    v_gemini_search_activity: {
        id: 'v_gemini_search_activity',
        viewName: 'v_gemini_search_activity',
        title: 'Gemini Search Operations',
        description: 'Enterprise Search queries, data source retrieval operations, and caller emails.',
        category: 'Gemini Enterprise',
        columns: [
            { key: 'timestamp', header: 'Timestamp', type: 'timestamp' },
            { key: 'user_email', header: 'User Email' },
            { key: 'method_name', header: 'Method', type: 'badge' },
            { key: 'search_query', header: 'Search Query' },
            { key: 'attribution_token', header: 'Attribution Token', type: 'mono' }
        ],
        getDdl: (projectId: string, dataset: string) => `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_search_activity\` AS
SELECT
  timestamp,
  trace,
  JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
  JSON_VALUE(json_payload.logMetadata.methodName) AS method_name,
  JSON_VALUE(json_payload.request.query) AS search_query,
  JSON_VALUE(json_payload.response.attributionToken) AS attribution_token,
  ARRAY(
    SELECT JSON_VALUE(r.id)
    FROM UNNEST(JSON_QUERY_ARRAY(json_payload.response.results)) r
  ) AS result_ids
FROM \`${projectId}.ge_analytics_link._AllLogs\`
WHERE log_name LIKE "%gemini_enterprise_user_activity%"
  AND JSON_VALUE(json_payload.logMetadata.methodName) = "Search"
QUALIFY ROW_NUMBER() OVER(PARTITION BY insert_id ORDER BY timestamp DESC) = 1;`,
        getQuery: (projectId: string, dataset: string) => `SELECT
  DATE(timestamp) AS search_date,
  COUNT(1) AS search_count
FROM \`${projectId}.${dataset}.v_gemini_search_activity\`
GROUP BY 1
ORDER BY 1 DESC
LIMIT 100;`,
        getRowsQuery: (projectId: string, dataset: string) => `SELECT
  timestamp,
  user_email,
  method_name,
  search_query,
  attribution_token,
  trace
FROM \`${projectId}.${dataset}.v_gemini_search_activity\`
ORDER BY timestamp DESC
LIMIT 100;`
    }
};

export const VIEW_CATEGORIES = [
    {
        title: 'Dashboard',
        items: [{ id: 'overview', title: 'Global Overview', badge: 'Live' }]
    },
    {
        title: 'Connectors & Tools',
        items: [
            { id: 'v_user_connector_usage', title: 'Connector Usage (All)', count: 19 },
            { id: 'v_user_connector_usage_30d', title: 'Connector Usage (30d)', count: 17 }
        ]
    },
    {
        title: 'User Interactions',
        items: [
            { id: 'v_consolidated_user_activity', title: 'User Activity', count: '8.1k' },
            { id: 'v_consolidated_user_messages', title: 'User Messages', count: '8.2k' }
        ]
    },
    {
        title: 'Model & Telemetry',
        items: [
            { id: 'v_gemini_genai_telemetry', title: 'GenAI Telemetry & Tools', count: '2.5k' },
            { id: 'v_consolidated_ai_choices', title: 'AI Generation Choices', count: '10.9k' }
        ]
    },
    {
        title: 'Gemini Enterprise',
        items: [
            { id: 'v_gemini_assist_activity', title: 'Assist Activity', count: 882 },
            { id: 'v_gemini_search_activity', title: 'Search Operations', count: 274 }
        ]
    },
    {
        title: 'Feedback & Quality',
        items: [
            { id: 'v_admin_feedback_review', title: 'Admin Feedback Review', count: 4 },
            { id: 'v_agent_feedback', title: 'Agent Feedback Summary', count: 4 },
            { id: 'v_agent_feedback_detailed', title: 'Detailed Feedback Turns', count: 4 }
        ]
    }
];

// Fallback Mock Snapshot Data
export const FALLBACK_SNAPSHOT = {
    overviewKpis: {
        totalInteractions: 8155,
        totalTelemetry: 2578,
        totalTokens: 35700000,
        toolCallsCount: 1813,
        activeConnectors: 17
    },
    dailyActivity: [
        { date: '08-01', count: 184 },
        { date: '08-02', count: 92 },
        { date: '08-03', count: 215 },
        { date: '08-04', count: 480 },
        { date: '08-05', count: 730 },
        { date: '08-06', count: 1120 },
        { date: '08-07', count: 960 },
        { date: '08-08', count: 1450 },
        { date: '08-09', count: 1220 },
        { date: '08-10', count: 1680 }
    ],
    agentPopularity: [
        { name: 'Cosmere Data Agent', value: 3553 },
        { name: 'Entraid-Test Agent', value: 1928 },
        { name: 'Sharepoint Search', value: 987 },
        { name: 'Hidden GE 2', value: 634 },
        { name: 'Support Router', value: 489 },
        { name: 'Ingestion Search', value: 316 }
    ],
    genaiTelemetryTokens: [
        { agent: 'Cosmere Agent', inputTokens: 14200000, outputTokens: 3100000 },
        { agent: 'Entraid Test', inputTokens: 8900000, outputTokens: 1450000 },
        { agent: 'Sharepoint Agent', inputTokens: 5200000, outputTokens: 980000 },
        { agent: 'Support Router', inputTokens: 2100000, outputTokens: 420000 },
        { agent: 'Search Connector', inputTokens: 950000, outputTokens: 190000 }
    ],
    toolInvocations: [
        { tool: 'sharepoint_agent__search_tool', count: 987 },
        { tool: 'ingestion_search_agent', count: 316 },
        { tool: 'cosmere', count: 256 },
        { tool: 'google_search_tool', count: 142 },
        { tool: 'jira__search_issues', count: 46 },
        { tool: 'google_drive_agent__search_drive_tool', count: 34 },
        { tool: 'email_agent__search_email_tool', count: 12 }
    ],
    connectorUsageAll: [
        { connector_name: 'Sharepoint', connector_type: 'Agent Tool', usage_count: '987', tools_used: 'sharepoint_agent__search_tool', user_email: 'qos-test-user@wdufrin.onmicrosoft.com', first_used_at: '2026-08-10 13:24:58', last_used_at: '2026-08-13 13:04:44' },
        { connector_name: 'Ingestion Search', connector_type: 'Agent Tool', usage_count: '316', tools_used: 'ingestion_search_agent__ingestion_search_tool', user_email: 'qos-test-user@wdufrin.onmicrosoft.com', first_used_at: '2026-08-10 00:00:31', last_used_at: '2026-08-19 15:26:07' },
        { connector_name: 'Cosmere', connector_type: 'Search Data Source', usage_count: '259', tools_used: 'cosmere', user_email: 'admin@wdufrin.altostrat.com', first_used_at: '2026-08-10 13:07:12', last_used_at: '2026-09-09 16:04:53' },
        { connector_name: 'Google Search', connector_type: 'Agent Tool', usage_count: '9', tools_used: 'google_search_tool', user_email: 'admin@wdufrin.altostrat.com', first_used_at: '2026-08-10 13:07:43', last_used_at: '2026-08-27 15:23:09' },
        { connector_name: 'Email', connector_type: 'Agent Tool', usage_count: '4', tools_used: 'email_agent__search_email_tool', user_email: 'admin@wdufrin.altostrat.com', first_used_at: '2026-08-13 16:26:37', last_used_at: '2026-08-19 15:26:02' },
        { connector_name: 'Google Drive', connector_type: 'Agent Tool', usage_count: '3', tools_used: 'google_drive_agent__search_drive_tool', user_email: 'admin@wdufrin.altostrat.com', first_used_at: '2026-08-17 11:34:50', last_used_at: '2026-08-19 15:26:02' },
        { connector_name: 'Jira', connector_type: 'Agent Tool', usage_count: '2', tools_used: 'jira__search_issues', user_email: 'admin@wdufrin.altostrat.com', first_used_at: '2026-08-13 16:26:37', last_used_at: '2026-08-17 11:35:03' }
    ],
    connectorUsage30d: [
        { connector: 'Sharepoint', calls: 987, users: 4 },
        { connector: 'Ingestion Search', calls: 316, users: 3 },
        { connector: 'Cosmere Search', calls: 256, users: 2 },
        { connector: 'Google Search', calls: 9, users: 1 },
        { connector: 'Email', calls: 4, users: 1 },
        { connector: 'Google Drive', calls: 3, users: 1 },
        { connector: 'Jira', calls: 2, users: 1 }
    ],
    topConnectorUsers: [
        { user: 'qos-test-user@wdufrin.onmicrosoft.com', calls: 745 },
        { user: 'admin@wdufrin.altostrat.com', calls: 396 },
        { user: '180054373655-compute@developer.gserviceaccount.com', calls: 120 },
        { user: 'wdufrin@wdufrin.onmicrosoft.com', calls: 94 }
    ],
    aiFinishReasons: [
        { name: 'STOP', value: 8940 },
        { name: 'FINISH_UNSPECIFIED', value: 1890 },
        { name: 'MAX_TOKENS', value: 124 },
        { name: 'SAFETY', value: 28 },
        { name: 'UNEXPECTED_TOOL_CALL', value: 3 }
    ],
    agentFeedback: [
        { agent: 'Enterprise Data Agent', thumbsUp: 1, thumbsDown: 3, total: 4 },
        { agent: 'Sharepoint Agent', thumbsUp: 12, thumbsDown: 2, total: 14 },
        { agent: 'Core Assistant', thumbsUp: 28, thumbsDown: 4, total: 32 },
        { agent: 'Calendar Agent', thumbsUp: 5, thumbsDown: 0, total: 5 }
    ],
    rows: FALLBACK_ROWS
};
