import { ViewDefinition, hasTable, hasMatchingTable, getLogsSource } from "./helpers";

export const userViews: Record<string, ViewDefinition> = {
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
  CONCAT(trace, '-', CAST(timestamp AS STRING)) AS insertId 
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

    // 2. GenAI Telemetry & Tools,
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
WHERE _TABLE_SUFFIX NOT IN ('20260423', '20260424')
QUALIFY ROW_NUMBER() OVER(PARTITION BY insertId ORDER BY timestamp DESC) = 1

UNION ALL

SELECT 
  timestamp,
  severity,
  trace,
  spanId,
  'user' AS role,
  0 AS parts_count,
  '20260423' AS table_date
FROM \`${projectId}.${dataset}.discoveryengine_googleapis_com_gen_ai_user_message_20260423\`
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

    // 10. Gemini Assist Activity,
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
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            const logsSource = getLogsSource(projectId, dataset, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_assist_activity\` AS
SELECT
  timestamp,
  trace,
  JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
  JSON_VALUE(json_payload.logMetadata.methodName) AS method_name,
  COALESCE(
    JSON_VALUE(json_payload.request.query.text),
    (SELECT STRING_AGG(JSON_VALUE(p.text), '\\n') FROM UNNEST(JSON_QUERY_ARRAY(json_payload.request.query.parts)) p)
  ) AS user_query,
  JSON_VALUE(json_payload.serviceTextReply) AS assistant_response,
  JSON_VALUE(json_payload.response.answer.name) AS answer_name,
  JSON_VALUE(json_payload.response.answer.state) AS answer_state
FROM ${logsSource}
WHERE log_name LIKE "%gemini_enterprise_user_activity%"
  AND JSON_VALUE(json_payload.logMetadata.methodName) IN ("StreamAssist", "Assist")
QUALIFY ROW_NUMBER() OVER(PARTITION BY insert_id ORDER BY timestamp DESC) = 1;`;
        },
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

    // 11. Gemini Search Activity,
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
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            const logsSource = getLogsSource(projectId, dataset, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_search_activity\` AS
SELECT
  timestamp,
  COALESCE(trace, insert_id) AS trace,
  JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
  JSON_VALUE(json_payload.logMetadata.methodName) AS method_name,
  JSON_VALUE(json_payload.request.query) AS search_query,
  JSON_VALUE(json_payload.response.attributionToken) AS attribution_token,
  ARRAY(
    SELECT JSON_VALUE(r.id)
    FROM UNNEST(JSON_QUERY_ARRAY(json_payload.response.results)) r
  ) AS result_ids
FROM ${logsSource}
WHERE log_name LIKE "%gemini_enterprise_user_activity%"
  AND JSON_VALUE(json_payload.logMetadata.methodName) = "Search"
QUALIFY ROW_NUMBER() OVER(PARTITION BY insert_id ORDER BY timestamp DESC) = 1;`;
        },
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
    },
};

