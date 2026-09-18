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
  const toolContextImport = "from google.adk.tools import ToolContext";

  return `"""
Authentication module for Google Agent Development Kit (ADK) tools
running within Gemini Enterprise environments.

Provides request-scoped OAuth2 credential extraction with strict
multi-tenant isolation, defense-in-depth token validation, and clean
exception hierarchy.
"""

import os
import json
import logging
from typing import Any, Optional
from collections.abc import Mapping
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


def _extract_token_from_object(obj: Any) -> Optional[str]:
    """Helper to safely extract a bearer/OAuth access token string from diverse container types."""
    if not obj:
        return None
    if isinstance(obj, str) and obj.strip():
        trimmed = obj.strip()
        if trimmed.startswith("{") and trimmed.endswith("}"):
            try:
                parsed = json.loads(trimmed)
                return _extract_token_from_object(parsed)
            except Exception:
                pass
        return trimmed
    if isinstance(obj, Mapping):
        for key in ("access_token", "token", "bearer_token", "credential", "auth_token"):
            val = obj.get(key)
            extracted = _extract_token_from_object(val)
            if extracted:
                return extracted
        return None
    for attr in ("token", "access_token", "api_key", "credentials"):
        if hasattr(obj, attr):
            extracted = _extract_token_from_object(getattr(obj, attr))
            if extracted:
                return extracted
    if hasattr(obj, "http") and getattr(obj, "http", None):
        extracted = _extract_token_from_object(getattr(obj, "http"))
        if extracted:
            return extracted
    if hasattr(obj, "oauth2") and getattr(obj, "oauth2", None):
        extracted = _extract_token_from_object(getattr(obj, "oauth2"))
        if extracted:
            return extracted
    return None


def get_user_credentials(
    tool_context: ToolContext,
    allow_local_dev_fallback: bool = False,
    raise_on_missing: bool = False,
) -> Optional[Credentials]:
    """
    Extracts user OAuth2 credentials from the ADK ToolContext or ReadonlyContext.

    Identity Resolution Order:
    1. Direct tool_context.user_token attribute (First-class ADK property).
    2. First-class get_credential API on ToolContext / ReadonlyContext.
    3. Request-scoped agent_association state payload (Gemini Enterprise platform).
    4. Request-scoped AUTH_ID state key resolution (temp:{auth_id}, token_{auth_id}, auth_id).
    5. Context underlying _invocation_context credential store.
    6. [Optional] Controlled local development environment fallback (Strictly gated).
    ${effectiveAllowAdcFallback ? "7. [Optional] Application Default Credentials (ADC) service account fallback." : "7. Service Account (ADC) fallback is intentionally disabled for zero-trust security."}

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
    extracted_user_token = _extract_token_from_object(user_token)
    if extracted_user_token:
        logger.debug("Retrieved OAuth token via ToolContext.user_token attribute.")
        return Credentials(token=extracted_user_token)

    auth_id = os.getenv("AUTH_ID")

    # 2. Check first-class get_credential API (ReadonlyContext / InvocationContext)
    if hasattr(tool_context, "get_credential") and callable(tool_context.get_credential):
        keys_to_check = []
        if auth_id:
            keys_to_check.extend([auth_id, f"temp:{auth_id}", f"token_{auth_id}"])
        for k in keys_to_check:
            try:
                cred_obj = tool_context.get_credential(k)
                tok = _extract_token_from_object(cred_obj)
                if tok:
                    logger.debug(f"Retrieved OAuth token via ToolContext.get_credential('{k}').")
                    return Credentials(token=tok)
            except Exception:
                pass

    # 3. Platform State Extraction (Supports MappingProxyType, dict, and custom Mappings)
    state = getattr(tool_context, "state", None)
    if state is not None and hasattr(state, "get"):
        # 3a. Check agent_association dictionary / string payload
        agent_assoc = state.get("agent_association")
        tok = _extract_token_from_object(agent_assoc)
        if tok:
            logger.debug("Retrieved OAuth token via agent_association state payload.")
            return Credentials(token=tok)

        # 3b. Check container keys: authorizations, credentials, user_credentials
        for container_key in ("authorizations", "credentials", "user_credentials"):
            container = state.get(container_key)
            tok = _extract_token_from_object(container)
            if tok:
                logger.debug(f"Retrieved OAuth token via '{container_key}' state payload.")
                return Credentials(token=tok)

        # 3c. Check specific AUTH_ID key patterns in request state
        if auth_id:
            possible_keys = (auth_id, f"temp:{auth_id}", f"token_{auth_id}")
            for key in possible_keys:
                candidate = state.get(key)
                tok = _extract_token_from_object(candidate)
                if tok:
                    logger.debug(f"Retrieved OAuth token via dynamic auth_id state lookup '{key}'.")
                    return Credentials(token=tok)

    # 4. Check underlying _invocation_context credential_by_key mapping
    inv_ctx = getattr(tool_context, "_invocation_context", None)
    if inv_ctx and hasattr(inv_ctx, "credential_by_key"):
        cred_by_key = getattr(inv_ctx, "credential_by_key")
        if isinstance(cred_by_key, Mapping) and auth_id and auth_id in cred_by_key:
            tok = _extract_token_from_object(cred_by_key[auth_id])
            if tok:
                logger.debug(f"Retrieved OAuth token via _invocation_context.credential_by_key['{auth_id}'].")
                return Credentials(token=tok)

    # 5. Controlled Local Development Fallback (Disabled in Production)
    # Strictly requires explicit flag AND ADK_ENV=local to eliminate cross-tenant risks
    if allow_local_dev_fallback and os.getenv("ADK_ENV") == "local":
        local_token = os.getenv("GCP_ACCESS_TOKEN") or os.getenv("USER_ACCESS_TOKEN")
        if not local_token and auth_id:
            local_token = os.getenv(auth_id)
        tok = _extract_token_from_object(local_token)
        if tok:
            logger.warning("USING LOCAL DEV FALLBACK TOKEN. Do not run this mode in production.")
            return Credentials(token=tok)

${effectiveAllowAdcFallback
      ? `    # 6. Fallback to Application Default Credentials (ADC)
    try:
        import google.auth
        from google.auth.transport.requests import Request
        creds, project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        if not creds.valid:
            creds.refresh(Request())
        logger.info("Using Application Default Credentials (ADC) as fallback")
        return creds
    except Exception as e:
        logger.warning(f"Failed to get ADC fallback: {e}")
        if raise_on_missing:
            raise MissingCredentialsError(f"Failed to obtain ADC credentials: {e}")
        return None`
      : `    # 6. Strict End-User Authentication (ADC Disabled)
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
import json
import logging
from typing import Optional, Dict, Any
from collections.abc import Mapping
from google.oauth2.credentials import Credentials
from google.adk.tools import ToolContext

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


def _extract_token_from_object(obj: Any) -> Optional[str]:
    """Helper to safely extract a bearer/OAuth access token string from diverse container types."""
    if not obj:
        return None
    if isinstance(obj, str) and obj.strip():
        trimmed = obj.strip()
        if trimmed.startswith("{") and trimmed.endswith("}"):
            try:
                parsed = json.loads(trimmed)
                return _extract_token_from_object(parsed)
            except Exception:
                pass
        return trimmed
    if isinstance(obj, Mapping):
        for key in ("access_token", "token", "bearer_token", "credential", "auth_token"):
            val = obj.get(key)
            extracted = _extract_token_from_object(val)
            if extracted:
                return extracted
        return None
    for attr in ("token", "access_token", "api_key", "credentials"):
        if hasattr(obj, attr):
            extracted = _extract_token_from_object(getattr(obj, attr))
            if extracted:
                return extracted
    if hasattr(obj, "http") and getattr(obj, "http", None):
        extracted = _extract_token_from_object(getattr(obj, "http"))
        if extracted:
            return extracted
    if hasattr(obj, "oauth2") and getattr(obj, "oauth2", None):
        extracted = _extract_token_from_object(getattr(obj, "oauth2"))
        if extracted:
            return extracted
    return None


def get_user_credentials(
    tool_context: ToolContext,
    allow_local_dev_fallback: bool = False,
    raise_on_missing: bool = False,
) -> Optional[Credentials]:
    """
    Extracts delegated user OAuth2 credentials from ToolContext state.
    Supports direct user_token, get_credential, agent_association, and temp:{auth_id}.
    """
    # 1. Direct user_token (ADK 1.35+ and 2.x)
    user_token = getattr(tool_context, "user_token", None)
    tok = _extract_token_from_object(user_token)
    if tok:
        logger.debug("Retrieved OAuth token via user_token attribute.")
        return Credentials(token=tok)

    auth_id = os.getenv("AUTH_ID", "${authId}")

    # 2. Check get_credential method
    if hasattr(tool_context, "get_credential") and callable(tool_context.get_credential):
        for k in (auth_id, f"temp:{auth_id}", f"token_{auth_id}"):
            try:
                cred_obj = tool_context.get_credential(k)
                tok = _extract_token_from_object(cred_obj)
                if tok:
                    logger.debug(f"Retrieved OAuth token via get_credential('{k}').")
                    return Credentials(token=tok)
            except Exception:
                pass

    # 3. Platform state extraction (MappingProxyType, dict, Mapping)
    state = getattr(tool_context, "state", None)
    if state is not None and hasattr(state, "get"):
        # 3a. agent_association platform context
        assoc = state.get("agent_association")
        tok = _extract_token_from_object(assoc)
        if tok:
            logger.debug("Retrieved OAuth token via agent_association payload.")
            return Credentials(token=tok)

        # 3b. Key variations (Discovery Engine / Agent Space)
        for key in (auth_id, f"temp:{auth_id}", f"token_{auth_id}"):
            candidate = state.get(key)
            tok = _extract_token_from_object(candidate)
            if tok:
                logger.debug(f"Retrieved OAuth token via key lookup '{key}'.")
                return Credentials(token=tok)

    # 4. Strictly gated local development fallback (never active in production)
    if allow_local_dev_fallback and os.getenv("ADK_ENV") == "local":
        local_tok = os.getenv("GCP_ACCESS_TOKEN") or os.getenv("USER_ACCESS_TOKEN") or os.getenv(auth_id)
        tok = _extract_token_from_object(local_tok)
        if tok:
            logger.warning("USING LOCAL DEV FALLBACK TOKEN. Do not run this mode in production.")
            return Credentials(token=tok)

    if raise_on_missing:
        raise MissingCredentialsError("Access Denied: No valid end-user OAuth token available for ${authId}.")

    return None


def call_authorized_api(tool_context: ToolContext, endpoint_path: str) -> Dict[str, Any]:
    """
    Calls a downstream API on behalf of the user using their delegated OAuth credentials.
    """
    creds = get_user_credentials(tool_context, raise_on_missing=True)
    token = getattr(creds, "token", None)
    if not token:
        raise MissingCredentialsError("Credentials object contains no valid access token.")

    import requests
    headers = {
        "Authorization": f"Bearer {token}",
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
