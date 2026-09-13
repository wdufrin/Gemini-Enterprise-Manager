import { AdkAgentConfig } from "../types";

export const generateDiscoveryTools = (config: AdkAgentConfig): string => {
  let code = "";
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
  return code;
};
