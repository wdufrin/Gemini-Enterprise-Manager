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

import { AdkAgentConfig } from './types';

export const generateAuthPy = (
  config: AdkAgentConfig,
  allowAdcFallback?: boolean,
): string => {
  const effectiveAllowAdcFallback = allowAdcFallback !== undefined ? allowAdcFallback : (config.allowAdcFallback ?? false);
  const isV2 = config.adkVersion === "2.2";
  const toolContextImport = isV2
    ? "from google.antigravity import ToolContext"
    : "from google.adk.tools import ToolContext";

  return `"""
Authentication module for Google Agent Development Kit (ADK) tools
running within Gemini Enterprise environments.

Provides request-scoped OAuth2 credential extraction with strict
multi-tenant isolation, defense-in-depth token validation, and clean
exception hierarchy.
"""

import os
import logging
from typing import Any, Optional
from google.oauth2.credentials import Credentials
${toolContextImport}


logger = logging.getLogger(__name__)


class AuthenticationError(Exception):
    """Base exception for agent tool authentication failures."""
    pass


class MissingCredentialsError(AuthenticationError):
    """Raised when no valid end-user OAuth token is present in context."""
    pass


class InvalidTokenError(AuthenticationError):
    """Raised when a retrieved token fails structural or type validation."""
    pass


def _is_valid_token_string(token: Any) -> bool:
    """Verifies that a token object is a non-empty, stripped string."""
    return bool(token and isinstance(token, str) and token.strip())


def get_user_credentials(
    tool_context: ToolContext,
    allow_local_dev_fallback: bool = False,
    raise_on_missing: bool = False,
) -> Optional[Credentials]:
    """
    Extracts user OAuth2 credentials from the ADK ToolContext.

    Identity Resolution Order:
    1. Direct tool_context.user_token attribute (First-class ADK property).
    2. Request-scoped agent_association state payload (Gemini Enterprise platform).
    3. Request-scoped AUTH_ID state key resolution (temp:{auth_id}, token_{auth_id}, auth_id).
    4. [Optional] Controlled local development environment fallback (Strictly gated).
    ${effectiveAllowAdcFallback ? "5. [Optional] Application Default Credentials (ADC) service account fallback." : "5. Service Account (ADC) fallback is intentionally disabled for zero-trust security."}

    Args:
        tool_context: The execution context provided to the ADK tool call.
        allow_local_dev_fallback: If True and ADK_ENV == "local", permits
            reading local testing environment variables. Default False.
        raise_on_missing: If True, raises MissingCredentialsError when no valid
            token is found instead of returning None. Default False.

    Returns:
        Optional[google.oauth2.credentials.Credentials]: Valid user OAuth2 credentials or None.

    Raises:
        MissingCredentialsError: If raise_on_missing is True and no token is found.
    """
    # 1. Primary: Check first-class ADK ToolContext user_token property
    user_token = getattr(tool_context, "user_token", None)
    if _is_valid_token_string(user_token):
        logger.debug("Retrieved OAuth token via ToolContext.user_token attribute.")
        return Credentials(token=user_token)

    # 2. Platform State Extraction (Request-Scoped Multi-Tenant Isolation)
    access_token: Optional[str] = None
    auth_id = os.getenv("AUTH_ID")

    if tool_context.state and isinstance(tool_context.state, dict):
        # 2a. Check agent_association dictionary schema
        agent_assoc = tool_context.state.get("agent_association")
        if isinstance(agent_assoc, dict):
            candidate = agent_assoc.get("access_token") or agent_assoc.get("token")
            if _is_valid_token_string(candidate):
                logger.debug("Retrieved OAuth token via agent_association state payload.")
                access_token = str(candidate)

        # 2b. Check fallback AUTH_ID key patterns in request state
        if not access_token and auth_id:
            possible_keys = (f"temp:{auth_id}", f"token_{auth_id}", auth_id)
            for key in possible_keys:
                candidate = tool_context.state.get(key)
                if _is_valid_token_string(candidate):
                    logger.debug("Retrieved OAuth token via dynamic auth_id state lookup.")
                    access_token = str(candidate)
                    break

    if access_token:
        return Credentials(token=access_token)

    # 3. Controlled Local Development Fallback (Disabled in Production)
    # Strictly requires explicit flag AND ADK_ENV=local to eliminate cross-tenant risks
    if allow_local_dev_fallback and os.getenv("ADK_ENV") == "local":
        local_token = os.getenv("GCP_ACCESS_TOKEN") or os.getenv("USER_ACCESS_TOKEN")
        if not local_token and auth_id:
            local_token = os.getenv(auth_id)
        if _is_valid_token_string(local_token):
            logger.warning("USING LOCAL DEV FALLBACK TOKEN. Do not run this mode in production.")
            return Credentials(token=str(local_token))

${effectiveAllowAdcFallback
      ? `    # 4. Fallback to Application Default Credentials (ADC)
    try:
        import google.auth
        from google.auth.transport.requests import Request
        creds, project = google.auth.default()
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        elif not creds.token:
            creds.refresh(Request())
        logger.info("Using Application Default Credentials (ADC) as fallback")
        return creds
    except Exception as e:
        logger.warning(f"Failed to get ADC fallback: {e}")
        if raise_on_missing:
            raise MissingCredentialsError(f"Failed to obtain ADC credentials: {e}")
        return None`
      : `    # 4. Strict End-User Authentication (ADC Disabled)
    if raise_on_missing:
        logger.warning("End-user OAuth token missing in ToolContext state. Access denied.")
        raise MissingCredentialsError(
            "Access Denied: No valid end-user OAuth token found in ToolContext. "
            "Service Account (ADC) fallback is intentionally disabled."
        )
    logger.debug("No valid end-user OAuth token found in ToolContext state.")
    return None`}


def require_user_credentials(
    tool_context: ToolContext,
    allow_local_dev_fallback: bool = False
) -> Credentials:
    """
    Extracts user OAuth2 credentials from ToolContext or raises MissingCredentialsError.
    Guarantees returning a non-None Credentials object.
    """
    creds = get_user_credentials(tool_context, allow_local_dev_fallback=allow_local_dev_fallback, raise_on_missing=True)
    if not creds:
        raise MissingCredentialsError(
            "Access Denied: No valid end-user OAuth token found in ToolContext."
        )
    return creds
`;
};

export const generateToolOAuthSnippet = (authId: string): string => {
  return `# ==============================================================================
# Gemini Enterprise ADK End-User OAuth Delegation Blueprint
# Auth ID: ${authId}
# ==============================================================================

import os
import logging
from typing import Optional, Dict, Any
from google.oauth2.credentials import Credentials
from google.adk.tools import ToolContext, tool

logger = logging.getLogger(__name__)


class AuthenticationError(Exception):
    """Base exception for agent tool authentication failures."""
    pass


class MissingCredentialsError(AuthenticationError):
    """Raised when no valid end-user OAuth token is present in context."""
    pass


def _is_valid_token_string(token: Any) -> bool:
    """Verifies that a token object is a non-empty, stripped string."""
    return bool(token and isinstance(token, str) and token.strip())


def get_user_credentials(
    tool_context: ToolContext,
    allow_local_dev_fallback: bool = False,
    raise_on_missing: bool = False,
) -> Optional[Credentials]:
    """
    Extracts delegated user OAuth2 credentials from ToolContext state.
    Supports direct user_token, agent_association dictionary, and temp:{auth_id}.
    """
    # 1. Direct user_token (ADK 1.35+ and 2.x)
    user_token = getattr(tool_context, "user_token", None)
    if _is_valid_token_string(user_token):
        logger.debug("Retrieved OAuth token via user_token attribute.")
        return Credentials(token=user_token)

    auth_id = os.getenv("AUTH_ID", "${authId}")
    if tool_context.state and isinstance(tool_context.state, dict):
        # 2. agent_association platform context
        assoc = tool_context.state.get("agent_association")
        if isinstance(assoc, dict):
            tok = assoc.get("access_token") or assoc.get("token")
            if _is_valid_token_string(tok):
                logger.debug("Retrieved OAuth token via agent_association payload.")
                return Credentials(token=str(tok))

        # 3. Key variations (Discovery Engine / Agent Space)
        for key in (f"temp:{auth_id}", f"token_{auth_id}", auth_id):
            tok = tool_context.state.get(key)
            if _is_valid_token_string(tok):
                logger.debug("Retrieved OAuth token via key lookup.")
                return Credentials(token=str(tok))

    # 4. Strictly gated local development fallback (never active in production)
    if allow_local_dev_fallback and os.getenv("ADK_ENV") == "local":
        local_tok = os.getenv("GCP_ACCESS_TOKEN") or os.getenv("USER_ACCESS_TOKEN") or os.getenv(auth_id)
        if _is_valid_token_string(local_tok):
            logger.warning("USING LOCAL DEV FALLBACK TOKEN. Do not run this mode in production.")
            return Credentials(token=str(local_tok))

    if raise_on_missing:
        raise MissingCredentialsError("Access Denied: No valid end-user OAuth token available for ${authId}.")

    return None


@tool
def call_authorized_api(tool_context: ToolContext, endpoint_path: str) -> Dict[str, Any]:
    """
    Calls a downstream API on behalf of the user using their delegated OAuth credentials.
    """
    creds = get_user_credentials(tool_context, raise_on_missing=True)

    import requests
    headers = {
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json"
    }
    # Example: response = requests.get(f"https://api.example.com/{endpoint_path}", headers=headers)
    return {
        "status": "success",
        "auth_id": "${authId}",
        "endpoint": endpoint_path,
        "message": "Successfully authenticated request with delegated credentials."
    }
`;
};
