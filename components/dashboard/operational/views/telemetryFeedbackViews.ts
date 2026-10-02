import {
    ViewDefinition,
    hasTable,
    getLogsSource,
    resolveSinkTable,
    USER_ACTIVITY_TABLE,
    AI_CHOICE_TABLE,
    INFERENCE_DETAILS_TABLE
} from "./helpers";

export const telemetryFeedbackViews: Record<string, ViewDefinition> = {
    v_gemini_genai_telemetry: {
        id: 'v_gemini_genai_telemetry',
        viewName: 'v_gemini_genai_telemetry',
        title: 'GenAI Telemetry & Tool Invocations',
        description: 'Token consumption, model inferences, prompts, responses, and 1,800+ tool calls with full arguments.',
        category: 'Model & Ingestion',
        columns: [
            { key: 'timestamp', header: 'Timestamp', type: 'timestamp' },
            { key: 'user_email', header: 'User Email' },
            { key: 'agent_name', header: 'Agent Name', type: 'badge' },
            { key: 'step_index', header: 'Step' },
            { key: 'is_final_step', header: 'Final Step', type: 'badge' },
            { key: 'finish_reason', header: 'Finish Reason', type: 'badge' },
            { key: 'input_tokens', header: 'In Tokens' },
            { key: 'output_tokens', header: 'Out Tokens' },
            { key: 'tool_calls', header: 'Tools Executed', type: 'mono' },
            { key: 'user_prompt', header: 'User Prompt' }
        ],
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            const hasAssist = hasTable(tables, 'gemini_assist_activity');
            const assistCte = hasAssist ? `
assist_agents AS (
  SELECT
    COALESCE(REGEXP_EXTRACT(answer_name, r'sessions/([^/]+)'), trace) AS session_id,
    COALESCE(REGEXP_EXTRACT(answer_name, r'/engines/([^/]+)'), 'General Assistant') AS agent_name
  FROM \`${projectId}.${dataset}.gemini_assist_activity\`
  QUALIFY ROW_NUMBER() OVER(PARTITION BY COALESCE(REGEXP_EXTRACT(answer_name, r'sessions/([^/]+)'), trace) ORDER BY timestamp DESC) = 1
),` : '';

            const agentNameSelect = hasAssist ? `COALESCE(
      NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(a.agent_name, r'_[0-9]+.*$', ''), r'-[0-9]+.*$', ''), 'root_agent'),
      NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(r.raw_agent_name, r'_[0-9]+.*$', ''), r'-[0-9]+.*$', ''), 'root_agent'),
      'General Assistant'
    ) AS agent_name,` : `COALESCE(
      NULLIF(REGEXP_REPLACE(REGEXP_REPLACE(raw_agent_name, r'_[0-9]+.*$', ''), r'-[0-9]+.*$', ''), 'root_agent'),
      'General Assistant'
    ) AS agent_name,`;

            const assistJoin = hasAssist ? `LEFT JOIN assist_agents a ON COALESCE(r.conversation_id, r.trace) = a.session_id` : '';

            if (hasTable(tables, '_AllLogs')) {
                const logsSource = getLogsSource(projectId, dataset, tables);
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_genai_telemetry\` AS
WITH raw_inferences AS (
  SELECT
    t.timestamp,
    t.trace,
    t.span_id,
    t.insert_id,
    JSON_VALUE(t.json_payload, '$."gen_ai.conversation.id"') AS conversation_id,
    COALESCE(
      JSON_VALUE(t.json_payload, '$."gen_ai.agent.name"'),
      'root_agent'
    ) AS raw_agent_name,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\\n')
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$."gen_ai.input.messages"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.content') IS NOT NULL
    ) AS user_prompt,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\\n')
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$."gen_ai.output.messages"')) m,
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
      FROM UNNEST(JSON_QUERY_ARRAY(t.json_payload, '$."gen_ai.output.messages"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.name') IS NOT NULL
    ) AS tool_calls,
    CAST(JSON_VALUE(t.json_payload, '$."gen_ai.usage.input_tokens"') AS INT64) AS input_tokens,
    CAST(JSON_VALUE(t.json_payload, '$."gen_ai.usage.output_tokens"') AS INT64) AS output_tokens,
    COALESCE(
      JSON_VALUE(t.json_payload, '$."gen_ai.response.finish_reasons"[0]'),
      'stop'
    ) AS finish_reason
  FROM ${logsSource} t
  WHERE t.log_name LIKE '%gen_ai.client.inference.operation.details%'
  QUALIFY ROW_NUMBER() OVER(PARTITION BY t.insert_id ORDER BY t.timestamp DESC) = 1
),
user_map AS (
  SELECT
    trace,
    JSON_VALUE(json_payload.userIamPrincipal) AS user_email
  FROM ${logsSource}
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.userIamPrincipal) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY trace ORDER BY timestamp DESC) = 1
),${assistCte}
ranked_steps AS (
  SELECT
    r.*,
    u.user_email,
    ${agentNameSelect}
    ROW_NUMBER() OVER(PARTITION BY r.trace ORDER BY r.timestamp ASC) AS step_index,
    COUNT(1) OVER(PARTITION BY r.trace) AS total_steps
  FROM raw_inferences r
  LEFT JOIN user_map u ON r.trace = u.trace
  ${assistJoin}
)
SELECT
  timestamp,
  trace,
  span_id,
  COALESCE(user_email, 'Unattributed Service / Job') AS user_email,
  conversation_id,
  agent_name,
  step_index,
  total_steps,
  (step_index = total_steps) AS is_final_step,
  user_prompt,
  model_response,
  tool_calls,
  input_tokens,
  output_tokens,
  finish_reason
FROM ranked_steps;`;
            }

            const sinkInference = resolveSinkTable(projectId, dataset, INFERENCE_DETAILS_TABLE, tables);
            const sinkActivity = resolveSinkTable(projectId, dataset, USER_ACTIVITY_TABLE, tables);
            const includeActivityMap = sinkActivity.hasAnyTable || !sinkInference.hasAnyTable;

            const userMapCteBody = includeActivityMap
                ? `SELECT
    trace,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal')
    ) AS user_email
  FROM ${sinkActivity.tableRef}
  WHERE COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal')
  ) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY trace ORDER BY timestamp DESC) = 1`
                : `SELECT CAST(NULL AS STRING) AS trace, CAST(NULL AS STRING) AS user_email FROM (SELECT 1) WHERE FALSE`;

            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_gemini_genai_telemetry\` AS
WITH raw_inferences AS (
  SELECT
    t.timestamp,
    t.trace,
    t.spanId AS span_id,
    t.insertId AS insert_id,
    JSON_VALUE(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.conversation.id"') AS conversation_id,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.agent.name"'),
      'root_agent'
    ) AS raw_agent_name,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\\n')
      FROM UNNEST(JSON_QUERY_ARRAY(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.input.messages"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.content') IS NOT NULL
    ) AS user_prompt,
    (
      SELECT STRING_AGG(JSON_VALUE(p, '$.content'), '\\n')
      FROM UNNEST(JSON_QUERY_ARRAY(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.output.messages"')) m,
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
      FROM UNNEST(JSON_QUERY_ARRAY(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.output.messages"')) m,
      UNNEST(JSON_QUERY_ARRAY(m, '$.parts')) p
      WHERE JSON_VALUE(p, '$.name') IS NOT NULL
    ) AS tool_calls,
    CAST(JSON_VALUE(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.usage.input_tokens"') AS INT64) AS input_tokens,
    CAST(JSON_VALUE(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.usage.output_tokens"') AS INT64) AS output_tokens,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(t.jsonPayload), '$."gen_ai.response.finish_reasons"[0]'),
      'stop'
    ) AS finish_reason
  FROM ${sinkInference.tableRef} t
  QUALIFY ROW_NUMBER() OVER(PARTITION BY t.insertId ORDER BY t.timestamp DESC) = 1
),
user_map AS (
  ${userMapCteBody}
),${assistCte}
ranked_steps AS (
  SELECT
    r.*,
    u.user_email,
    ${agentNameSelect}
    ROW_NUMBER() OVER(PARTITION BY r.trace ORDER BY r.timestamp ASC) AS step_index,
    COUNT(1) OVER(PARTITION BY r.trace) AS total_steps
  FROM raw_inferences r
  LEFT JOIN user_map u ON r.trace = u.trace
  ${assistJoin}
)
SELECT
  timestamp,
  trace,
  span_id,
  COALESCE(user_email, 'Unattributed Service / Job') AS user_email,
  conversation_id,
  agent_name,
  step_index,
  total_steps,
  (step_index = total_steps) AS is_final_step,
  user_prompt,
  model_response,
  tool_calls,
  input_tokens,
  output_tokens,
  finish_reason
FROM ranked_steps;`;
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
  user_email,
  agent_name,
  step_index,
  is_final_step,
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
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            if (hasTable(tables, 'gemini_genai_telemetry')) {
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_ai_choices\` AS
SELECT 
  timestamp,
  CONCAT(trace, '-', COALESCE(span_id, CAST(timestamp AS STRING))) AS insertId,
  trace,
  COALESCE(finish_reason, 'STOP') AS finish_reason,
  'model' AS role,
  'active' AS table_date
FROM \`${projectId}.${dataset}.gemini_genai_telemetry\`
QUALIFY ROW_NUMBER() OVER(PARTITION BY trace, COALESCE(span_id, CAST(timestamp AS STRING)) ORDER BY timestamp DESC) = 1;`;
            }

            const sinkChoices = resolveSinkTable(projectId, dataset, AI_CHOICE_TABLE, tables);
            if (!sinkChoices.hasAnyTable && hasTable(tables, '_AllLogs')) {
                const logsSource = getLogsSource(projectId, dataset, tables);
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_ai_choices\` AS
SELECT 
  timestamp,
  insert_id AS insertId,
  trace,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.finishReason'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.finish_reason'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.choice.finish_reason'),
    'STOP'
  ) AS finish_reason,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.content.role'),
    JSON_VALUE(TO_JSON_STRING(json_payload), '$.choice.message.role'),
    'model'
  ) AS role,
  FORMAT_TIMESTAMP('%Y%m%d', timestamp) AS table_date
FROM ${logsSource}
WHERE log_name LIKE '%gen_ai.choice%' OR log_name LIKE '%gen_ai_choice%'
QUALIFY ROW_NUMBER() OVER(PARTITION BY insert_id ORDER BY timestamp DESC) = 1;`;
            }

            const tableDateExpr = sinkChoices.isWildcard
                ? '_TABLE_SUFFIX AS table_date'
                : "FORMAT_TIMESTAMP('%Y%m%d', timestamp) AS table_date";

            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_consolidated_ai_choices\` AS
SELECT 
  timestamp,
  insertId,
  trace,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.finishReason'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.finish_reason'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.choice.finish_reason'),
    'STOP'
  ) AS finish_reason,
  COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.content.role'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.choice.message.role'),
    'model'
  ) AS role,
  ${tableDateExpr}
FROM ${sinkChoices.tableRef}
QUALIFY ROW_NUMBER() OVER(PARTITION BY insertId ORDER BY timestamp DESC) = 1;`;
        },
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
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            if (hasTable(tables, '_AllLogs')) {
                const logsSource = getLogsSource(projectId, dataset, tables);
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_agent_feedback\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS event_time,
    JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
    JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType) AS feedback,
    COALESCE(
      JSON_VALUE(json_payload.request.userEvent.feedback.reasons[0]),
      'REASON_UNSPECIFIED'
    ) AS reason,
    JSON_VALUE(json_payload.request.userEvent.feedback.comment) AS comment,
    JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken) AS assist_token,
    COALESCE(
      JSON_VALUE(json_payload.request.userEvent.agentspaceInfo.agentInfo.name),
      REGEXP_EXTRACT(JSON_VALUE(json_payload.request.userEvent.engine), r'/engines/([^/]+)')
    ) AS fallback_agent_name
  FROM ${logsSource}
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.request.userEvent.eventType) = 'add-feedback'
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY 
      COALESCE(
        JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken),
        insert_id
      ),
      JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType)
    ORDER BY timestamp DESC
  ) = 1
),
interaction_events AS (
  SELECT
    JSON_VALUE(json_payload.response.assistToken) AS assist_token,
    COALESCE(
      JSON_VALUE(json_payload.response.agentInfo.displayName),
      JSON_VALUE(json_payload.request.agent.displayName)
    ) AS agent_name
  FROM ${logsSource}
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.response.assistToken) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY JSON_VALUE(json_payload.response.assistToken) ORDER BY timestamp DESC) = 1
)
SELECT
  COALESCE(i.agent_name, f.fallback_agent_name) AS agent_name,
  f.feedback,
  f.reason,
  f.comment,
  f.event_time,
  f.user_email
FROM feedback_events f
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`;
            }

            const sinkActivity = resolveSinkTable(projectId, dataset, USER_ACTIVITY_TABLE, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_agent_feedback\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS event_time,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal')
    ) AS user_email,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.feedbackType'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.feedbacktype')
    ) AS feedback,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.reasons[0]'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.reasons[0]'),
      'REASON_UNSPECIFIED'
    ) AS reason,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.comment'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.comment')
    ) AS comment,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.conversationInfo.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.conversationinfo.assisttoken')
    ) AS assist_token,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.agentspaceInfo.agentInfo.name'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.name'),
      REGEXP_EXTRACT(COALESCE(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.engine'), JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.engine')), r'/engines/([^/]+)')
    ) AS fallback_agent_name
  FROM ${sinkActivity.tableRef}
  WHERE COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.eventType'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.eventtype')
  ) = 'add-feedback'
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY 
      COALESCE(
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.conversationInfo.assistToken'),
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.conversationinfo.assisttoken'),
        insertId
      ),
      COALESCE(
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.feedbackType'),
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.feedbacktype')
      )
    ORDER BY timestamp DESC
  ) = 1
),
interaction_events AS (
  SELECT
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
    ) AS assist_token,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentInfo.displayName'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.displayname'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayName'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayname')
    ) AS agent_name
  FROM ${sinkActivity.tableRef}
  WHERE COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
  ) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
    )
    ORDER BY timestamp DESC
  ) = 1
)
SELECT
  COALESCE(i.agent_name, f.fallback_agent_name) AS agent_name,
  f.feedback,
  f.reason,
  f.comment,
  f.event_time,
  f.user_email
FROM feedback_events f
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`;
        },
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
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            if (hasTable(tables, '_AllLogs')) {
                const logsSource = getLogsSource(projectId, dataset, tables);
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_admin_feedback_review\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS feedback_time,
    JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
    JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType) AS feedback_type,
    TO_JSON_STRING(json_payload.request.userEvent.feedback.reasons) AS feedback_reasons,
    JSON_VALUE(json_payload.request.userEvent.feedback.comment) AS feedback_comment,
    JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken) AS assist_token,
    insert_id
  FROM ${logsSource}
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.request.userEvent.eventType) = 'add-feedback'
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY 
      COALESCE(
        JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken),
        insert_id
      ),
      JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType)
    ORDER BY timestamp DESC
  ) = 1
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
      (SELECT STRING_AGG(JSON_VALUE(p.text), '\\n') FROM UNNEST(JSON_QUERY_ARRAY(json_payload.request.query.parts)) p),
      JSON_VALUE(json_payload.request.userEvent.searchInfo.searchQuery)
    ) AS prompt
  FROM ${logsSource}
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
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`;
            }

            const sinkActivity = resolveSinkTable(projectId, dataset, USER_ACTIVITY_TABLE, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_admin_feedback_review\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS feedback_time,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal')
    ) AS user_email,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.feedbackType'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.feedbacktype')
    ) AS feedback_type,
    COALESCE(
      TO_JSON_STRING(JSON_QUERY(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.reasons')),
      TO_JSON_STRING(JSON_QUERY(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.reasons'))
    ) AS feedback_reasons,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.comment'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.comment')
    ) AS feedback_comment,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.conversationInfo.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.conversationinfo.assisttoken')
    ) AS assist_token,
    insertId AS insert_id
  FROM ${sinkActivity.tableRef}
  WHERE COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.eventType'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.eventtype')
  ) = 'add-feedback'
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY 
      COALESCE(
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.conversationInfo.assistToken'),
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.conversationinfo.assisttoken'),
        insertId
      ),
      COALESCE(
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.feedbackType'),
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.feedbacktype')
      )
    ORDER BY timestamp DESC
  ) = 1
),
interaction_events AS (
  SELECT
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
    ) AS assist_token,
    trace,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentInfo.displayName'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.displayname'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayName'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayname'),
      REGEXP_EXTRACT(COALESCE(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.name'), JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.name')), r'/engines/([^/]+)')
    ) AS agent_name,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.serviceTextReply'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.servicetextreply'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.replies[0].content.text'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.replies[0].groundedContent.content.text'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.replies[0].groundedcontent.content.text')
    ) AS response_text,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.query.text'),
      (SELECT STRING_AGG(JSON_VALUE(p, '$.text'), '\\n') FROM UNNEST(JSON_QUERY_ARRAY(TO_JSON_STRING(jsonPayload), '$.request.query.parts')) p),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.searchInfo.searchQuery'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.searchinfo.searchquery')
    ) AS prompt
  FROM ${sinkActivity.tableRef}
  WHERE COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
  ) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
    )
    ORDER BY timestamp DESC
  ) = 1
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
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`;
        },
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
        getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => {
            if (hasTable(tables, '_AllLogs')) {
                const logsSource = getLogsSource(projectId, dataset, tables);
                return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_agent_feedback_detailed\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS feedback_time,
    JSON_VALUE(json_payload.userIamPrincipal) AS user_email,
    JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType) AS feedback_type,
    TO_JSON_STRING(json_payload.request.userEvent.feedback.reasons) AS feedback_reasons,
    JSON_VALUE(json_payload.request.userEvent.feedback.comment) AS feedback_comment,
    JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken) AS assist_token
  FROM ${logsSource}
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.request.userEvent.eventType) = 'add-feedback'
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY 
      COALESCE(
        JSON_VALUE(json_payload.request.userEvent.feedback.conversationInfo.assistToken),
        insert_id
      ),
      JSON_VALUE(json_payload.request.userEvent.feedback.feedbackType)
    ORDER BY timestamp DESC
  ) = 1
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
      (SELECT STRING_AGG(JSON_VALUE(p.text), '\\n') FROM UNNEST(JSON_QUERY_ARRAY(json_payload.request.query.parts)) p)
    ) AS prompt
  FROM ${logsSource}
  WHERE log_name LIKE '%gemini_enterprise_user_activity%'
    AND JSON_VALUE(json_payload.response.assistToken) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(PARTITION BY JSON_VALUE(json_payload.response.assistToken) ORDER BY timestamp DESC) = 1
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
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`;
            }

            const sinkActivity = resolveSinkTable(projectId, dataset, USER_ACTIVITY_TABLE, tables);
            return `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_agent_feedback_detailed\` AS
WITH feedback_events AS (
  SELECT
    timestamp AS feedback_time,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.userIamPrincipal'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.useriamprincipal')
    ) AS user_email,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.feedbackType'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.feedbacktype')
    ) AS feedback_type,
    COALESCE(
      TO_JSON_STRING(JSON_QUERY(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.reasons')),
      TO_JSON_STRING(JSON_QUERY(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.reasons'))
    ) AS feedback_reasons,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.comment'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.comment')
    ) AS feedback_comment,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.conversationInfo.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.conversationinfo.assisttoken')
    ) AS assist_token
  FROM ${sinkActivity.tableRef}
  WHERE COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.eventType'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.eventtype')
  ) = 'add-feedback'
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY 
      COALESCE(
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.conversationInfo.assistToken'),
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.conversationinfo.assisttoken'),
        insertId
      ),
      COALESCE(
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userEvent.feedback.feedbackType'),
        JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.feedback.feedbacktype')
      )
    ORDER BY timestamp DESC
  ) = 1
),
interaction_events AS (
  SELECT
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
    ) AS assist_token,
    trace,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.serviceTextReply'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.servicetextreply'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.replies[0].content.text')
    ) AS result,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentInfo.displayName'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.displayname'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayName'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agent.displayname')
    ) AS underlying_agent_name,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agentsSpec.agentSpecs[0].agentId'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.agentsspec.agentspecs[0].agentid'),
      REGEXP_EXTRACT(COALESCE(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentInfo.agent'), JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.agentinfo.agent')), r'/agents/([^/]+)')
    ) AS underlying_agent_id,
    REGEXP_EXTRACT(COALESCE(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logMetadata.name'), JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.name')), r'/engines/([^/]+)') AS gemini_enterprise_app_id,
    COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.query.text'),
      (SELECT STRING_AGG(JSON_VALUE(p, '$.text'), '\\n') FROM UNNEST(JSON_QUERY_ARRAY(TO_JSON_STRING(jsonPayload), '$.request.query.parts')) p)
    ) AS prompt
  FROM ${sinkActivity.tableRef}
  WHERE COALESCE(
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
    JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
  ) IS NOT NULL
  QUALIFY ROW_NUMBER() OVER(
    PARTITION BY COALESCE(
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assistToken'),
      JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.assisttoken')
    )
    ORDER BY timestamp DESC
  ) = 1
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
LEFT JOIN interaction_events i ON f.assist_token = i.assist_token;`;
        },
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
};
