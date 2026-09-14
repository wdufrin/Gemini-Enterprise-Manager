/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface MetricDefinition {
    id: string;
    label: string;
    whatItShows: string;
    meaning: string;
    formula?: string;
    sourceTables: string[];
    fieldsUsed?: string[];
}

export interface ChartMetadata {
    id: string;
    title: string;
    category: string;
    whatItShows: string;
    metricMeaning: string;
    sourceTables: string[];
    fieldsUsed?: string[];
    metrics?: {
        name: string;
        description: string;
    }[];
}

export interface ViewMetadata {
    id: string;
    viewName: string;
    title: string;
    category: string;
    description: string;
    sourceTables: string[];
    rawSyncTables: string[];
    logFilters: string[];
    primarySourceDescription: string;
    keyMetrics: {
        name: string;
        description: string;
        formula?: string;
    }[];
}

/**
 * Complete metadata dictionary for all 11 Operational BigQuery Views + Live Activity View
 */
export const OPERATIONAL_VIEWS_METADATA: Record<string, ViewMetadata> = {
    live_activity: {
        id: 'live_activity',
        viewName: 'Live Activity Query',
        title: 'Live Activity Dashboard',
        category: 'Live Traffic',
        description: 'Direct multi-sharded BigQuery query over raw Gemini Enterprise audit logs.',
        sourceTables: [
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_*',
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity'
        ],
        rawSyncTables: [
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_* (Cloud Logging Log Router Sink)'
        ],
        logFilters: [
            'log_name LIKE "%gemini_enterprise_user_activity%"',
            'methodName IN ("StreamAssist", "Assist", "Search")'
        ],
        primarySourceDescription: 'Partitioned Google Cloud Logging table created by Gemini Enterprise audit log sinks.',
        keyMetrics: [
            {
                name: 'Total Queries',
                description: 'Total user queries and prompts sent to assistants or search engines in the selected time range.',
                formula: "COUNTIF(methodName IN ('StreamAssist', 'Assist', 'Search'))"
            },
            {
                name: 'Unique Users',
                description: 'Count of distinct employee IAM principals actively interacting with assistants.',
                formula: 'COUNT(DISTINCT userIamPrincipal)'
            },
            {
                name: 'Avg Messages / Session',
                description: 'Average conversation turns per session, reflecting user engagement depth.',
                formula: 'Total Queries / COUNT(DISTINCT session_id)'
            },
            {
                name: 'Used Agents',
                description: 'Number of unique assistant engines or search configurations receiving traffic.',
                formula: 'COUNT(DISTINCT agent_id)'
            }
        ]
    },
    v_consolidated_user_activity: {
        id: 'v_consolidated_user_activity',
        viewName: 'v_consolidated_user_activity',
        title: 'User Activity & Sessions',
        category: 'User Interactions',
        description: 'Interactive session logs with agent attribution, method calls, and user activity timelines.',
        sourceTables: [
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_*',
            'gemini_assist_activity (fallback)',
            '_AllLogs (fallback)'
        ],
        rawSyncTables: [
            'discoveryengine_googleapis_com_gemini_enterprise_user_activity_* (Cloud Logging Log Router Sink)'
        ],
        logFilters: [
            'log_name LIKE "%gemini_enterprise_user_activity%"'
        ],
        primarySourceDescription: 'Log Router sink table for discoveryengine.googleapis.com/gemini_enterprise_user_activity.',
        keyMetrics: [
            {
                name: 'event_time',
                description: 'UTC timestamp when the user interaction or event was recorded.',
                formula: 'timestamp'
            },
            {
                name: 'user_email',
                description: 'Authenticated Google Cloud IAM principal or user email address.',
                formula: "JSON_VALUE(jsonPayload, '$.useriamprincipal')"
            },
            {
                name: 'agent_name',
                description: 'Human-readable display name of the assistant or search engine.',
                formula: "COALESCE(response.agentinfo.displayname, request.agent.displayname, 'General Assistant')"
            },
            {
                name: 'method_name',
                description: 'API method invoked (e.g. StreamAssist, Assist, Search, WriteUserEvent).',
                formula: "JSON_VALUE(jsonPayload, '$.logmetadata.methodname')"
            },
            {
                name: 'session_id',
                description: 'Conversation session UUID tracking multi-turn dialogue continuity.',
                formula: "REGEXP_EXTRACT(response.answer.name, r'sessions/([^/]+)')"
            }
        ]
    },
    v_consolidated_user_messages: {
        id: 'v_consolidated_user_messages',
        viewName: 'v_consolidated_user_messages',
        title: 'Consolidated User Messages',
        category: 'User Interactions',
        description: 'Chat turn histories, role payloads, and multi-shard message volumes across agent sessions.',
        sourceTables: [
            'discoveryengine_googleapis_com_gen_ai_user_message_*',
            'discoveryengine_googleapis_com_gen_ai_user_message_20260423'
        ],
        rawSyncTables: [
            'discoveryengine_googleapis_com_gen_ai_user_message_* (Cloud Logging Log Router Sink)'
        ],
        logFilters: [
            'log_name LIKE "%gen_ai_user_message%"'
        ],
        primarySourceDescription: 'Partitioned Log Router sink table capturing user message turn envelopes.',
        keyMetrics: [
            {
                name: 'role',
                description: 'Message author role in the conversational exchange (user, model, system).',
                formula: "JSON_VALUE(jsonPayload, '$.content.role')"
            },
            {
                name: 'parts_count',
                description: 'Count of message parts (text chunks, inline data, function calls) in the turn.',
                formula: "ARRAY_LENGTH(JSON_QUERY_ARRAY(jsonPayload, '$.content.parts'))"
            },
            {
                name: 'table_date',
                description: 'Date partition shard string from BigQuery table suffix.',
                formula: '_TABLE_SUFFIX'
            }
        ]
    },
    v_gemini_assist_activity: {
        id: 'v_gemini_assist_activity',
        viewName: 'v_gemini_assist_activity',
        title: 'Gemini Assist Activity',
        category: 'Gemini Enterprise',
        description: 'Assist-level queries, answers, and completion states from Enterprise assistants.',
        sourceTables: [
            '_AllLogs',
            'gemini_assist_activity (optional)'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset)'
        ],
        logFilters: [
            'log_name LIKE "%gemini_enterprise_user_activity%"',
            'JSON_VALUE(json_payload.logMetadata.methodName) IN ("StreamAssist", "Assist")'
        ],
        primarySourceDescription: 'AllLogs stream filtered by log_name LIKE "%gemini_enterprise_user_activity%" and methodName IN ("StreamAssist", "Assist").',
        keyMetrics: [
            {
                name: 'user_query',
                description: 'Raw text prompt or query submitted by the end user.',
                formula: "COALESCE(request.query.text, STRING_AGG(parts.text))"
            },
            {
                name: 'assistant_response',
                description: 'Complete synthesized text reply produced by the assistant.',
                formula: "JSON_VALUE(json_payload.serviceTextReply)"
            },
            {
                name: 'answer_state',
                description: 'Completion status of the answer generation (e.g. SUCCEEDED, FAILED).',
                formula: "JSON_VALUE(json_payload.response.answer.state)"
            }
        ]
    },
    v_gemini_search_activity: {
        id: 'v_gemini_search_activity',
        viewName: 'v_gemini_search_activity',
        title: 'Gemini Search Operations',
        category: 'Gemini Enterprise',
        description: 'Enterprise Search queries, data source retrieval operations, and caller emails.',
        sourceTables: [
            '_AllLogs'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset)'
        ],
        logFilters: [
            'log_name LIKE "%gemini_enterprise_user_activity%"',
            'JSON_VALUE(json_payload.logMetadata.methodName) = "Search"'
        ],
        primarySourceDescription: 'AllLogs stream filtered by log_name LIKE "%gemini_enterprise_user_activity%" and methodName = "Search".',
        keyMetrics: [
            {
                name: 'search_query',
                description: 'Search keyword string submitted against enterprise data stores.',
                formula: "JSON_VALUE(json_payload.request.query)"
            },
            {
                name: 'attribution_token',
                description: 'Cryptographic token identifying the search ranking and citation context.',
                formula: "JSON_VALUE(json_payload.response.attributionToken)"
            },
            {
                name: 'result_ids',
                description: 'Array of data store document IDs returned in the search candidate list.',
                formula: "ARRAY(SELECT id FROM results)"
            }
        ]
    },
    v_gemini_genai_telemetry: {
        id: 'v_gemini_genai_telemetry',
        viewName: 'v_gemini_genai_telemetry',
        title: 'GenAI Telemetry & Tool Invocations',
        category: 'Model & Telemetry',
        description: 'Token consumption, model inferences, prompts, responses, and 1,800+ tool calls with full arguments.',
        sourceTables: [
            '_AllLogs (gen_ai.client.inference.operation.details)',
            '_AllLogs (gemini_enterprise_user_activity)',
            'gemini_assist_activity (optional)'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset)'
        ],
        logFilters: [
            'log_name LIKE "%gen_ai.client.inference.operation.details%" (inferences & tool calls)',
            'log_name LIKE "%gemini_enterprise_user_activity%" (joined on trace for user principal)'
        ],
        primarySourceDescription: 'Unified inferences stream joined with user activity logs to map tokens, tools, and prompts to users and agents.',
        keyMetrics: [
            {
                name: 'input_tokens',
                description: 'Tokens in model context: system instructions, chat history, user prompt, and grounding documents.',
                formula: "CAST(json_payload.'gen_ai.usage.input_tokens' AS INT64)"
            },
            {
                name: 'output_tokens',
                description: 'Tokens generated by the model: synthesized answer and tool call parameter payloads.',
                formula: "CAST(json_payload.'gen_ai.usage.output_tokens' AS INT64)"
            },
            {
                name: 'tool_calls',
                description: 'Semi-colon delimited list of tool/function names and JSON arguments executed during inference.',
                formula: 'Extracted from gen_ai.output.messages.parts'
            },
            {
                name: 'finish_reason',
                description: 'Termination state returned by Gemini (stop, max_tokens, safety, recitation).',
                formula: "json_payload.'gen_ai.response.finish_reasons'[0]"
            },
            {
                name: 'step_index',
                description: 'Sequential turn number in a multi-step agent reasoning execution trace.',
                formula: 'ROW_NUMBER() OVER(PARTITION BY trace ORDER BY timestamp ASC)'
            }
        ]
    },
    v_consolidated_ai_choices: {
        id: 'v_consolidated_ai_choices',
        viewName: 'v_consolidated_ai_choices',
        title: 'AI Generation Choices',
        category: 'Model & Telemetry',
        description: 'Model finish reasons (STOP, MAX_TOKENS, SAFETY, UNEXPECTED_TOOL_CALL) and generation outputs.',
        sourceTables: [
            'discoveryengine_googleapis_com_gen_ai_choice_*',
            'gemini_genai_telemetry (fallback)'
        ],
        rawSyncTables: [
            'discoveryengine_googleapis_com_gen_ai_choice_* (Cloud Logging Log Router Sink)'
        ],
        logFilters: [
            'log_name LIKE "%gen_ai_choice%"'
        ],
        primarySourceDescription: 'BigQuery sink table capturing candidate choices and finish reasons from model generation endpoints.',
        keyMetrics: [
            {
                name: 'finish_reason',
                description: 'Termination state: STOP (natural end), MAX_TOKENS (length cutoff), SAFETY (policy filter), RECITATION (copyright check).',
                formula: "COALESCE(JSON_VALUE(jsonPayload, '$.finishReason'), 'STOP')"
            },
            {
                name: 'role',
                description: 'Role generating the choice candidate (typically model).',
                formula: "COALESCE(JSON_VALUE(jsonPayload, '$.content.role'), 'model')"
            }
        ]
    },
    v_user_connector_usage: {
        id: 'v_user_connector_usage',
        viewName: 'v_user_connector_usage',
        title: 'Connector Usage (All-Time)',
        category: 'Connectors & Tools',
        description: 'Cumulative invocations across Sharepoint, Drive, Jira, Search, and custom agent tools.',
        sourceTables: [
            '_AllLogs (gen_ai tool parts)',
            '_AllLogs (gemini_enterprise_user_activity search)',
            '_AllLogs (user principal mapping)'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset)'
        ],
        logFilters: [
            'log_name LIKE "%gen_ai.client.inference.operation.details%" (Agent Tool calls)',
            'log_name LIKE "%gemini_enterprise_user_activity%" AND methodName = "Search" (Search invocations)',
            'log_name LIKE "%gemini_enterprise_user_activity%" (joined on trace for userIamPrincipal)'
        ],
        primarySourceDescription: 'Union of agent tool calls from gen_ai inferences and Search data store operations joined with user principals.',
        keyMetrics: [
            {
                name: 'usage_count',
                description: 'Total number of distinct connector or tool invocations executed.',
                formula: 'COUNT(DISTINCT call_id)'
            },
            {
                name: 'connector_name',
                description: 'Cleaned name of enterprise connector or data repository (SharePoint, Drive, Search, Jira).',
                formula: 'Normalized from tool_name / engine_name'
            },
            {
                name: 'connector_type',
                description: 'Category: Agent Tool (model invoked function) or Search Data Source (enterprise retrieval).',
                formula: 'Agent Tool | Search Data Source'
            },
            {
                name: 'tools_used',
                description: 'Comma-separated list of individual tool methods called under this connector.',
                formula: 'STRING_AGG(DISTINCT tool_name, ", ")'
            }
        ]
    },
    v_user_connector_usage_30d: {
        id: 'v_user_connector_usage_30d',
        viewName: 'v_user_connector_usage_30d',
        title: 'Connector Usage (Past 30 Days)',
        category: 'Connectors & Tools',
        description: 'Rolling 30-day active connector adoption with first and last usage timestamps.',
        sourceTables: [
            'v_user_connector_usage'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset via v_user_connector_usage)'
        ],
        logFilters: [
            'Filters v_user_connector_usage WHERE last_used_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY) OR first_used_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)'
        ],
        primarySourceDescription: 'Filtered view of v_user_connector_usage restricting to events with activity in the last 30 days.',
        keyMetrics: [
            {
                name: 'usage_count',
                description: 'Total calls executed through this connector in the past 30 days.',
                formula: 'SUM(usage_count)'
            },
            {
                name: 'first_used_at',
                description: 'First recorded invocation timestamp within the 30-day monitoring window.',
                formula: 'MIN(timestamp)'
            },
            {
                name: 'last_used_at',
                description: 'Most recent recorded invocation timestamp within the 30-day monitoring window.',
                formula: 'MAX(timestamp)'
            }
        ]
    },
    v_agent_feedback: {
        id: 'v_agent_feedback',
        viewName: 'v_agent_feedback',
        title: 'Agent Feedback Summary',
        category: 'Feedback & Quality',
        description: 'End-user sentiment ratings, thumbs up / thumbs down counts, reasons, and comment feedback.',
        sourceTables: [
            '_AllLogs (add-feedback events)',
            '_AllLogs (interaction events)'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset)'
        ],
        logFilters: [
            'log_name LIKE "%gemini_enterprise_user_activity%" AND eventType = "add-feedback"',
            'Joined on assistToken with response.assistToken interaction event'
        ],
        primarySourceDescription: 'User feedback events matched with assistant responses using assistToken.',
        keyMetrics: [
            {
                name: 'thumbs_up',
                description: 'Count of positive feedback ratings (LIKE, THUMBS_UP, POSITIVE).',
                formula: "COUNTIF(feedback IN ('LIKE', 'THUMBS_UP', 'POSITIVE'))"
            },
            {
                name: 'thumbs_down',
                description: 'Count of negative feedback ratings (DISLIKE, THUMBS_DOWN, NEGATIVE).',
                formula: "COUNTIF(feedback IN ('DISLIKE', 'THUMBS_DOWN', 'NEGATIVE'))"
            },
            {
                name: 'reason',
                description: 'Categorical reason selected by user (e.g. Inaccurate, Incomplete, Unhelpful).',
                formula: "json_payload.request.userEvent.feedback.reasons[0]"
            },
            {
                name: 'comment',
                description: 'Freeform text comments submitted by users explaining their rating.',
                formula: "json_payload.request.userEvent.feedback.comment"
            }
        ]
    },
    v_admin_feedback_review: {
        id: 'v_admin_feedback_review',
        viewName: 'v_admin_feedback_review',
        title: 'Admin Feedback Review',
        category: 'Feedback & Quality',
        description: 'Executive review feed of end-user feedback, sentiment ratings, and prompt/response triage.',
        sourceTables: [
            '_AllLogs (add-feedback events)',
            '_AllLogs (interaction events with response text)'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset)'
        ],
        logFilters: [
            'log_name LIKE "%gemini_enterprise_user_activity%" AND eventType = "add-feedback"',
            'Joined on assistToken with response text (serviceTextReply / replies[0].content.text) and user prompt'
        ],
        primarySourceDescription: 'Feedback events joined with prompt and assistant response text for administrative quality triage.',
        keyMetrics: [
            {
                name: 'feedback_type',
                description: 'Feedback rating indicator (THUMBS_UP / THUMBS_DOWN).',
                formula: 'feedbackType'
            },
            {
                name: 'prompt',
                description: 'The exact user query or question that generated the rated assistant answer.',
                formula: 'User prompt text'
            },
            {
                name: 'response',
                description: 'The exact text reply generated by the assistant that received user feedback.',
                formula: 'Service reply text'
            }
        ]
    },
    v_agent_feedback_detailed: {
        id: 'v_agent_feedback_detailed',
        viewName: 'v_agent_feedback_detailed',
        title: 'Detailed Feedback Turns',
        category: 'Feedback & Quality',
        description: 'Turn-by-turn prompts, agent answers, assist tokens, and feedback comments.',
        sourceTables: [
            '_AllLogs (add-feedback events)',
            '_AllLogs (interaction events with agent IDs)'
        ],
        rawSyncTables: [
            '_AllLogs (Cloud Logging Sink / Log Analytics Linked Dataset)'
        ],
        logFilters: [
            'log_name LIKE "%gemini_enterprise_user_activity%" AND eventType = "add-feedback"',
            'Joined on assistToken with agentInfo.displayName and engine ID metadata'
        ],
        primarySourceDescription: 'Turn-level triage logs linking user feedback to specific engine IDs, agent IDs, prompts, and replies.',
        keyMetrics: [
            {
                name: 'underlying_agent_name',
                description: 'Display name of the specific specialized agent that answered the turn.',
                formula: 'agentInfo.displayName'
            },
            {
                name: 'underlying_agent_id',
                description: 'Internal engine resource ID of the agent.',
                formula: 'agentSpecs.agentId'
            },
            {
                name: 'gemini_enterprise_app_id',
                description: 'Gemini Enterprise application engine name extracted from metadata.',
                formula: "REGEXP_EXTRACT(logMetadata.name, r'/engines/([^/]+)')"
            }
        ]
    }
};

/**
 * Metric Explanations for all KPI summary boxes
 */
export const KPI_METRICS_INFO: Record<string, MetricDefinition> = {
    total_queries: {
        id: 'total_queries',
        label: 'Total Queries',
        whatItShows: 'The total count of prompt queries submitted to assistants or search engines in the chosen time window.',
        meaning: 'Quantifies overall conversational demand and user engagement volume across your enterprise deployment.',
        formula: "COUNTIF(methodName IN ('StreamAssist', 'Assist', 'Search'))",
        sourceTables: ['discoveryengine_googleapis_com_gemini_enterprise_user_activity_*'],
        fieldsUsed: ['jsonPayload.logMetadata.methodName', 'timestamp']
    },
    unique_users_live: {
        id: 'unique_users_live',
        label: 'Unique Users',
        whatItShows: 'Count of distinct employee emails or IAM principals who sent at least one prompt.',
        meaning: 'Measures active seat adoption across your enterprise organization. Tracks how broadly the assistant is being used.',
        formula: 'COUNT(DISTINCT userIamPrincipal)',
        sourceTables: ['discoveryengine_googleapis_com_gemini_enterprise_user_activity_*'],
        fieldsUsed: ['jsonPayload.userIamPrincipal']
    },
    avg_messages_session: {
        id: 'avg_messages_session',
        label: 'Avg Messages / Session',
        whatItShows: 'The average number of conversational turns per interaction session.',
        meaning: 'Indicates engagement depth. High values (>4) indicate deep multi-turn problem solving; lower values indicate quick Q&A lookups.',
        formula: 'Total Queries / COUNT(DISTINCT session_id)',
        sourceTables: ['discoveryengine_googleapis_com_gemini_enterprise_user_activity_*'],
        fieldsUsed: ['response.answer.name', 'trace', 'methodName']
    },
    used_agents: {
        id: 'used_agents',
        label: 'Used Agents',
        whatItShows: 'The number of distinct assistant agents or search configurations that received queries.',
        meaning: 'Highlights which specialized agents from your catalog are actively delivering value to users.',
        formula: 'COUNT(DISTINCT agent_id)',
        sourceTables: ['discoveryengine_googleapis_com_gemini_enterprise_user_activity_*'],
        fieldsUsed: ['response.agentInfo.displayName', 'request.userEvent.engine']
    },
    total_interactions: {
        id: 'total_interactions',
        label: 'Total Interactions',
        whatItShows: 'Cumulative count of user conversation events and system activities logged in the view.',
        meaning: 'Primary benchmark for total enterprise activity. Captures both queries and user actions (feedback, navigation, sharing).',
        formula: 'COUNT(1) FROM v_consolidated_user_activity',
        sourceTables: ['v_consolidated_user_activity'],
        fieldsUsed: ['event_time', 'user_email', 'agent_name', 'session_id']
    },
    telemetry_events: {
        id: 'telemetry_events',
        label: 'Telemetry Events',
        whatItShows: 'Total model inference execution operations and tool dispatch cycles logged.',
        meaning: 'Measures backend foundation model workload. Each user turn may trigger 1 or more inference reasoning steps.',
        formula: 'COUNT(1) FROM v_gemini_genai_telemetry',
        sourceTables: ['v_gemini_genai_telemetry (from _AllLogs gen_ai.client.inference)'],
        fieldsUsed: ['gen_ai.client.inference.operation.details', 'trace', 'span_id']
    },
    tokens_tracked: {
        id: 'tokens_tracked',
        label: 'Tokens Tracked',
        whatItShows: 'Combined sum of input prompt tokens and output generated tokens processed across all agent runs.',
        meaning: 'Key operational and billing metric. Input tokens include instructions, chat history, and retrieved grounding text; output tokens are generated words.',
        formula: 'SUM(input_tokens + output_tokens)',
        sourceTables: ['v_gemini_genai_telemetry (from _AllLogs gen_ai usage)'],
        fieldsUsed: ['gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens']
    },
    active_connectors: {
        id: 'active_connectors',
        label: 'Active Connectors',
        whatItShows: 'Count of unique external enterprise data sources and tools called in the past 30 days.',
        meaning: 'Reflects data grounding adoption (e.g. SharePoint, Google Drive, Jira, Vertex Data Stores).',
        formula: 'COUNT(DISTINCT connector_name) in past 30 days',
        sourceTables: ['v_user_connector_usage_30d (from _AllLogs)'],
        fieldsUsed: ['connector_name', 'last_used_at']
    }
};

/**
 * Chart Metadata Definitions for all visualizations
 */
export const CHARTS_METADATA: Record<string, ChartMetadata> = {
    request_volume: {
        id: 'request_volume',
        title: 'Request Volume',
        category: 'Live Traffic',
        whatItShows: 'Time-series area chart plotting query volume over time (15-min, 1-hour, or 1-day buckets).',
        metricMeaning: 'Reveals peak traffic hours, concurrency spikes, and off-peak maintenance windows.',
        sourceTables: ['discoveryengine_googleapis_com_gemini_enterprise_user_activity_*'],
        fieldsUsed: ['timestamp', 'methodName']
    },
    agent_activity_table: {
        id: 'agent_activity_table',
        title: 'Agent Activity Breakdown',
        category: 'Live Traffic',
        whatItShows: 'Ranked list of agents with display name, engine ID, and total query counts.',
        metricMeaning: 'Identifies which specific assistants handle the majority of user requests.',
        sourceTables: ['discoveryengine_googleapis_com_gemini_enterprise_user_activity_*'],
        fieldsUsed: ['response.agentInfo', 'request.userEvent']
    },
    top_agents_chart: {
        id: 'top_agents_chart',
        title: 'Top Agents (Visualized)',
        category: 'Live Traffic',
        whatItShows: 'Bar chart comparing query traffic across the top 10 most active agents.',
        metricMeaning: 'Visualizes workload distribution across assistants to identify top performers.',
        sourceTables: ['discoveryengine_googleapis_com_gemini_enterprise_user_activity_*'],
        fieldsUsed: ['agent_name', 'count']
    },
    daily_interaction_volume: {
        id: 'daily_interaction_volume',
        title: 'Daily Interaction Volume',
        category: 'Operational Analytics',
        whatItShows: '30-day timeline of total queries and conversational interactions per day.',
        metricMeaning: 'Shows adoption growth trajectory and weekday vs. weekend engagement patterns.',
        sourceTables: ['v_consolidated_user_activity'],
        fieldsUsed: ['DATE(event_time)', 'COUNT(1)']
    },
    agent_popularity_share: {
        id: 'agent_popularity_share',
        title: 'Agent Popularity Share',
        category: 'Operational Analytics',
        whatItShows: 'Donut chart showing proportional interaction share per assistant.',
        metricMeaning: 'Demonstrates market share of user attention across configured assistants.',
        sourceTables: ['v_consolidated_user_activity'],
        fieldsUsed: ['agent_name', 'COUNT(1)']
    },
    genai_tokens_by_agent: {
        id: 'genai_tokens_by_agent',
        title: 'Token Consumption by Agent',
        category: 'Operational Analytics',
        whatItShows: 'Stacked bar chart of input tokens (blue) and output tokens (green) consumed per agent.',
        metricMeaning: 'Input tokens represent context, history, and retrieved search chunks; output tokens represent generated answers. Identifies context-heavy or cost-driving agents.',
        sourceTables: ['v_gemini_genai_telemetry'],
        fieldsUsed: ['agent_name', 'SUM(input_tokens)', 'SUM(output_tokens)']
    },
    tool_invocations_by_name: {
        id: 'tool_invocations_by_name',
        title: 'Tool Invocations by Tool Name',
        category: 'Operational Analytics',
        whatItShows: 'Horizontal bar chart ranking model tool and function calls by execution count.',
        metricMeaning: 'Tracks agent autonomous capabilities such as database queries, search grounding, or API webhooks.',
        sourceTables: ['v_gemini_genai_telemetry'],
        fieldsUsed: ['tool_calls', 'gen_ai.output.messages.parts']
    },
    connector_invocations_30d: {
        id: 'connector_invocations_30d',
        title: 'Invocations by Connector',
        category: 'Operational Analytics',
        whatItShows: 'Horizontal bar chart of 30-day call volume across SharePoint, Drive, Jira, Search, etc.',
        metricMeaning: 'Identifies which external enterprise repositories are most relied upon for grounding.',
        sourceTables: ['v_user_connector_usage_30d'],
        fieldsUsed: ['connector_name', 'usage_count']
    },
    top_connector_users: {
        id: 'top_connector_users',
        title: 'Top Connector Users',
        category: 'Operational Analytics',
        whatItShows: 'Bar chart ranking employee emails by total connector invocations initiated.',
        metricMeaning: 'Identifies enterprise champion users actively grounding queries in company data stores.',
        sourceTables: ['v_user_connector_usage_30d'],
        fieldsUsed: ['user_email', 'calls']
    },
    ai_finish_reasons: {
        id: 'ai_finish_reasons',
        title: 'Model Finish Reasons Breakdown',
        category: 'Operational Analytics',
        whatItShows: 'Donut chart of model termination states: STOP (natural), MAX_TOKENS (cut off), SAFETY (filter), RECITATION (copyright check).',
        metricMeaning: 'Monitors generation health. Spikes in MAX_TOKENS suggest prompts need tighter instructions; spikes in SAFETY suggest blocked topics.',
        sourceTables: ['v_consolidated_ai_choices'],
        fieldsUsed: ['finish_reason', 'COUNT(1)']
    },
    ai_choice_frequency: {
        id: 'ai_choice_frequency',
        title: 'Choice Frequency',
        category: 'Operational Analytics',
        whatItShows: 'Bar chart displaying total generation candidate counts grouped by finish reason.',
        metricMeaning: 'Tracks absolute volume of completions and policy stops across generation candidates.',
        sourceTables: ['v_consolidated_ai_choices'],
        fieldsUsed: ['finish_reason', 'count']
    },
    agent_feedback_ratings: {
        id: 'agent_feedback_ratings',
        title: 'Feedback Ratings per Agent',
        category: 'Operational Analytics',
        whatItShows: 'Grouped bar chart comparing Thumbs Up (green) vs Thumbs Down (red) ratings per agent.',
        metricMeaning: 'Direct measure of employee satisfaction and answer accuracy per assistant.',
        sourceTables: ['v_agent_feedback'],
        fieldsUsed: ['agent_name', 'thumbs_up', 'thumbs_down']
    },
    quality_satisfaction_summary: {
        id: 'quality_satisfaction_summary',
        title: 'Quality & Satisfaction Summary',
        category: 'Operational Analytics',
        whatItShows: 'Summary scorecards showing Total Positive, Total Negative, and Satisfaction percentage.',
        metricMeaning: 'High-level CSAT index: Positive / (Positive + Negative). Measures organizational trust in AI responses.',
        sourceTables: ['v_agent_feedback'],
        fieldsUsed: ['feedbackType']
    }
};

/**
 * Returns the source tables for a given view ID
 */
export const getViewSourceTables = (viewId: string): string[] => {
    const meta = OPERATIONAL_VIEWS_METADATA[viewId];
    return meta ? meta.sourceTables : ['_AllLogs'];
};

/**
 * Returns the raw BigQuery tables created by the Cloud Logging sync for a given view ID
 */
export const getViewRawSyncTables = (viewId: string): string[] => {
    const meta = OPERATIONAL_VIEWS_METADATA[viewId];
    return meta?.rawSyncTables || meta?.sourceTables || ['_AllLogs'];
};

/**
 * Returns the log filters applied to the raw sync logs for a given view ID
 */
export const getViewLogFilters = (viewId: string): string[] => {
    const meta = OPERATIONAL_VIEWS_METADATA[viewId];
    return meta?.logFilters || [];
};

/**
 * Returns the metadata for a given view ID
 */
export const getViewMetadata = (viewId: string): ViewMetadata | undefined => {
    return OPERATIONAL_VIEWS_METADATA[viewId];
};

/**
 * Returns all view metadata as an array
 */
export const getAllViewsMetadata = (): ViewMetadata[] => {
    return Object.values(OPERATIONAL_VIEWS_METADATA);
};
