import { AdkAgentConfig } from "./types";
import { formatPythonString } from "./stringUtils";

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
            try:
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
            except Exception as e:
                import logging
                logging.exception(f"Stream query failed: {e}")
                yield {
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"text": f"Agent error: {type(e).__name__} - {str(e)}"}],
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
            try:
                response = await agent.chat(prompt)
                async for chunk in response:
                    txt = str(chunk)
                    if txt:
                        yield Event(content=genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=txt)]))
            except Exception as e:
                import logging
                logging.exception(f"run_async chat failed: {e}")
                yield Event(content=genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=f"Agent error: {type(e).__name__} - {str(e)}")]))

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
            try:
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
            except Exception as e:
                import logging
                logging.exception(f"Streaming agent run failed: {e}")
                err_dict = {
                    "content": {
                        "role": "model",
                        "parts": [{"text": f"Agent error: {type(e).__name__} - {str(e)}"}]
                    }
                }
                yield {
                    "events": [err_dict],
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
    is_gemini_3 = model_name.startswith("gemini-3") or "3.5" in model_name or "3.8" in model_name or "3.1" in model_name
    if is_gemini_3:
        thinking_level = os.getenv("THINKING_LEVEL", "${config.thinkingLevel || "HIGH"}")
        thinking_config = types.ThinkingConfig(
            thinking_level=thinking_level,
        )
    else:
        raw_budget = os.getenv("THINKING_BUDGET")
        try:
            thinking_budget = int(raw_budget) if raw_budget else ${config.thinkingBudget || 1024}
        except ValueError:
            thinking_budget = ${config.thinkingBudget || 1024}
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
