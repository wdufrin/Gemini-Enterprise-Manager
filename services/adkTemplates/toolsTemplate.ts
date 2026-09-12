import { AdkAgentConfig } from "./types";

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
  useRelativeImports: boolean = false,
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

  code += `
def get_current_time() -> str:
    """
    Gets the current UTC time formatted as an ISO 8601 string.
    Use this to retrieve the current time to construct timestamp filters (like past 24 hours).
    """
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec='seconds')
`;

  if (config.enableDiscoveryApi) {
    code += `
import google.auth
import google.auth.transport.requests

def query_gemini_enterprise(tool_context: ToolContext, query: str) -> str:
    """
    Directly queries the Gemini Enterprise / Discovery Engine Search and Assistant
    endpoint on behalf of the authenticated user to ground agent responses with 
    enterprise documents, intranet knowledge, and data stores.
    """
    project_id = os.getenv("DISCOVERY_ENGINE_PROJECT_ID")
    location = os.getenv("DISCOVERY_ENGINE_LOCATION", "global")
    collection = os.getenv("DISCOVERY_ENGINE_COLLECTION", "default_collection")
    engine_id = os.getenv("DISCOVERY_ENGINE_ENGINE_ID")
    
    if not all([project_id, engine_id]):
        return "Error: DISCOVERY_ENGINE_PROJECT_ID and DISCOVERY_ENGINE_ENGINE_ID must be set."
    
    url = f"https://discoveryengine.googleapis.com/v1alpha/projects/{project_id}/locations/{location}/collections/{collection}/engines/{engine_id}/assistants/default_assistant:streamAssist"
    
    # 1. Prioritize delegated end-user OAuth token to preserve document-level ACLs
    try:
        user_creds = get_user_credentials(tool_context)
    except Exception:
        user_creds = None
    token = getattr(user_creds, "token", None) if user_creds else None

    # 2. Safe fallback to Application Default Credentials (ADC) if no user token
    if not token:
        try:
            scopes = ["https://www.googleapis.com/auth/cloud-platform"]
            creds, _ = google.auth.default(scopes=scopes)
            auth_req = google.auth.transport.requests.Request()
            creds.refresh(auth_req)
            token = getattr(creds, "token", None)
        except Exception as auth_err:
            logger.warning(f"Failed to acquire ADC credentials for Discovery Engine: {auth_err}")
            return "Error: Authentication required to query Gemini Enterprise."
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Goog-User-Project": project_id
    }
    
    # Construct the payload
    # Note: The dataStoreSpecs are dynamic based on .env
    data_store_ids = os.getenv("DISCOVERY_ENGINE_DATA_STORE_IDS", "").split(",")
    data_store_specs = [
        {"dataStore": f"projects/{project_id}/locations/{location}/collections/{collection}/dataStores/{ds_id.strip()}"}
        for ds_id in data_store_ids if ds_id.strip()
    ]
    
    payload = {
        "query": {
            "text": query
        },
        "toolsSpec": {
            "vertexAiSearchSpec": {
                "dataStoreSpecs": data_store_specs
            }
        }
    }
    
    try:
        logger.info(f"Querying Gemini Enterprise: {query}")
        response = requests.post(url, headers=headers, json=payload, stream=True)
        response.raise_for_status()
        
        # Process the response
        try:
            # The API seems to return a pretty-printed JSON array [ ... ]
            # so we can parse the entire response as JSON.
            data = response.json()
            
            # If data is a list, iterate through items
            # If dict, wrap in list
            if isinstance(data, dict):
                 items = [data]
            else:
                 items = data

            full_response_text = ""
            unique_sources = {} # Map URI to Title to avoid duplicates

            for item in items:
                 # Check for errors
                 if "error" in item:
                      error_msg = item["error"].get("message", str(item["error"]))
                      logger.warning(f"Received error in response item: {error_msg}")
                      full_response_text += f"\\n[Error from upstream: {error_msg}]\\n"
                      continue

                 # 1. Extract Reply / Text
                 # Candidates: item['reply'], item['answer']
                 candidates = []
                 if "reply" in item: candidates.append(item["reply"])
                 if "answer" in item: candidates.append(item["answer"])
                 
                 for container in candidates:
                      if not isinstance(container, dict):
                           continue

                      # Case A: 'parts' directly in container (Standard Gemini)
                      if "parts" in container:
                           for part in container["parts"]:
                                if "text" in part:
                                     full_response_text += part["text"]
                      
                      # Case B: 'planStep' (Agent Engine)
                      if "planStep" in container and "parts" in container["planStep"]:
                           for part in container["planStep"]["parts"]:
                                if "text" in part:
                                     full_response_text += part["text"]

                      # Case C: 'replies' list (Discovery Engine Answer API)
                      if "replies" in container:
                           for reply_item in container["replies"]:
                                # reply_item['groundedContent']['content']['text']
                                content = reply_item.get("groundedContent", {}).get("content", {})
                                if "text" in content:
                                     full_response_text += content["text"]

                                # Check for citations in reply item
                                if "citations" in reply_item:
                                     for citation in reply_item["citations"]:
                                          for source in citation.get("sources", []):
                                               uri = source.get("uri")
                                               title = source.get("title")
                                               if uri:
                                                    unique_sources[uri] = title or uri

                 # Check for citations at root level
                 if "citations" in item:
                     for citation in item["citations"]:
                         for source in citation.get("sources", []):
                             uri = source.get("uri")
                             title = source.get("title")
                             if uri:
                                 unique_sources[uri] = title or uri

            # Format the final output with sources
            final_output = full_response_text.strip()

            if unique_sources:
                 final_output += "\\n\\n**Available Sources:**\\n"
                 for uri, title in unique_sources.items():
                      final_output += f"- [{title}]({uri})\\n"

            return final_output

        except json.JSONDecodeError:
             # Fallback to raw text if JSON fails (e.g. maybe it was truly streaming text?)
             logger.warning("Failed to parse response as JSON. Returning raw text.")
             return f"Raw response:\\n{response.text}"

    except Exception as e:
        logger.error(f"Error querying Gemini Enterprise: {e}")
        return f"Error: {str(e)}"
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
      if ((config as any)[key]) {
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

  if (config.enableEmailTool) {
    code += `
import base64
from email.message import EmailMessage
import markdown
import traceback
from googleapiclient.discovery import build
import sys

def send_email(tool_context: ToolContext, to: str, subject: str, body: str) -> str:
    """
    Sends a rich HTML email using the user's Gmail account.
    """
    try:
        credentials = get_user_credentials(tool_context)
        if not credentials:
            return "Error: Authentication required."

        message = EmailMessage()
        message['To'] = to
        message['Subject'] = subject
        message.set_content("This email contains HTML content. Please view it in a compatible client.\\n\\n" + body)

        html_body = markdown.markdown(body, extensions=['extra'])
        html_template = f"""
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px;">
            <div style="max-width: 800px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <style>
                    table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                    th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
                    th {{ background-color: #f8f9fa; font-weight: 600; color: #444; }}
                    tr:hover {{ background-color: #f5f5f5; }}
                    code {{ background-color: #f1f1f1; padding: 2px 5px; border-radius: 3px; font-family: 'Consolas', monospace; }}
                </style>
                {html_body}
                <div style="margin-top: 30px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
                    Sent by GCP Health Agent
                </div>
            </div>
        </div>
        """
        message.add_alternative(html_template, subtype='html')

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service = build('gmail', 'v1', credentials=credentials)
        res = service.users().messages().send(userId="me", body={'raw': encoded_message}).execute()
        return f"Email sent successfully. Message Id: {res['id']}"

    except Exception as e:
        print(f"DEBUG_EMAIL_ERROR: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return f"Error sending email: {type(e).__name__}: {str(e)}"
`;
  }

  if (config.enableSecurityCommandCenterApi) {
    code += `
import google.cloud.securitycenter as securitycenter

def list_active_findings(tool_context: ToolContext, category: Optional[str] = None, project_id: Optional[str] = None) -> str:
    """Lists active, unmuted security findings for the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = securitycenter.SecurityCenterClient(credentials=credential)
        source_name = f"projects/{project_id}/sources/-"
        filter_str = 'state="ACTIVE" AND mute="UNMUTED"'
        if category: filter_str += f' AND category="{category}"'
        req = securitycenter.ListFindingsRequest(parent=source_name, filter=filter_str, page_size=100)
        findings_by_category = {}
        count = 0
        for result in client.list_findings(request=req):
            finding = result.finding
            cat = finding.category
            resource = finding.resource_name
            severity = finding.severity.name if hasattr(finding.severity, 'name') else str(finding.severity)
            if cat not in findings_by_category: findings_by_category[cat] = []
            findings_by_category[cat].append(f"[{severity}] {resource}")
            count += 1
            if count >= 20: break
        if count == 0: return f"No active, unmuted security findings found for project {project_id}."
        output_lines = [f"Active Security Findings for {project_id}:"]
        for cat, items in findings_by_category.items():
            output_lines.append(f"\\nCategory: {cat}")
            for item in items: output_lines.append(f"  - {item}")
        if count >= 20: output_lines.append("\\n(Output truncated)")
        return "\\n".join(output_lines)
    except Exception as e:
        if "PermissionDenied" in str(e) or "disabled" in str(e).lower():
            return f"Unable to list findings. Security Command Center might not be active or you lack permissions for project {project_id}."
        return f"Error fetching security findings: {str(e)}"
`;
  }

  if (config.enableRecommenderApi) {
    code += `
import google.cloud.recommender_v1 as recommender_v1
import google.cloud.run_v2 as run_v2

def list_recommendations(tool_context: ToolContext, project_id: Optional[str] = None) -> str:
    """List active recommendations for Cloud Run services, focusing on security and identity."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        regions = set()
        try:
            run_client = run_v2.ServicesClient(credentials=credential)
            page_result = run_client.list_services(request=run_v2.ListServicesRequest(parent=f"projects/{project_id}/locations/-"))
            for service in page_result:
                parts = service.name.split("/")
                if len(parts) > 3: regions.add(parts[3])
        except Exception: pass
        if not regions: regions.add(os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"))
        recommender_client = recommender_v1.RecommenderClient(credentials=credential)
        recommenders = ["google.run.service.IdentityRecommender", "google.run.service.SecurityRecommender"]
        results = []
        for location in regions:
            for r_id in recommenders:
                try:
                    request = recommender_v1.ListRecommendationsRequest(parent=f"projects/{project_id}/locations/{location}/recommenders/{r_id}")
                    for rec in recommender_client.list_recommendations(request=request):
                        target_resource = "Unknown Resource"
                        if rec.content and rec.content.overview:
                            target_resource = rec.content.overview.get("serviceName") or rec.content.overview.get("service") or rec.content.overview.get("resourceName") or "Unknown Resource"
                        if "/" in target_resource: target_resource = target_resource.split("/")[-1]
                        results.append(f"- [{location}] {target_resource}: {rec.description} (Priority: {rec.priority.name})")
                except Exception: pass
        return "Active Cloud Run Recommendations:\\n" + "\\n".join(results) if results else "No active security or identity recommendations found for Cloud Run."
    except Exception as e:
        return f"Error listing recommendations: {str(e)}"

def list_cost_recommendations(tool_context: ToolContext, project_id: Optional[str] = None) -> str:
    """List active cost recommendations for the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        zones = [f"{location}-{suffix}" for suffix in ["a", "b", "c", "f"]]
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        recommender_client = recommender_v1.RecommenderClient(credentials=credential)
        recommenders = [
            "google.compute.instance.IdleResourceRecommender",
            "google.compute.instance.MachineTypeRecommender",
            "google.compute.address.IdleResourceRecommender",
            "google.compute.disk.IdleResourceRecommender"
        ]
        results = []
        total_savings = 0.0
        currency = "USD"
        for zone in zones:
            for r_id in recommenders:
                try:
                    request = recommender_v1.ListRecommendationsRequest(parent=f"projects/{project_id}/locations/{zone}/recommenders/{r_id}")
                    for rec in recommender_client.list_recommendations(request=request):
                        impact = 0.0
                        if rec.primary_impact.cost_projection.cost.units: impact += float(rec.primary_impact.cost_projection.cost.units)
                        if rec.primary_impact.cost_projection.cost.nanos: impact += float(rec.primary_impact.cost_projection.cost.nanos) / 1e9
                        savings = -impact if impact < 0 else 0
                        if savings > 0:
                            total_savings += savings
                            if rec.primary_impact.cost_projection.cost.currency_code: currency = rec.primary_impact.cost_projection.cost.currency_code
                        target = "Unknown"
                        if rec.content.overview:
                             target = rec.content.overview.get("resourceName") or rec.content.overview.get("resource") or "Unknown"
                        if "/" in target: target = target.split("/")[-1]
                        results.append(f"- [{zone}] {target}: {rec.description} (Est. Savings: {savings:.2f} {currency}/mo)")
                except Exception: pass
        if not results: return f"No active cost recommendations found in {location} zones."
        return f"Active Cost Recommendations (Total Est. Savings: {total_savings:.2f} {currency}/mo):\\n" + "\\n".join(results)
    except Exception as e:
        return f"Error listing cost recommendations: {str(e)}"
`;
  }

  if (config.enableServiceHealthApi) {
    code += `
from google.cloud import servicehealth_v1

def check_service_health(tool_context: ToolContext, project_id: Optional[str] = None) -> str:
    """Checks for active Google Cloud Service Health events affecting the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = servicehealth_v1.ServiceHealthClient(credentials=credential)
        parent = f"projects/{project_id}/locations/global"
        request = servicehealth_v1.ListEventsRequest(parent=parent, filter='state="ACTIVE"')
        results = [f"- [{e.category.name}][{e.state.name}] {e.title}: {e.description} (Updated: {e.update_time})" for e in client.list_events(request=request)]
        return f"Active Service Health Events for {project_id}:\\n" + "\\n".join(results) if results else f"No active service health events found for project {project_id}."
    except Exception as e:
        return f"Error checking service health: {str(e)}"
`;
  }

  if (config.enableNetworkManagementApi) {
    code += `
from google.cloud import network_management_v1

def run_connectivity_test(tool_context: ToolContext, source_ip: Optional[str] = None, source_network: Optional[str] = None, destination_ip: Optional[str] = None, destination_port: Optional[int] = None, protocol: str = "TCP", project_id: Optional[str] = None) -> str:
    """Runs a network connectivity test."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = network_management_v1.ReachabilityServiceClient(credentials=credential)
        parent = f"projects/{project_id}/locations/global"

        endpoint_source = network_management_v1.Endpoint()
        if source_ip: endpoint_source.ip_address = source_ip
        if source_network: endpoint_source.network = source_network

        endpoint_destination = network_management_v1.Endpoint()
        if destination_ip: endpoint_destination.ip_address = destination_ip
        if destination_port: endpoint_destination.port = destination_port

        connectivity_test = network_management_v1.ConnectivityTest(
            source=endpoint_source,
            destination=endpoint_destination,
            protocol=protocol
        )

        request = network_management_v1.CreateConnectivityTestRequest(
            parent=parent,
            test_id="adk-temp-test",
            connectivity_test=connectivity_test
        )
        # Note: Proper implementation requires polling the LRO, skipping full implementation for brevity.
        return "Not fully implemented in template."
    except Exception as e:
        return f"Error running connectivity test: {str(e)}"
`;
  }

  if (config.enableCloudLoggingApi) {
    code += `
import google.cloud.logging as cloud_logging

def search_logs(tool_context: ToolContext, filter_str: str, project_id: Optional[str] = None) -> str:
    """
    Search GCP Cloud Logs using a filter string.

    Args:
        filter_str: simplified or advanced log filter string.
                    e.g. 'severity>=ERROR', 'resource.type="cloud_run_revision"'

    Returns:
        A string summary of the found logs (max 20 entries to avoid context overflow),
        or a message indicating no logs were found.
    """
    try:
        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        if project_id:
            client = cloud_logging.Client(credentials=credential, project=project_id)
        else:
            client = cloud_logging.Client(credentials=credential)

        entries = client.list_entries(
            filter_=filter_str,
            order_by=cloud_logging.DESCENDING,
            max_results=20
        )

        results = []
        for entry in entries:
            timestamp = entry.timestamp.isoformat() if entry.timestamp else "N/A"
            severity = entry.severity or "DEFAULT"
            payload = entry.payload

            if isinstance(payload, dict):
                message = payload.get('message') or payload.get('textPayload') or str(payload)
            else:
                message = str(payload)

            results.append(f"[{timestamp}] [{severity}] {message}")

        if not results:
            return "No logs found matching the filter."

        return "Found recent logs:\\n" + "\\n".join(results)

    except Exception as e:
        return f"Error querying logs: {str(e)}"
`;
  }

  if (config.enableCloudMonitoringApi) {
    code += `
import time
import google.cloud.monitoring_v3 as monitoring_v3

def check_health(tool_context: ToolContext, project_id: Optional[str] = None) -> str:
    """
    Checks the health of applications in the GCP project by listing alert policies.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = monitoring_v3.AlertPolicyServiceClient(credentials=credential)
        policies = client.list_alert_policies(request={"name": f"projects/{project_id}"})

        active_policies = [f"- {p.display_name} (Enabled)" for p in policies if p.enabled]
        return f"Alert Policies:\\n" + "\\n".join(active_policies) if active_policies else "No enabled alert policies."
    except Exception as e:
        return f"Error checking health: {str(e)}"

def get_service_metrics(tool_context: ToolContext, service_name: str, metric_type: str = "cpu", duration_minutes: int = 60, project_id: Optional[str] = None) -> str:
    """
    Retrieves metrics for a specific Cloud Run service.

    Args:
        service_name: Name of the Cloud Run service.
        metric_type: 'cpu', 'memory', 'latency', or 'requests'.
        duration_minutes: Lookback period in minutes.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = monitoring_v3.MetricServiceClient(credentials=credential)

        metrics_map = {
            "cpu": "run.googleapis.com/container/cpu/utilizations",
            "memory": "run.googleapis.com/container/memory/utilizations",
            "latency": "run.googleapis.com/request_latencies",
            "requests": "run.googleapis.com/request_count"
        }

        if metric_type not in metrics_map:
            return f"Error: Unknown metric {metric_type}"

        now = time.time()
        interval = monitoring_v3.TimeInterval({
            "end_time": {"seconds": int(now)},
            "start_time": {"seconds": int(now) - (duration_minutes * 60)},
        })

        filter_str = f'metric.type = "{metrics_map[metric_type]}" AND resource.labels.service_name = "{service_name}"'

        if metric_type in ["latency", "cpu", "memory"]:
            aggregation = monitoring_v3.Aggregation({
                "alignment_period": {"seconds": duration_minutes * 60},
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_PERCENTILE_99,
                "cross_series_reducer": monitoring_v3.Aggregation.Reducer.REDUCE_MEAN
            })
        elif metric_type == "requests":
            aggregation = monitoring_v3.Aggregation({
                "alignment_period": {"seconds": duration_minutes * 60},
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_SUM,
                "cross_series_reducer": monitoring_v3.Aggregation.Reducer.REDUCE_SUM
            })
        else:
            aggregation = monitoring_v3.Aggregation({
                "alignment_period": {"seconds": duration_minutes * 60},
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_MEAN,
                "cross_series_reducer": monitoring_v3.Aggregation.Reducer.REDUCE_MEAN
            })

        results = []
        page_result = client.list_time_series(request={
            "name": f"projects/{project_id}",
            "filter": filter_str,
            "interval": interval,
            "aggregation": aggregation
        })

        for ts in page_result:
            for point in ts.points:
                val = point.value
                val_str = f"{val.double_value:.4f}" if val.double_value else f"{val.int64_value}"
                results.append(f"Metric: {metric_type.upper()}, Value: {val_str}")
                break

        return f"Metrics for {service_name}:\\n" + "\\n".join(results) if results else "No data found."
    except Exception as e:
        return f"Error getting service metrics: {e}"
`;
  }

  if (config.enableCloudRunApi) {
    code += `
import google.cloud.run_v2 as run_v2

def list_services(tool_context: ToolContext, project_id: Optional[str] = None) -> str:
    """
    List Cloud Run services in the configured project across ALL regions.

    Returns:
        A string summary of the Cloud Run services found, including their status and URL.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

        if not project_id:
            return "Error: GOOGLE_CLOUD_PROJECT not set."

        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = run_v2.ServicesClient(credentials=credential)
        parent = f"projects/{project_id}/locations/-"

        request = run_v2.ListServicesRequest(parent=parent)
        page_result = client.list_services(request=request)

        services = []
        for service in page_result:
            conditions = {c.type_: c.state for c in service.conditions}
            succeeded = run_v2.Condition.State.CONDITION_SUCCEEDED

            is_ready = False
            if "Ready" in conditions:
                is_ready = (conditions["Ready"] == succeeded)
            elif "RoutesReady" in conditions and "ConfigurationsReady" in conditions:
                is_ready = (conditions["RoutesReady"] == succeeded and
                           conditions["ConfigurationsReady"] == succeeded)

            status = "Ready" if is_ready else "Not Ready"

            region = service.name.split('/')[3]
            service_name = service.name.split('/')[-1]
            services.append(f"- {service_name} ({region}): {status} ({service.uri})")

        if not services:
            return "No Cloud Run services found."

        return "Cloud Run Services:\\n" + "\\n".join(services)

    except Exception as e:
        return f"Error listing Cloud Run services: {str(e)}"
`;
  }

  if (config.enableResourceManagerApi) {
    code += `
import google.cloud.resourcemanager_v3 as resourcemanager_v3

def list_projects(tool_context: ToolContext, filter: str = "lifecycleState:ACTIVE") -> str:
    """
    List accessible Google Cloud projects.

    Args:
        filter: Filter string to query projects (default: "lifecycleState:ACTIVE").

    Returns:
        A list of "Project Name (ID)" found.
    """
    try:
        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = resourcemanager_v3.ProjectsClient(credentials=credential)
        request = resourcemanager_v3.SearchProjectsRequest(query=filter)
        page_result = client.search_projects(request=request)

        projects = []
        for project in page_result:
            projects.append(f"- {project.display_name} ({project.project_id})")

        if not projects:
            return "No projects found."

        return "Projects:\\n" + "\\n".join(projects)
    except Exception as e:
        return f"Error listing projects: {str(e)}"

def resolve_project_id(tool_context: ToolContext, name_or_id: str) -> str:
    """
    Resolves a Project Name or ID to a Project ID.
    """
    if " " in name_or_id or any(c.isupper() for c in name_or_id):
        try:
            credential = get_user_credentials(tool_context)
            if not credential:
                return "Error: Authentication required."

            client = resourcemanager_v3.ProjectsClient(credentials=credential)
            request = resourcemanager_v3.SearchProjectsRequest(query=f"lifecycleState:ACTIVE AND displayName='{name_or_id}'")
            page_result = client.search_projects(request=request)

            for project in page_result:
                return project.project_id

            return f"Error: No project found with display name '{name_or_id}'"
        except Exception as e:
            return f"Error resolving project: {str(e)}"

    return name_or_id
`;
  }

  if (config.enableAdminActivityApi) {
    code += `
from datetime import datetime, timedelta, timezone
from google.cloud import logging_v2

def list_recent_changes(tool_context: ToolContext, project_id: Optional[str] = None, hours_ago: int = 24) -> str:
    """
    Lists recent Admin Activity (system changes) for the project.
    Queries Cloud Logging for 'cloudaudit.googleapis.com%2Factivity' logs.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

        if not project_id:
            return "Error: GOOGLE_CLOUD_PROJECT not set."

        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required."

        client = logging_v2.Client(credentials=credential, project=project_id)

        start_time = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()

        log_filter = (
            f'logName="projects/{project_id}/logs/cloudaudit.googleapis.com%2Factivity" '
            f'AND timestamp >= "{start_time}" '
            f'AND severity >= NOTICE'
        )

        results = []
        for entry in client.list_entries(filter_=log_filter, order_by="timestamp desc", page_size=50, max_results=50):
            payload = None
            try:
                if hasattr(entry, 'payload') and entry.payload:
                    payload = entry.payload
                elif hasattr(entry, 'proto_payload') and entry.proto_payload:
                    try:
                        from google.protobuf.json_format import MessageToDict
                        payload = MessageToDict(entry.proto_payload)
                    except Exception as parse_e:
                        payload = entry.proto_payload

                if not payload or not isinstance(payload, dict):
                    try:
                        api_repr = entry.to_api_repr()
                        payload = api_repr.get("jsonPayload") or api_repr.get("protoPayload")
                    except:
                        pass

                if not payload:
                    continue

            except Exception as inner_e:
                results.append(f"[ERROR processing entry] {str(inner_e)}")
                continue

            if not payload:
                continue

            method_name = "UnknownMethod"
            principal = "UnknownUser"
            resource_name = "UnknownResource"

            if hasattr(payload, "get"):
                method_name = payload.get("methodName", "UnknownMethod")
                auth_info = payload.get("authenticationInfo", {})
                if "principalEmail" in auth_info:
                    principal = auth_info["principalEmail"]
                if "resourceName" in payload:
                    resource_name = payload["resourceName"]
            else:
                method_name = getattr(payload, "methodName", "UnknownMethod")
                auth_info = getattr(payload, "authenticationInfo", None)
                if auth_info and hasattr(auth_info, "principalEmail"):
                    principal = auth_info.principalEmail
                if hasattr(payload, "resourceName"):
                    resource_name = payload.resourceName

            if resource_name == "UnknownResource" and entry.resource and entry.resource.labels:
                 resource_name = str(entry.resource.labels)

            timestamp = entry.timestamp.isoformat() if entry.timestamp else "UnknownTime"
            severity = entry.severity if entry.severity else "UNKNOWN"

            results.append(f"[{timestamp}] [{severity}] {principal} called {method_name} on {resource_name}")

        if not results:
            return f"No significant Admin Activity changes found in the past {hours_ago} hours for project {project_id}."

        return f"Recent System Changes (Admin Activity) for {project_id} (Past {hours_ago}h):\\n" + "\\n".join(results)

    except Exception as e:
        import traceback
        import sys
        err_msg = f"DEBUG_ERROR: {type(e).__name__}: {str(e)} | TRACE: {traceback.format_exc()}"
        print(err_msg, file=sys.stderr)
        return err_msg
`;
  }

  if (config.enableDatabaseFleetApi) {
    code += `
from googleapiclient import discovery

def check_database_fleet_health(tool_context: ToolContext, project_id: Optional[str] = None) -> str:
    """
    Checks the health of Cloud SQL, Spanner, and Firestore instances in the project.
    """
    if not project_id:
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

    if not project_id:
        return "Error: GOOGLE_CLOUD_PROJECT not set."

    credential = get_user_credentials(tool_context)
    if not credential:
        return "Error: Authentication required. Access token not available."

    reports = []

    try:
        sql_service = discovery.build('sqladmin', 'v1', credentials=credential)
        request = sql_service.instances().list(project=project_id)
        response = request.execute()

        instances = response.get('items', [])
        if instances:
            reports.append("\\nCloud SQL Instances:")
            for instance in instances:
                state = instance.get('state', 'UNKNOWN')
                db_version = instance.get('databaseVersion', 'UNKNOWN')
                region = instance.get('region', 'UNKNOWN')
                name = instance.get('name', 'UNKNOWN')
                reports.append(f"- {name} ({region}, {db_version}): {state}")
        else:
            reports.append("\\nCloud SQL: No instances found.")

    except Exception as e:
        reports.append(f"\\nCloud SQL Error: {str(e)}")

    try:
        spanner_service = discovery.build('spanner', 'v1', credentials=credential)
        parent = f"projects/{project_id}"
        request = spanner_service.projects().instances().list(parent=parent)
        response = request.execute()

        instances = response.get('instances', [])
        if instances:
            reports.append("\\nSpanner Instances:")
            for instance in instances:
                name = instance.get('displayName', instance.get('name').split('/')[-1])
                state = instance.get('state', 'UNKNOWN')
                node_count = instance.get('nodeCount', 0)
                processing_units = instance.get('processingUnits', 0)
                config = instance.get('config', '').split('/')[-1]

                capacity = f"{node_count} Nodes" if node_count else f"{processing_units} PUs"
                reports.append(f"- {name} ({config}, {capacity}): {state}")
        else:
             reports.append("\\nSpanner: No instances found.")

    except Exception as e:
        reports.append(f"\\nSpanner Error: {str(e)}")

    try:
        firestore_service = discovery.build('firestore', 'v1', credentials=credential)
        parent = f"projects/{project_id}"
        request = firestore_service.projects().databases().list(parent=parent)
        response = request.execute()

        databases = response.get('databases', [])
        if databases:
            reports.append("\\nFirestore Databases:")
            for db in databases:
                db_id = db.get('name', '').split('/')[-1]
                location = db.get('locationId', 'UNKNOWN')
                db_type = db.get('type', 'FIRESTORE_NATIVE')
                reports.append(f"- {db_id} ({location}): {db_type}")
        else:
            reports.append("\\nFirestore: No databases found.")

    except Exception as e:
        reports.append(f"\\nFirestore Error: {str(e)}")

    return "\\n".join(reports)
`;
  }

  if (config.enableCloudAssistApi) {
    code += `
import requests
import json
from google.auth.transport.requests import Request as GoogleAuthRequest

def investigate_with_cloud_assist(tool_context: ToolContext, query: str, project_id: Optional[str] = None) -> str:
    """Invokes the Gemini Cloud Assist API to perform a deep investigation of a Google Cloud issue.

    Args:
        query: A detailed description of the issue or the question to ask Cloud Assist.
        project_id: The Google Cloud project ID to investigate.
    """
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."

        # Ensure credential is valid
        if not credential.valid:
            if credential.expired and credential.refresh_token:
                credential.refresh(GoogleAuthRequest())
            else:
                return "Error: Could not refresh token."

        token = credential.token

        url = f"https://geminicloudassist.googleapis.com/v1alpha/projects/{project_id}/locations/global/investigations"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # The API requires an empty body or a title to create the investigation
        payload = {
            "title": query[:250] if query else "Automated Investigation"
        }

        response = requests.post(url, headers=headers, json=payload)

        if response.status_code == 200:
            data = response.json()
            inv_name = data.get('name')
            return f"Successfully created Gemini Cloud Assist Investigation.\\nInvestigation Resource Name: {inv_name}\\n\\nNote: The Cloud Assist API is asynchronous. You may need to use the Google Cloud Console to view the full interactive console for this investigation ID."
        else:
            return f"Failed to create Cloud Assist Investigation. Status: {response.status_code}, Response: {response.text}"

    except Exception as e:
        return f"Error invoking Gemini Cloud Assist: {str(e)}"
`;
  }

  if (config.enableGraphvizRendering) {
    code += `
import os
import time
import asyncio
import urllib.request
import json
${toolContextImport}
from typing import Any

async def render_graphviz(dot_code: str, tool_context: ToolContext) -> str:
    """
    Locally renders Graphviz .dot syntax into a PNG image.
    Bypasses remote execution sandboxes to utilize the host container's local graphviz installation.
    Pass the raw .dot code block string into 'dot_code'.
    
    Returns the formatted Markdown image data URI or storage notification.
    """
    try:
        # Clean the input if the LLM wrapped it in markdown code blocks
        if dot_code.startswith('\`\`\`dot'):
            dot_code = dot_code[6:]
        if dot_code.startswith('\`\`\`'):
            dot_code = dot_code[3:]
        if dot_code.endswith('\`\`\`'):
            dot_code = dot_code[:-3]
            
        dot_code = dot_code.strip()
        
        import base64
        import graphviz
        
        def _render_local():
            src = graphviz.Source(dot_code, format='png')
            return src.pipe()
            
        # Process rendering in a separate thread so we don't block the async loop
        png_data = await asyncio.to_thread(_render_local)
        
        import uuid
        bucket_name = os.getenv("STAGING_BUCKET", "").replace("gs://", "").split("/")[0]
        
        b64_string = base64.b64encode(png_data).decode("utf-8")
        image_markdown = f"![Architecture Diagram](data:image/png;base64,{b64_string})"
        
        if bucket_name:
            try:
                from google.cloud import storage
                client = storage.Client()
                bucket = client.bucket(bucket_name)
                blob_name = f"graphs/graph_{uuid.uuid4().hex[:8]}.png"
                blob = bucket.blob(blob_name)
                blob.upload_from_string(png_data, content_type='image/png')
                gcs_uri = f"gs://{bucket_name}/{blob_name}"
                return f"Successfully generated graph (saved to {gcs_uri})! Respond with this exact string: \\n\\n{image_markdown}"
            except Exception as upload_err:
                logger.warning(f"Could not persist diagram to GCS: {upload_err}")
                return f"Successfully generated graph! Respond with this exact string: \\n\\n{image_markdown}"
                
        return f"Successfully generated graph! Respond to the user with this exact string: \\n\\n{image_markdown}"
        
    except FileNotFoundError:
        return "Error: The 'dot' executable was not found on the system. Ensure the 'graphviz' system package is installed."
    except Exception as e:
        return f"Error rendering Graphviz: {str(e)}"
`;
  }

  return code;
};

