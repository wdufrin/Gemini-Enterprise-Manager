import { AdkAgentConfig } from "./types";
import { generateDiscoveryTools } from "./tools/discoveryToolGenerators";
import { generateMcpToolsets } from "./tools/mcpToolGenerators";
import { generateCloudApiTools } from "./tools/cloudApiToolGenerators";

export const hasAnyTools = (config: AdkAgentConfig): boolean => {
  return (
    (config.tools && config.tools.length > 0) ||
    (config.customMcpEndpoints && config.customMcpEndpoints.length > 0) ||
    !!config.enableDiscoveryApi ||
    !!config.enableEmailTool ||
    !!config.enableSecurityCommandCenterApi ||
    !!config.enableRecommenderApi ||
    !!config.enableServiceHealthApi ||
    !!config.enableNetworkManagementApi ||
    !!config.enableCloudLoggingApi ||
    !!config.enableCloudMonitoringApi ||
    !!config.enableCloudRunApi ||
    !!config.enableResourceManagerApi ||
    !!config.enableAdminActivityApi ||
    !!config.enableDatabaseFleetApi ||
    !!config.enableCloudAssistApi ||
    !!config.enableGraphvizRendering ||
    !!config.enableCloudLoggingMcp ||
    !!config.enableBigtableAdminMcp ||
    !!config.enableCloudSqlMcp ||
    !!config.enableCloudMonitoringMcp ||
    !!config.enableComputeEngineMcp ||
    !!config.enableFirestoreMcp ||
    !!config.enableGkeMcp ||
    !!config.enableResourceManagerMcp ||
    !!config.enableSpannerMcp ||
    !!config.enableDeveloperKnowledgeMcp ||
    !!config.enableMapsGroundingMcp ||
    !!config.enableBigQueryMcp
  );
};

export const generateToolsPy = (
  config: AdkAgentConfig,
  _useRelativeImports: boolean = false,
): string => {
  const isV2 = config.adkVersion === "2.2";
  const toolContextImport = isV2
    ? "from google.antigravity import ToolContext"
    : "from google.adk.tools import ToolContext";

  let code = `import os
import logging
import json
import requests
import google.auth
import google.auth.transport.requests
import google.oauth2.id_token
from typing import Optional, Dict, Any, List
from google.genai import types
${toolContextImport}
${isV2 ? "" : `try:
    from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams
except ImportError:
    try:
        from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
        from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
    except ImportError:
        class McpToolset:
            def __init__(self, *args, **kwargs): pass
        class StreamableHTTPConnectionParams:
            def __init__(self, *args, **kwargs): pass`}

from pydantic import BaseModel, Field

class Artifact(BaseModel):
    """Represents a generated or referenced artifact (e.g. chart, document)."""
    uri: str
    mime_type: str = "image/png"
    description: str = ""

try:
    from .auth import get_user_credentials
except ImportError:
    try:
        from auth import get_user_credentials
    except ImportError:
        # Handle case where auth.py might not be generated or needed
        def get_user_credentials(context): return None

logger = logging.getLogger(__name__)
`;


  code += generateMcpToolsets(config, isV2);


  code += `
def get_current_time() -> str:
    """
    Gets the current UTC time formatted as an ISO 8601 string.
    Use this to retrieve the current time to construct timestamp filters (like past 24 hours).
    """
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec='seconds')
`;


  code += generateDiscoveryTools(config);
  code += generateCloudApiTools(config);

  return code;
};
