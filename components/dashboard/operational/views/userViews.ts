import {
    ViewDefinition,
    hasTable,
    getLogsSource,
    resolveSinkTable,
    USER_ACTIVITY_TABLE,
    USER_MESSAGE_TABLE
} from "./helpers";

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

            const sinkActivity = resolveSinkTable(projectId, dataset, USER_ACTIVITY_TABLE, tables);
            if (!sinkActivity.hasAnyTable && hasTable(tables, '_AllLogs')) {
                const logsSource = getLogsSource(projectId, dataset, tables);
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_user_activity\` AS
SELECT 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.useriamprincipal'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.userIamPrincipal')
  ) AS user_email, 
  timestamp AS event_time, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.response.agentinfo.displayname'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.response.agentInfo.displayName'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.agent.displayname'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.agent.displayName'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.userevent.agentspaceinfo.agentinfo.name'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.userEvent.agentspaceInfo.agentInfo.name'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.userevent.engine'), r'/engines/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.userEvent.engine'), r'/engines/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(json_payload), '$.logmetadata.name'), r'/engines/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(json_payload), '$.logMetadata.name'), r'/engines/([^/]+)')
  ) AS agent_name, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.agentsspec.agentspecs[0].agentid'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.agentsSpec.agentSpecs[0].agentId'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(json_payload), '$.response.agentinfo.agent'), r'/agents/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(json_payload), '$.response.agentInfo.agent'), r'/agents/([^/]+)'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.userevent.agentspaceinfo.agentinfo.agentid'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.request.userEvent.agentspaceInfo.agentInfo.agentId')
  ) AS agent_id, 
  COALESCE(
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(json_payload), '$.response.answer.name'), r'sessions/([^/]+)'), 
    trace
  ) AS session_id, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.logmetadata.methodname'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.logMetadata.methodName')
  ) AS method_name, 
  insert_id AS insertId 
FROM ${logsSource}
WHERE log_name LIKE '%gemini_enterprise_user_activity%';`;
            }

            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_user_activity\` AS
SELECT 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal')
  ) AS user_email, 
  timestamp AS event_time, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.displayname'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentInfo.displayName'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayname'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayName'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.name'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.agentspaceInfo.agentInfo.name'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.engine'), r'/engines/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.engine'), r'/engines/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.name'), r'/engines/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.name'), r'/engines/([^/]+)')
  ) AS agent_name, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agentsspec.agentspecs[0].agentid'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agentsSpec.agentSpecs[0].agentId'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.agent'), r'/agents/([^/]+)'),
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentInfo.agent'), r'/agents/([^/]+)'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.agentid'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.agentspaceInfo.agentInfo.agentId')
  ) AS agent_id, 
  COALESCE(
    REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.name'), r'sessions/([^/]+)'), 
    trace
  ) AS session_id, 
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.methodName')
  ) AS method_name, 
  insertId 
FROM ${sinkActivity.tableRef};`;
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
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            const sinkMessages = resolveSinkTable(projectId, dataset, USER_MESSAGE_TABLE, tables);
            if (!sinkMessages.hasAnyTable && hasTable(tables, '_AllLogs')) {
                const logsSource = getLogsSource(projectId, dataset, tables);
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_user_messages\` AS
SELECT 
  timestamp,
  severity,
  trace,
  span_id AS spanId,
  COALESCE(JSON_VALUE(TO_JSON_STRING(json_payload), '$.content.role'), 'user') AS role,
  COALESCE(ARRAY_LENGTH(JSON_QUERY_ARRAY(TO_JSON_STRING(json_payload), '$.content.parts')), 0) AS parts_count,
  FORMAT_TIMESTAMP('%Y%m%d', timestamp) AS table_date
FROM ${logsSource}
WHERE log_name LIKE '%gen_ai.user_message%' OR log_name LIKE '%gen_ai_user_message%'
QUALIFY ROW_NUMBER() OVER(PARTITION BY insert_id ORDER BY timestamp DESC) = 1;`;
            }

            const tableDateExpr = sinkMessages.isWildcard
                ? '_TABLE_SUFFIX AS table_date'
                : "FORMAT_TIMESTAMP('%Y%m%d', timestamp) AS table_date";

            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_user_messages\` AS
SELECT 
  timestamp,
  severity,
  trace,
  spanId,
  COALESCE(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.content.role'), 'user') AS role,
  COALESCE(ARRAY_LENGTH(JSON_QUERY_ARRAY(TO_JSON_STRING(jsonPayload), '$.content.parts')), 0) AS parts_count,
  ${tableDateExpr}
FROM ${sinkMessages.tableRef}
QUALIFY ROW_NUMBER() OVER(PARTITION BY insertId ORDER BY timestamp DESC) = 1;`;
        },
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
            if (hasTable(tables, '_AllLogs')) {
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
            }

            const sinkActivity = resolveSinkTable(projectId, dataset, USER_ACTIVITY_TABLE, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_assist_activity\` AS
SELECT
  timestamp,
  trace,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal')
  ) AS user_email,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.methodName'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname')
  ) AS method_name,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.query.text'),
    (SELECT STRING_AGG(JSON_VALUE(p, '$.text'), '\\n') FROM UNNEST(JSON_QUERY_ARRAY(TO_JSON_STRING(jsonPayload), '$.request.query.parts')) p)
  ) AS user_query,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.serviceTextReply'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.servicetextreply')
  ) AS assistant_response,
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.name') AS answer_name,
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.state') AS answer_state
FROM ${sinkActivity.tableRef}
WHERE COALESCE(
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.methodName'),
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname')
) IN ("StreamAssist", "Assist")
QUALIFY ROW_NUMBER() OVER(PARTITION BY insertId ORDER BY timestamp DESC) = 1;`;
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
            if (hasTable(tables, '_AllLogs')) {
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
            }

            const sinkActivity = resolveSinkTable(projectId, dataset, USER_ACTIVITY_TABLE, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_search_activity\` AS
SELECT
  timestamp,
  COALESCE(trace, insertId) AS trace,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal')
  ) AS user_email,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.methodName'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname')
  ) AS method_name,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.query'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.searchQuery')
  ) AS search_query,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.attributionToken'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.attributiontoken')
  ) AS attribution_token,
  ARRAY(
    SELECT JSON_VALUE(r, '$.id')
    FROM UNNEST(JSON_QUERY_ARRAY(TO_JSON_STRING(jsonPayload), '$.response.results')) r
  ) AS result_ids
FROM ${sinkActivity.tableRef}
WHERE COALESCE(
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.methodName'),
  JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname')
) = "Search"
QUALIFY ROW_NUMBER() OVER(PARTITION BY insertId ORDER BY timestamp DESC) = 1;`;
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
