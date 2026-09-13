import { AdkAgentConfig } from "../types";

export const generateMcpToolsets = (config: AdkAgentConfig, isV2: boolean): string => {
  let code = "";
  if (!isV2) {
    code += `
def _get_mcp_auth_headers(context: Any) -> Dict[str, str]:
    """Provider for dynamic auth headers with end-user OAuth delegation and ADC fallback."""
    headers = {}
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("PROJECT_ID") or os.getenv("BQ_USER_PROJECT")
    if project_id:
        headers["x-goog-user-project"] = project_id

    # 1. Try end-user credentials from context
    try:
        creds = get_user_credentials(context)
        if creds:
            if not creds.valid:
                import google.auth.transport.requests
                creds.refresh(google.auth.transport.requests.Request())
            if creds.token:
                logger.info("Using delegated end-user OAuth credentials for MCP call.")
                headers["Authorization"] = f"Bearer {creds.token}"
                return headers
    except Exception as e:
        logger.debug(f"Could not retrieve user credentials from context: {e}")

    # 2. Fallback to Application Default Credentials (ADC)
    try:
        import google.auth
        import google.auth.transport.requests
        adc_creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        if not adc_creds.valid:
            adc_creds.refresh(google.auth.transport.requests.Request())
        if adc_creds.token:
            logger.info("Using Application Default Credentials (ADC) as fallback for MCP call.")
            headers["Authorization"] = f"Bearer {adc_creds.token}"
            return headers
    except Exception as e:
        logger.warning(f"Failed to acquire ADC fallback credentials: {e}")

    return headers

def get_logging_mcp_toolset() -> McpToolset:
    """
    Creates and returns the Cloud Logging MCP toolset.
    """
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="https://logging.googleapis.com/mcp",
            timeout=120.0, # Increased timeout for cold starts
        ),
        tool_name_prefix="logging_",
        header_provider=_get_mcp_auth_headers
    )
`;
  }

  if (config.tools.some((t) => t.type === "A2AClientTool")) {
    code += `
def create_a2a_tool(url: str, tool_name: str):
    """Creates a callable function tool to interact with an A2A agent."""
    
    def a2a_interaction(message: str) -> str:
        """Sends a message to the specific agent and returns the response."""
        invoke_url = url.rstrip('/') + "/invoke"
        payload = {
            "jsonrpc": "2.0",
            "method": "chat",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"text": message}]
                }
            },
            "id": "1"
        }
        
        headers = {"Content-Type": "application/json"}
        
        try:
            auth_req = google.auth.transport.requests.Request()
            target_audience = url.replace("/invoke", "").rstrip('/')
            id_token = google.oauth2.id_token.fetch_id_token(auth_req, target_audience)
            headers["Authorization"] = f"Bearer {id_token}"
        except Exception as e:
            print(f"Warning: Auth token fetch failed for A2A: {e}")

        try:
            response = requests.post(invoke_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                return f"Error from agent: {data['error']}"
            return data.get("result", {}).get("message", {}).get("parts", [{}])[0].get("text", str(data))
        except Exception as e:
            return f"Communication failed: {e}"

    a2a_interaction.__name__ = tool_name
    return a2a_interaction
`;
  }

  if (!isV2 && config.enableBigQueryMcp) {
    code += `
def get_bq_mcp_toolset() -> McpToolset:
    """
    Returns the BigQuery MCP Toolset configured to use the Google Cloud OneMCP API via SSE.
    Provides functions: list_dataset_ids, list_table_ids, get_dataset_info, get_table_info, execute_sql.
    """
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="https://bigquery.googleapis.com/mcp",
        ),
        tool_name_prefix="bq_",
        header_provider=_get_mcp_auth_headers
    )
`;
  }

  const mcpServices = [
    {
      key: "enableBigtableAdminMcp",
      name: "bigtable",
      url: "https://bigtableadmin.googleapis.com/mcp",
    },
    {
      key: "enableCloudSqlMcp",
      name: "sqladmin",
      url: "https://sqladmin.googleapis.com/mcp",
    },
    {
      key: "enableCloudMonitoringMcp",
      name: "monitoring",
      url: "https://monitoring.googleapis.com/mcp",
    },
    {
      key: "enableComputeEngineMcp",
      name: "compute",
      url: "https://compute.googleapis.com/mcp",
    },
    {
      key: "enableFirestoreMcp",
      name: "firestore",
      url: "https://firestore.googleapis.com/mcp",
    },
    {
      key: "enableGkeMcp",
      name: "gke",
      url: "https://container.googleapis.com/mcp",
    },
    {
      key: "enableResourceManagerMcp",
      name: "resourcemanager",
      url: "https://cloudresourcemanager.googleapis.com/mcp",
    },
    {
      key: "enableSpannerMcp",
      name: "spanner",
      url: "https://spanner.googleapis.com/mcp",
    },
    {
      key: "enableDeveloperKnowledgeMcp",
      name: "developerknowledge",
      url: "https://developerknowledge.googleapis.com/mcp",
    },
    {
      key: "enableMapsGroundingMcp",
      name: "mapstools",
      url: "https://mapstools.googleapis.com/mcp",
    },
  ];

  if (!isV2) {
    mcpServices.forEach(({ key, name, url }) => {
      if ((config as unknown as Record<string, unknown>)[key]) {
        code += `
def get_${name}_mcp_toolset() -> McpToolset:
    """
    Returns the ${name} MCP Toolset.
    """
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="${url}",
            timeout=120.0,
        ),
        tool_name_prefix="${name}_",
        header_provider=_get_mcp_auth_headers
    )
`;
      }
    });
  }
  return code;
};
