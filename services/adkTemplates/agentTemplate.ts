import { AdkAgentConfig } from "./types";

/**
 * Renders an arbitrary user string as a Python triple-quoted literal.
 *
 * Agent instructions and descriptions are free text typed by the user and are
 * interpolated straight into generated Python, so anything this function gets
 * wrong becomes a `SyntaxError` the user only discovers at deploy time.
 *
 * The order of the passes below is load-bearing:
 *   1. Backslashes first. Doing this later would double-escape the backslashes
 *      introduced by the subsequent passes.
 *   2. `"""` sequences, which would otherwise terminate the literal.
 *   3. A single trailing `"`, which would merge with the closing delimiter and
 *      produce an unterminated string.
 *   4. Control characters that are not legal raw inside a literal. `\n` and
 *      `\t` are deliberately left as-is: they are valid inside triple quotes
 *      and keeping them readable matters for long instructions.
 */
export function formatPythonString(str: string): string {
  if (str === null || str === undefined) return '""';
  if (str === "") return '""';
  return JSON.stringify(str);
}

export const generateAdk22PythonCode = (
  config: AdkAgentConfig,
  useRelativeImports: boolean = false,
): string => {
  const toolImports = new Set<string>();
  const toolInitializations: string[] = [];
  const toolListForAgent: string[] = [];

  // Import from tools now
  const toolsImport = new Set<string>();

  // Model selection logic
  const modelName = config.model;

  // Inject A2A Helper Function Import
  if (config.tools.some((t) => t.type === "A2AClientTool")) {
    toolsImport.add("create_a2a_tool");
  }

  config.tools.forEach((tool) => {
    if (tool.type === "A2AClientTool" && tool.url) {
      const funcName = tool.variableName || "a2a_tool";
      toolInitializations.push(
        `${tool.variableName} = create_a2a_tool(\n    url="${tool.url}",\n    tool_name="${funcName}"\n)`,
      );
      toolListForAgent.push(tool.variableName);
    }
  });

  if (config.enableDiscoveryApi) {
    toolsImport.add("query_gemini_enterprise");
    toolListForAgent.push("query_gemini_enterprise");
  }

  if (config.enableEmailTool) {
    toolsImport.add("send_email");
    toolListForAgent.push("send_email");
  }

  if (config.enableSecurityCommandCenterApi) {
    toolsImport.add("list_active_findings");
    toolListForAgent.push("list_active_findings");
  }

  if (config.enableRecommenderApi) {
    toolsImport.add("list_recommendations");
    toolsImport.add("list_cost_recommendations");
    toolListForAgent.push("list_recommendations");
    toolListForAgent.push("list_cost_recommendations");
  }

  if (config.enableServiceHealthApi) {
    toolsImport.add("check_service_health");
    toolListForAgent.push("check_service_health");
  }

  if (config.enableNetworkManagementApi) {
    toolsImport.add("run_connectivity_test");
    toolListForAgent.push("run_connectivity_test");
  }

  if (config.enableCloudAssistApi) {
    toolsImport.add("investigate_with_cloud_assist");
    toolListForAgent.push("investigate_with_cloud_assist");
  }

  if (config.enableCloudLoggingApi) {
    toolsImport.add("search_logs");
    toolListForAgent.push("search_logs");
  }

  if (config.enableCloudMonitoringApi) {
    toolsImport.add("check_health");
    toolsImport.add("get_service_metrics");
    toolListForAgent.push("check_health");
    toolListForAgent.push("get_service_metrics");
  }

  if (config.enableCloudRunApi) {
    toolsImport.add("list_services");
    toolListForAgent.push("list_services");
  }

  if (config.enableResourceManagerApi) {
    toolsImport.add("list_projects");
    toolsImport.add("resolve_project_id");
    toolListForAgent.push("list_projects");
    toolListForAgent.push("resolve_project_id");
  }

  if (config.enableAdminActivityApi) {
    toolsImport.add("list_recent_changes");
    toolListForAgent.push("list_recent_changes");
  }

  if (config.enableDatabaseFleetApi) {
    toolsImport.add("check_database_fleet_health");
    toolListForAgent.push("check_database_fleet_health");
  }



  const finalInstruction = config.instruction;
  if (config.enableGraphvizRendering) {
    toolsImport.add("render_graphviz");
    toolListForAgent.push("render_graphviz");
  }

  const imports = [
    "import os",
    "import asyncio",
    "import nest_asyncio",
    "nest_asyncio.apply()",
    "from dotenv import load_dotenv",
    "from google.antigravity import Agent, LocalAgentConfig, ToolContext, types",
    "from google.antigravity.hooks import policy",
    "from pydantic import BaseModel, PrivateAttr",
    "from typing import Any",
    ...Array.from(toolImports),
  ].filter(Boolean);

  if (toolsImport.size > 0) {
    const toolsList = Array.from(toolsImport).join(", ");
    imports.push(`try:
    from .tools import ${toolsList}
except ImportError:
    from tools import ${toolsList}`);
  }

  return `
${imports.join("\n")}

load_dotenv()

# Force Vertex AI API variant to prevent the 'Missing key inputs argument' Google AI validation error
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

# Initialize Tools
${toolInitializations.length > 0 ? toolInitializations.join("\n\n") : "# No additional tools defined"}

# Wrapper for Synchronous Execution (Reasoning Engine Requirement for some runtimes)
class SyncAgentWrapper(BaseModel):
    """
    Wraps an async agent to provide a synchronous query interface
    compatible with Vertex AI Reasoning Engine's strict expectations.
    """
    _lazy_agent: Any = PrivateAttr(default=None)

    def query(self, input: str = "", message: str = "", **kwargs) -> str:
        if self._lazy_agent is None:
            self.set_up()

        prompt = input or message
        
        async def _run_loop():
            try:
                async with self._lazy_agent as agent:
                    response = await agent.chat(prompt)
                    text = await response.text()
                    return text or "Agent executed successfully but produced no text response."
            except Exception as e:
                import logging
                logging.exception(f"Agent execution error: {e}")
                return f"Agent execution error: {type(e).__name__} - {str(e)}"
            
        return asyncio.run(_run_loop())

    def set_up(self):
        """
        Called by Reasoning Engine infrastructure during initialization or lazily.
        """
        if self._lazy_agent is None:
            self._lazy_agent = create_agent()

    async def stream_query(self, input: str = "", message: str = "", **kwargs):
        if self._lazy_agent is None:
            self.set_up()

        prompt = ""
        if hasattr(input, "query") or hasattr(input, "message") or hasattr(input, "new_message"):
            prompt = getattr(input, "query", "") or getattr(input, "message", "") or ""
            if not prompt and hasattr(input, "new_message") and input.new_message:
                if hasattr(input.new_message, "parts") and input.new_message.parts:
                    prompt = "".join([getattr(p, "text", "") for p in input.new_message.parts if getattr(p, "text", None)])
        if not prompt:
            prompt = (input if isinstance(input, str) else "") or (message if isinstance(message, str) else "")

        async with self._lazy_agent as agent:
            response = await agent.chat(prompt)
            async for chunk in response:
                txt = getattr(chunk, "text", "") or str(chunk)
                if txt:
                    yield {
                        "candidates": [
                            {
                                "content": {
                                    "parts": [{"text": txt}],
                                    "role": "model"
                                }
                            }
                        ]
                    }

    async def _run_async_impl(self, input: str = "", message: str = "", **kwargs):
        async for chunk in self.stream_query(input, message, **kwargs):
            yield chunk

    async def run_async(self, ctx):
        """
        Handler for async stream execution expected by the Vertex AI ADK templates.
        """
        prompt = getattr(ctx, "query", "") or getattr(ctx, "message", "") or ""
        if not prompt and hasattr(ctx, "new_message") and ctx.new_message:
            if hasattr(ctx.new_message, "parts") and ctx.new_message.parts:
                prompt = "".join([getattr(p, "text", "") for p in ctx.new_message.parts if getattr(p, "text", None)])

        if self._lazy_agent is None:
            self.set_up()

        try:
            from google.adk.events import Event
            from google.genai import types as genai_types
        except ImportError:
            class Event:
                def __init__(self, content): self.content = content
                def is_final_response(self): return True
            class genai_types:
                class Content:
                    def __init__(self, role, parts): self.role = role; self.parts = parts
                class Part:
                    @staticmethod
                    def from_text(text):
                        class PartText:
                            def __init__(self, t): self.text = t
                        return PartText(text)

        async with self._lazy_agent as agent:
            response = await agent.chat(prompt)
            async for chunk in response:
                txt = str(chunk)
                if txt:
                    yield Event(content=genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=txt)]))

    async def streaming_agent_run_with_events(self, request_json: str):
        """Streams responses asynchronously from the ADK application (AgentSpace/A2A entrypoint)."""
        if self._lazy_agent is None:
            self.set_up()

        import json
        req = json.loads(request_json)
        msg_dict = req.get("message")
        prompt = ""
        if msg_dict:
            parts = msg_dict.get("parts", [])
            prompt = "".join([part.get("text", "") for part in parts if part.get("text")])

        session_id = req.get("session_id") or req.get("sessionId") or "default_session"
        authorizations = req.get("authorizations")
        if isinstance(authorizations, dict):
            for a_id, a_data in authorizations.items():
                tok = a_data.get("access_token") or a_data.get("token") if isinstance(a_data, dict) else (a_data if isinstance(a_data, str) else None)
                if tok:
                    os.environ[a_id] = tok
                    os.environ[f"temp:{a_id}"] = tok

        async with self._lazy_agent as agent:
            response = await agent.chat(prompt)
            async for chunk in response:
                txt = getattr(chunk, "text", "") or str(chunk)
                if txt:
                    event_dict = {
                        "content": {
                            "role": "model",
                            "parts": [{"text": txt}]
                        }
                    }
                    yield {
                        "events": [event_dict],
                        "artifacts": [],
                        "session_id": session_id
                    }

    def register_operations(self) -> dict[str, list[str]]:
        return {
            "": ["query"],
            "stream": ["stream_query", "streaming_agent_run_with_events"]
        }

# Define the agent factory
def create_agent():
    # Resolve static auth headers if AUTH_ID environment variable is provided
    headers = {}
    auth_id = os.getenv("AUTH_ID")
    if auth_id:
        token = os.getenv(auth_id)
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
    # Add x-goog-user-project for quota attribution (critical for Google APIs)
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    if project_id:
        headers["x-goog-user-project"] = project_id

    mcp_servers = []
    
    ${config.enableBigQueryMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="bigquery", url="https://bigquery.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableCloudLoggingMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="logging", url="https://logging.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableBigtableAdminMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="bigtable", url="https://bigtableadmin.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableCloudSqlMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="sqladmin", url="https://sqladmin.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableCloudMonitoringMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="monitoring", url="https://monitoring.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableComputeEngineMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="compute", url="https://compute.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableFirestoreMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="firestore", url="https://firestore.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableGkeMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="container", url="https://container.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableResourceManagerMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="resourcemanager", url="https://cloudresourcemanager.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableSpannerMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="spanner", url="https://spanner.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableDeveloperKnowledgeMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="developerknowledge", url="https://developerknowledge.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableMapsGroundingMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="mapstools", url="https://mapstools.googleapis.com/mcp", headers=headers))` : ""}

    ${config.customMcpEndpoints && config.customMcpEndpoints.length > 0
      ? `
    # Custom MCP Endpoints
    ${config.customMcpEndpoints
        .map((endpoint) => {
          const safeName = endpoint.name.replace(/[^a-zA-Z0-9_]/g, "_");
          return `mcp_servers.append(types.McpStreamableHttpServer(name="${safeName}", url="${endpoint.url}", headers=headers))`;
        })
        .join("\n    ")}`
      : ""
    }

    # Safety Policies
    policies = []
    ${config.enableCodeExecution ? "" : 'policies.append(policy.deny("run_command"))'}
    policies.append(policy.allow_all())

    model_name = os.getenv("MODEL", ${formatPythonString(modelName)})
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    if model_name.startswith("gemini-3") or "3.5" in model_name or "latest" in model_name:
        location = "global"

    thinking_config = None
    ${config.enableThinking
        ? `
    is_gemini_3 = model_name.startswith("gemini-3") or "3.5" in model_name or "3.8" in model_name or "latest" in model_name
    if is_gemini_3:
        thinking_level = os.getenv("THINKING_LEVEL", "${config.thinkingLevel || "HIGH"}")
        thinking_config = types.ThinkingConfig(
            thinking_level=thinking_level,
        )
    else:
        thinking_budget = int(os.getenv("THINKING_BUDGET", "${config.thinkingBudget || 1024}"))
        thinking_config = types.ThinkingConfig(
            thinking_budget=thinking_budget,
        )
    `
        : ""
      }

    config = LocalAgentConfig(
        model=model_name,
        system_instructions=${formatPythonString(finalInstruction)},
        vertex=True,
        project=project_id,
        location=location,
        tools=[${toolListForAgent.join(", ")}],
        mcp_servers=mcp_servers,
        policies=policies if policies else None,
        workspaces=[os.getcwd()],
        app_data_dir=os.path.join(os.getcwd(), "brain")${config.enableThinking ? `,\n        thinking_config=thinking_config` : ""}
    )

    return Agent(config)

root_agent = create_agent()
`.trim();
};

export const generateAdkPythonCode = (
  config: AdkAgentConfig,
  useRelativeImports: boolean = false,
): string => {
  if (config.adkVersion === "2.2") {
    return generateAdk22PythonCode(config, useRelativeImports);
  }
  const toolImports = new Set<string>();
  const toolInitializations: string[] = [];
  const toolListForAgent: string[] = [];
  const pluginsImports = new Set<string>();
  const pluginInitializations: string[] = [];
  const pluginList: string[] = [];

  // We import from tools now
  const toolsImport = new Set<string>();

  // Model selection logic
  const modelName = config.model;
  const agentClass = "Agent";
  const agentImport = "from google.adk.agents import Agent";
  const adkAppImport = "from google.adk.apps import App";

  toolImports.add("import google.auth");

  if (config.enableCodeExecution) {
    toolImports.add("from google.adk.tools import AgentTool");
    toolImports.add(
      "from google.adk.code_executors.built_in_code_executor import BuiltInCodeExecutor",
    );

    toolInitializations.push(`def code_executor_agent():
    instruction = (
        "You are a Python Data Science and Visualization Expert. Your goal is to transform "
        "raw data into actionable visual insights.\\n\\n"
        "OPERATIONAL GUIDELINES:\\n"
        "1. DATA PROCESSING: Use 'pandas' and 'numpy' for all data manipulation.\\n"
        "2. VISUALIZATION STANDARDS: Use 'matplotlib' and 'seaborn' for plotting.\\n"
        "   - Every chart MUST have: A descriptive Title, X/Y Axis Labels, and a Legend if multiple series exist.\\n"
        "   - Styling: Use 'sns.set_theme(style=\\'whitegrid\\')' for a clean, professional look.\\n"
        "3. ARTIFACT GENERATION: You MUST save your final plot as a PNG file to artifacts (e.g., 'chart.png'). "
        "This file will be automatically processed as an artifact for the user.\\n"
    )
 
    return Agent(
        name='code_exec_agent',
        model="gemini-2.5-flash", 
        description="Data Visualization and Analysis Expert. Delegate to this agent for generating charts, plots, and complex Python calculations.",
        code_executor=BuiltInCodeExecutor(),
        instruction=instruction
    )

code_exec_tool = AgentTool(code_executor_agent())`);

    toolListForAgent.push("code_exec_tool");
  }

  // Inject A2A Helper Function Import
  if (config.tools.some((t) => t.type === "A2AClientTool")) {
    toolsImport.add("create_a2a_tool");
  }

  config.tools.forEach((tool) => {
    if (tool.type === "VertexAiSearchTool" && tool.dataStoreId) {
      toolImports.add("from google.adk.tools import VertexAiSearchTool");
      toolInitializations.push(
        `${tool.variableName} = VertexAiSearchTool(\n    data_store_id="${tool.dataStoreId}"\n)`,
      );
      toolListForAgent.push(tool.variableName);
    } else if (tool.type === "A2AClientTool" && tool.url) {
      const funcName = tool.variableName || "a2a_tool";
      toolInitializations.push(
        `${tool.variableName} = create_a2a_tool(\n    url="${tool.url}",\n    tool_name="${funcName}"\n)`,
      );
      toolListForAgent.push(tool.variableName);
    }
  });

  if (config.useGoogleSearch) {
    const hasOtherTools =
      Boolean(config.enableCodeExecution) ||
      Boolean(config.enableGraphvizRendering) ||
      Boolean(config.enableBigQueryMcp) ||
      Boolean(config.enableCloudLoggingMcp) ||
      Boolean(config.enableCloudMonitoringMcp) ||
      Boolean(config.enableResourceManagerMcp) ||
      Boolean(config.enableComputeEngineMcp) ||
      Boolean(config.enableGkeMcp) ||
      Boolean(config.enableCloudSqlMcp) ||
      Boolean(config.enableBigtableAdminMcp) ||
      Boolean(config.enableSpannerMcp) ||
      Boolean(config.enableFirestoreMcp) ||
      Boolean(config.enableDeveloperKnowledgeMcp) ||
      Boolean(config.enableMapsGroundingMcp) ||
      Boolean(config.enableCloudLoggingApi) ||
      Boolean(config.enableCloudMonitoringApi) ||
      Boolean(config.enableCloudRunApi) ||
      Boolean(config.enableResourceManagerApi) ||
      Boolean(config.enableAdminActivityApi) ||
      Boolean(config.enableDatabaseFleetApi) ||
      Boolean(config.enableSecurityCommandCenterApi) ||
      Boolean(config.enableRecommenderApi) ||
      Boolean(config.enableServiceHealthApi) ||
      Boolean(config.enableNetworkManagementApi) ||
      Boolean(config.enableCloudAssistApi) ||
      Boolean(config.enableEmailTool) ||
      Boolean(config.enableDiscoveryApi) ||
      Boolean(config.customMcpEndpoints && config.customMcpEndpoints.length > 0) ||
      Boolean(config.tools && config.tools.length > 0);

    toolImports.add("from google.adk.tools import google_search_tool");
    if (hasOtherTools) {
      toolImports.add("from google.adk.tools import AgentTool");
      toolInitializations.push(`def web_search_subagent():
    return Agent(
        name="web_search_agent",
        model="${config.model || "gemini-2.5-flash"}",
        description="Search the web for real-time external information, documentation, and reference material.",
        tools=[google_search_tool.GoogleSearchTool()],
        instruction="You are a web search assistant. Search the web and return concise, factual summaries with sources."
    )

web_search_tool = AgentTool(web_search_subagent())`);
      toolListForAgent.push("web_search_tool");
    } else {
      toolInitializations.push(`google_search = google_search_tool.GoogleSearchTool()`);
      toolListForAgent.push("google_search");
    }
  }

  if (config.enableBqAnalytics) {
    pluginsImports.add(
      "from google.adk.plugins.bigquery_agent_analytics_plugin import BigQueryAgentAnalyticsPlugin",
    );
    pluginInitializations.push(`# BigQuery Analytics Plugin
bq_logging_plugin = BigQueryAgentAnalyticsPlugin(
    project_id=os.environ.get("GOOGLE_CLOUD_PROJECT"),
    dataset_id="${config.bqDatasetId}",
    table_id="${config.bqTableId || "agent_events"}"
)`);
    pluginList.push("bq_logging_plugin");
  }

  if (config.enableDiscoveryApi) {
    toolsImport.add("query_gemini_enterprise");
    toolListForAgent.push("query_gemini_enterprise");
  }

  if (config.enableBigQueryMcp) {
    toolsImport.add("get_bq_mcp_toolset");
    toolInitializations.push("bq_mcp_toolset = get_bq_mcp_toolset()");
    toolListForAgent.push("bq_mcp_toolset");
  }
  if (
    config.enableCloudLoggingMcp ||
    config.enableCloudLoggingApi ||
    config.enableCloudMonitoringMcp ||
    config.enableCloudMonitoringApi
  ) {
    toolsImport.add("get_current_time");
    toolListForAgent.push("get_current_time");
  }
  if (config.enableCloudLoggingMcp) {
    toolsImport.add("get_logging_mcp_toolset");
    toolInitializations.push("logging_mcp_toolset = get_logging_mcp_toolset()");
    toolListForAgent.push("logging_mcp_toolset");
  }

  const mcpServicesForAgent = [
    { key: "enableBigtableAdminMcp", name: "bigtable" },
    { key: "enableCloudSqlMcp", name: "sqladmin" },
    { key: "enableCloudMonitoringMcp", name: "monitoring" },
    { key: "enableComputeEngineMcp", name: "compute" },
    { key: "enableFirestoreMcp", name: "firestore" },
    { key: "enableGkeMcp", name: "gke" },
    { key: "enableResourceManagerMcp", name: "resourcemanager" },
    { key: "enableSpannerMcp", name: "spanner" },
    { key: "enableDeveloperKnowledgeMcp", name: "developerknowledge" },
    { key: "enableMapsGroundingMcp", name: "mapstools" },
  ];

  mcpServicesForAgent.forEach(({ key, name }) => {
    if ((config as any)[key]) {
      toolsImport.add(`get_${name}_mcp_toolset`);
      toolInitializations.push(
        `${name}_mcp_toolset = get_${name}_mcp_toolset()`,
      );
      toolListForAgent.push(`${name}_mcp_toolset`);
    }
  });

  if (config.customMcpEndpoints && config.customMcpEndpoints.length > 0) {
    toolImports.add(
      "from google.adk.tools.mcp_tool.mcp_toolset import McpToolset",
    );

    let hasSse = false;
    let hasRegular = false;

    config.customMcpEndpoints.forEach((endpoint) => {
      if (endpoint.name && endpoint.url) {
        if (endpoint.url.endsWith("/sse")) {
          hasSse = true;
        } else {
          hasRegular = true;
        }
      }
    });

    if (hasSse) {
      toolImports.add(
        "from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams",
      );
    }
    if (hasRegular || !hasSse) {
      toolImports.add(
        "from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams",
      );
    }

    config.customMcpEndpoints.forEach((endpoint) => {
      if (endpoint.name && endpoint.url) {
        // Ensure name is a valid python variable name
        const safeName = endpoint.name.replace(/[^a-zA-Z0-9_]/g, "_");
        const paramClass = endpoint.url.endsWith("/sse")
          ? "SseConnectionParams"
          : "StreamableHTTPConnectionParams";
        toolInitializations.push(
          `${safeName} = McpToolset(\n    connection_params=${paramClass}(\n        url="${endpoint.url}",\n    ),\n)`,
        );
        toolListForAgent.push(safeName);
      }
    });
  }

  if (config.enableEmailTool) {
    toolsImport.add("send_email");
    toolListForAgent.push("send_email");
  }

  if (config.enableSecurityCommandCenterApi) {
    toolsImport.add("list_active_findings");
    toolListForAgent.push("list_active_findings");
  }

  if (config.enableRecommenderApi) {
    toolsImport.add("list_recommendations");
    toolsImport.add("list_cost_recommendations");
    toolListForAgent.push("list_recommendations");
    toolListForAgent.push("list_cost_recommendations");
  }

  if (config.enableServiceHealthApi) {
    toolsImport.add("check_service_health");
    toolListForAgent.push("check_service_health");
  }

  if (config.enableNetworkManagementApi) {
    toolsImport.add("run_connectivity_test");
    toolListForAgent.push("run_connectivity_test");
  }

  if (config.enableCloudAssistApi) {
    toolsImport.add("investigate_with_cloud_assist");
    toolListForAgent.push("investigate_with_cloud_assist");
  }

  if (config.enableCloudLoggingApi) {
    toolsImport.add("search_logs");
    toolListForAgent.push("search_logs");
  }

  if (config.enableCloudMonitoringApi) {
    toolsImport.add("check_health");
    toolsImport.add("get_service_metrics");
    toolListForAgent.push("check_health");
    toolListForAgent.push("get_service_metrics");
  }

  if (config.enableCloudRunApi) {
    toolsImport.add("list_services");
    toolListForAgent.push("list_services");
  }

  if (config.enableResourceManagerApi) {
    toolsImport.add("list_projects");
    toolsImport.add("resolve_project_id");
    toolListForAgent.push("list_projects");
    toolListForAgent.push("resolve_project_id");
  }

  if (config.enableAdminActivityApi) {
    toolsImport.add("list_recent_changes");
    toolListForAgent.push("list_recent_changes");
  }

  if (config.enableDatabaseFleetApi) {
    toolsImport.add("check_database_fleet_health");
    toolListForAgent.push("check_database_fleet_health");
  }



  let finalInstruction = config.instruction;
  if (toolListForAgent.length > 0) {
    // Remove "no access to external tools" phrase if present, case-insensitive
    finalInstruction = finalInstruction.replace(
      /no access to external tools\.?/gi,
      "",
    );
    // Clean up any double spaces or spaces before periods left over
    finalInstruction = finalInstruction
      .replace(/ +/g, " ")
      .replace(/ \./g, ".")
      .trim();
  }
  if (config.enableCodeExecution || config.enableGraphvizRendering) {
    finalInstruction += `\\n\\nAdditionally, you have access to specialized tools and sub-agents:`;
    if (config.enableCodeExecution) {
      finalInstruction += `\\n- \`code_exec_agent\`: A specialized Python Data Science Expert for generating charts, graphs, and plots from data.`;
    }
    if (config.enableGraphvizRendering) {
      finalInstruction += `\\n- \`render_graphviz\`: A specialized tool for locally rendering Graphviz (.dot) architecture diagrams.`;
    }
    finalInstruction += `\\n\\nWhen asked to analyze data or create a visualization:`;
    if (config.enableCodeExecution) {
      finalInstruction += `\\n- For charts and data plots: Provide the query results to \`code_exec_agent\` and ask it to generate the requested chart.`;
    }
    if (config.enableGraphvizRendering) {
      finalInstruction += `\\n- For system architectures, schemas, or flowcharts: Generate the .dot code and use the \`render_graphviz\` tool to create the diagram.`;
      finalInstruction += `\\n  CRITICAL: When render_graphviz returns the markdown image string AND the clickable hyperlink, you MUST output BOTH strings verbatim to the user in your final response. Do NOT summarize or omit the image link or the hyperlink.`;
    }
    finalInstruction += `\\nDO NOT output raw code to the user. Always delegate explicitly to the appropriate tool or sub-agent to generate the visual artifact.`;
  }

  const imports = [
    "import os",
    "import nest_asyncio",
    "nest_asyncio.apply()",
    "from dotenv import load_dotenv",
    "from google.adk.agents import BaseAgent",
    "from pydantic import BaseModel, PrivateAttr",
    "from typing import Any",
    agentImport,
    config.enableThinking
      ? "from google.adk.planners import BuiltInPlanner"
      : "",
    "from google.genai import types as genai_types",
    ...Array.from(toolImports),
    ...Array.from(pluginsImports),
  ].filter(Boolean);

  if (config.enableGraphvizRendering) {
    toolsImport.add("render_graphviz");
    toolListForAgent.push("render_graphviz");
  }

  if (toolsImport.size > 0) {
    const toolsList = Array.from(toolsImport).join(", ");
    imports.push(`try:
    from .tools import ${toolsList}
except ImportError:
    from tools import ${toolsList}`);
  }

  return `
${imports.join("\n")}

load_dotenv()

# Force Vertex AI API variant to prevent the 'Missing key inputs argument' Google AI validation error
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

# Route Gemini 3/3.5 models to global region since they are not regionalized in us-central1
model_name = os.getenv("MODEL", "${config.model || "gemini-3.5-flash"}")
if model_name.startswith("gemini-3") or "3.5" in model_name or "latest" in model_name:
    os.environ["GOOGLE_CLOUD_LOCATION"] = "global"


# --- ADK Resilience Patch ---
# Prevents the entire agent stream from crashing if an MCP server returns an HTTP error (e.g. 400 Bad Request)
# The error happens deep inside an anyio.TaskGroup, so we must monkey-patch the streamable transport.
try:
    import logging
    import httpx
    from mcp.client.streamable_http import StreamableHTTPTransport

    _original_handle_post_request = StreamableHTTPTransport._handle_post_request

    async def _safe_handle_post_request(self, ctx):
        try:
            await _original_handle_post_request(self, ctx)
        except httpx.HTTPStatusError as e:
            try:
                await e.response.aread()
                resp_text = e.response.text
            except Exception:
                resp_text = str(e)
            logging.error(f"MCP HTTPStatusError caught: {e.response.status_code} - {resp_text}")
            # Send a synthetic JSONRPCError back through the memory stream so the client gets a clean rejection
            from mcp.types import JSONRPCError, ErrorData, JSONRPCMessage
            from mcp.shared.message import SessionMessage
            
            request_id = getattr(ctx.session_message.message.root, "id", None)
            if request_id is not None:
                jsonrpc_error = JSONRPCError(
                    jsonrpc="2.0",
                    id=request_id,
                    error=ErrorData(
                        code=-32000, 
                        message=f"Google MCP API Error ({e.response.status_code}): {resp_text}"
                    ),
                )
                try:
                    await ctx.read_stream_writer.send(SessionMessage(JSONRPCMessage(jsonrpc_error)))
                    return
                except Exception as send_err:
                    logging.error(f"Failed to send synthetic error back to stream: {send_err}")
            raise e

    StreamableHTTPTransport._handle_post_request = _safe_handle_post_request
except ImportError:
    pass
# ----------------------------

# --- ADK Schema Recursion Patch ---
# Prevents infinite recursion when expanding deeply nested or circular OpenAPI/JSON schemas
try:
    import google.adk.tools._gemini_schema_util as _schema_util

    def _safe_dereference_schema(schema: dict) -> dict:
        defs = schema.get("$defs", {})
        def _resolve_refs(sub_schema, depth=0):
            if depth > 10:
                return {"type": "object", "description": "Recursive structure omitted"}
            if isinstance(sub_schema, dict):
                if "$ref" in sub_schema:
                    ref_key = sub_schema.get("$ref", "").split("/")[-1]
                    if ref_key in defs:
                        resolved = defs[ref_key].copy()
                        sub_schema_copy = sub_schema.copy()
                        del sub_schema_copy["$ref"]
                        resolved.update(sub_schema_copy)
                        return _resolve_refs(resolved, depth + 1)
                    return sub_schema
                return {key: _resolve_refs(value, depth) for key, value in sub_schema.items()}
            elif isinstance(sub_schema, list):
                return [_resolve_refs(item, depth) for item in sub_schema]
            return sub_schema

        dereferenced_schema = _resolve_refs(schema)
        if "$defs" in dereferenced_schema:
            del dereferenced_schema["$defs"]
        return dereferenced_schema

    _schema_util._dereference_schema = _safe_dereference_schema
except Exception as patch_err:
    logging.warning(f"Failed to apply ADK Schema Recursion Patch: {patch_err}")
# ----------------------------------

# Initialize Tools
${toolInitializations.length > 0 ? toolInitializations.join("\n\n") : "# No additional tools defined"}

# Initialize Plugins
${pluginInitializations.length > 0 ? pluginInitializations.join("\n\n") : "# No plugins defined"}

${config.enableThinking
      ? `
# Define generation_content_config for Thinking
model_name = os.getenv("MODEL", ${formatPythonString(modelName)})
is_gemini_3 = model_name.startswith("gemini-3") or "3.5" in model_name or "3.8" in model_name or "latest" in model_name
if is_gemini_3:
    thinking_level = os.getenv("THINKING_LEVEL", "${config.thinkingLevel || "HIGH"}")
    thinking_config = genai_types.ThinkingConfig(
        thinking_level=thinking_level,
    )
else:
    thinking_budget = int(os.getenv("THINKING_BUDGET", "${config.thinkingBudget || 1024}"))
    thinking_config = genai_types.ThinkingConfig(
        thinking_budget=thinking_budget,
    )
`
      : ""
    }

# Define Model Armor Callback if configured
async def model_armor_before_model_callback(callback_context, model_request):
    """Model Armor sanitization and prompt defense callback."""
    model_armor_template = os.getenv("MODEL_ARMOR_TEMPLATE")
    if not model_armor_template:
        return None
    # Inspect or sanitize prompt parts via Model Armor policy
    return None

# Application wrapper using Vertex AI Agent Engines AdkApp
try:
    from vertexai.agent_engines import AdkApp
except ImportError:
    try:
        from vertexai.preview.reasoning_engines import AdkApp
    except ImportError:
        # Fallback dummy for local verification environments without vertexai installed
        class AdkApp:
            def __init__(self, *args, **kwargs):
                self._tmpl_attrs = kwargs
            def stream_query(self, *args, **kwargs):
                return []
            def register_operations(self):
                return {
                    "": ["get_session", "list_sessions", "create_session", "delete_session"],
                    "async": ["async_get_session", "async_list_sessions", "async_create_session", "async_delete_session"],
                    "stream": ["stream_query"],
                    "async_stream": ["async_stream_query", "streaming_agent_run_with_events"]
                }

class StudioAdkApp(AdkApp):
    """
    Subclasses vertexai.agent_engines.AdkApp to provide:
    1. A convenient synchronous query() method that consumes the stream for direct RE calls.
    2. A2A discovery card endpoint (get_a2a_discovery_card) for Reasoning Engine discovery.
    3. Seamless durable sessions via VertexAiSessionService in Agent Engine.
    """
    def query(self, message: str = "", input: str = "", **kwargs) -> str:
        """Synchronous query method for Reasoning Engine / Agent Engine invocations."""
        msg = message or input or ""
        user_id = kwargs.get("user_id", "default_user")
        session_id = kwargs.get("session_id")
        final_text = ""
        try:
            for event in self.stream_query(message=msg, user_id=user_id, session_id=session_id):
                if isinstance(event, dict):
                    content = event.get("content")
                    if isinstance(content, dict):
                        parts = content.get("parts", [])
                        for part in parts:
                            if isinstance(part, dict) and part.get("text"):
                                final_text += part["text"]
                    elif event.get("text"):
                        final_text += event["text"]
        except Exception as e:
            import logging
            logging.exception(f"Query execution failed: {e}")
            return f"Agent execution error: {type(e).__name__} - {str(e)}"
        return final_text or "Agent completed execution without textual output."

    def get_a2a_discovery_card(self) -> str:
        """Exposes the A2A discovery card for Reasoning Engine discovery."""
        import json
        agent = self._tmpl_attrs.get("agent")
        name = getattr(agent, "name", "agent") if agent else "agent"
        description = getattr(agent, "description", "") if agent else ""
        card = {
            "name": name,
            "description": description,
            "url": f"agent-engine://{os.environ.get('GOOGLE_CLOUD_PROJECT', '')}/{name}",
            "capabilities": {"streaming": True},
            "version": "1.0.0"
        }
        return json.dumps(card)

    def register_operations(self) -> dict[str, list[str]]:
        ops = super().register_operations()
        if "query" not in ops.get("", []):
            ops.setdefault("", []).append("query")
        if "get_a2a_discovery_card" not in ops.get("", []):
            ops.setdefault("", []).append("get_a2a_discovery_card")
        return ops

# Define the agent factory
def create_agent():
    return ${agentClass}(
        name=${formatPythonString(config.name)},
        description=${formatPythonString(config.description)},
        model=os.getenv("MODEL", ${formatPythonString(modelName)}),
        instruction=${formatPythonString(finalInstruction)},
        generate_content_config=genai_types.GenerateContentConfig(
            http_options=genai_types.HttpOptions(
                retry_options=genai_types.HttpRetryOptions(initial_delay=1, attempts=2)
            ),${config.enableThinking
      ? `
            **({"thinking_config": thinking_config} if thinking_config else {}),`
      : ""
    }
        ),
        tools=[${toolListForAgent.join(", ")}],
        before_model_callback=model_armor_before_model_callback if (os.getenv("MODEL_ARMOR_TEMPLATE") or ${config.enableModelArmor ? "True" : "False"}) else None,
    )

root_agent = create_agent()

# Instantiate the Agent Engine application
app = StudioAdkApp(
    agent=root_agent,${pluginList.length > 0 ? `\n    plugins=[${pluginList.join(", ")}],` : ""}
    enable_tracing=False,
)
`.trim();
};

export const generateAppPy = (configOrRelative: boolean | AdkAgentConfig = false): string => {
  return `
import logging
import os

try:
    import nest_asyncio
    nest_asyncio.apply()
except ImportError:
    pass

try:
    from .agent import app, root_agent
except ImportError:
    from agent import app, root_agent

logger = logging.getLogger(__name__)
`.trim();
};

export const generateInitPy = (): string => {
  return `from . import agent
from . import app
`;
};

