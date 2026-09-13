import { AdkAgentConfig } from "../types";

export const generateCloudApiTools = (config: AdkAgentConfig): string => {
  const isV2 = config.adkVersion === "2.2";
  const toolContextImport = isV2
    ? "from google.antigravity import ToolContext"
    : "from google.adk.tools import ToolContext";
  let code = "";
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
