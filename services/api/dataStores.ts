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

import { Config, DataStore, Document, Authorization, IamPolicy, Operation, DataConnector } from "../../types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  getLocationFromResourceName,
  DISCOVERY_API_VERSION,
  DISCOVERY_API_BETA,
} from "./core";

export const getDataStoreIamPolicy = async (
  name: string,
  config: Config,
): Promise<IamPolicy> => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/dataStores/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:getIamPolicy`;
  return gapiRequest<IamPolicy>(url, "GET", projectId);
};

export const setDataStoreIamPolicy = async (
  name: string,
  policy: IamPolicy,
  config: Config,
): Promise<IamPolicy> => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/dataStores/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:setIamPolicy`;
  return gapiRequest<IamPolicy>(url, "POST", projectId, undefined, { policy });
};

export const checkDataStoreAclSupport = async (
  config: Config,
  sampleDataStoreId?: string,
): Promise<boolean> => {
  const { projectId, appLocation, collectionId = "default_collection" } = config;
  if (!projectId || !appLocation) return false;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  try {
    let testPath = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
    if (sampleDataStoreId) {
      testPath += `/dataStores/${sampleDataStoreId}`;
    }
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${testPath}:getIamPolicy`;
    const res = await gapiRequest<{ etag?: string; bindings?: unknown[] }>(url, "GET", projectId);
    return !!(res && (res.etag !== undefined || res.bindings !== undefined));
  } catch (_err: unknown) {
    // If the API returns an error (400 / 403 / 404 / FAILED_PRECONDITION), it's not allowlisted
    return false;
  }
};

export const getDataStore = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<DataStore>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${name}`,
    "GET",
    config.projectId,
  );
};

export const createDataStore = async (
  dataStoreId: string,
  payload: Partial<DataStore> | Record<string, unknown>,
  config: Config,
): Promise<Operation<DataStore>> => {
  const { projectId, appLocation, collectionId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/dataStores?dataStoreId=${dataStoreId}`;
  return gapiRequest<Operation<DataStore>>(url, "POST", projectId, undefined, payload);
};

export const updateDataStore = async (
  name: string,
  payload: Partial<DataStore> | Record<string, unknown>,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const updateMask = Object.keys(payload).join(",");
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${name}?updateMask=${updateMask}`;
  return gapiRequest<DataStore>(
    url,
    "PATCH",
    config.projectId,
    undefined,
    payload,
  );
};

export const deleteDataStore = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest(
    `${baseUrl}/${DISCOVERY_API_BETA}/${name}`,
    "DELETE",
    config.projectId,
  );
};

export const getDataConnector = async (config: Config) => {
  const { projectId, appLocation, collectionId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/dataConnector`;
  return gapiRequest<DataConnector>(url, "GET", projectId);
};

export const updateDataConnector = async (
  name: string,
  payload: Record<string, unknown>,
  updateMask: string[],
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<Record<string, unknown>>(url, "PATCH", config.projectId, undefined, payload);
};

export const setUpDataConnector = async (
  payload: Record<string, unknown>,
  config: Config,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}:setUpDataConnector`;
  return gapiRequest<Operation>(url, "POST", projectId, undefined, payload);
};

export const listDocuments = async (dataStoreName: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<{ documents: Document[] }>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/branches/default_branch/documents`,
    "GET",
    config.projectId,
  );
};

export const searchDocuments = async (
  dataStoreName: string,
  config: Config,
  query: string = "*",
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/servingConfigs/default_search:search`;

  const body = {
    query: query,
    pageSize: 1,
  };

  return gapiRequest<{ results: { document: Document }[] }>(
    url,
    "POST",
    config.projectId,
    undefined,
    body,
  );
};

/**
 * Searches a Data Store using the Discovery Engine Search API.
 * Equivalent to the Python discoveryengine_v1beta.SearchServiceClient.search() method.
 */
export const queryDataStore = async (
  dataStoreName: string,
  config: Config,
  query: string,
  pageSize: number = 10,
  pageToken?: string,
  servingConfigId: string = "default_serving_config",
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/servingConfigs/${servingConfigId}:search`;

  const body: Record<string, unknown> = {
    query,
    pageSize,
  };
  if (pageToken) {
    body.pageToken = pageToken;
  }

  return gapiRequest<{
    results: { id: string; document: Document }[];
    totalSize?: number;
    nextPageToken?: string;
    summary?: { summaryText?: string; summaryWithMetadata?: unknown };
    queryExpansionInfo?: unknown;
  }>(url, "POST", config.projectId, undefined, body);
};

/**
 * Fetches the workforce pool provider configuration from GCP IAM.
 * Used to auto-discover the OIDC issuer and client ID for sign-in.
 */
export const fetchWorkforceProviderConfig = async (
  poolId: string,
  providerId: string,
): Promise<{
  name: string;
  displayName?: string;
  oidc?: {
    issuerUri: string;
    clientId: string;
    webSsoConfig?: {
      responseType: string;
      assertionClaimsMapping?: Record<string, string>;
    };
  };
  saml?: { idpMetadataXml: string };
  state?: string;
}> => {
  const url = `https://iam.googleapis.com/v1/locations/global/workforcePools/${poolId}/providers/${providerId}`;
  return gapiRequest(url, "GET");
};

/**
 * Opens an OIDC sign-in popup to the identity provider's authorization endpoint.
 * Returns the ID token from the redirect fragment.
 *
 * IMPORTANT: The redirect URI (window.location.origin) must be registered as a
 * redirect URI in the identity provider's application configuration.
 */
export const signInWithOidcPopup = (
  authorizationEndpoint: string,
  clientId: string,
  redirectUri: string,
  scope: string = "openid profile email",
): Promise<{ idToken: string; email?: string }> => {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "id_token",
      redirect_uri: redirectUri,
      scope,
      response_mode: "fragment",
      nonce,
      state,
    });

    const popupUrl = `${authorizationEndpoint}?${params.toString()}`;
    const popup = window.open(
      popupUrl,
      "wif-oidc-signin",
      "width=500,height=700,left=200,top=100",
    );

    if (!popup) {
      reject(
        new Error("Popup was blocked. Please allow popups for this site."),
      );
      return;
    }

    let settled = false;

    const pollInterval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(pollInterval);
          if (!settled) {
            settled = true;
            reject(
              new Error(
                "Sign-in window was closed before completing authentication.",
              ),
            );
          }
          return;
        }

        const currentUrl = popup.location.href;

        if (currentUrl.startsWith(redirectUri)) {
          clearInterval(pollInterval);
          settled = true;

          const hash = popup.location.hash.substring(1);
          popup.close();

          const fragmentParams = new URLSearchParams(hash);
          const idToken = fragmentParams.get("id_token");
          const error = fragmentParams.get("error");
          const errorDescription = fragmentParams.get("error_description");

          if (error) {
            reject(
              new Error(
                `Identity provider error: ${errorDescription || error}`,
              ),
            );
            return;
          }

          if (!idToken) {
            reject(
              new Error("No ID token received from the identity provider."),
            );
            return;
          }

          if (fragmentParams.get("state") !== state) {
            reject(new Error("State mismatch — possible CSRF attack."));
            return;
          }

          let email: string | undefined;
          try {
            const payload = JSON.parse(atob(idToken.split(".")[1]));
            if (payload && payload.nonce !== nonce) {
              reject(new Error("Nonce mismatch — possible replay attack."));
              return;
            }
            email =
              payload?.email || payload?.preferred_username || payload?.upn;
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("Nonce mismatch")) {
              reject(err);
              return;
            }
          }

          resolve({ idToken, email });
        }
      } catch {
        // Cross-origin error while popup is on the IdP domain — expected, ignore
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(
      () => {
        clearInterval(pollInterval);
        if (!popup.closed) popup.close();
        if (!settled) {
          settled = true;
          reject(new Error("Sign-in timed out after 5 minutes."));
        }
      },
      5 * 60 * 1000,
    );
  });
};

/**
 * Fetches the OIDC discovery document from an issuer URI.
 * Returns the authorization_endpoint and other metadata.
 */
export const fetchOidcDiscovery = async (
  issuerUri: string,
): Promise<{
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
  [key: string]: unknown;
}> => {
  const url = `${issuerUri.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OIDC discovery document from ${url}: ${response.statusText}`,
    );
  }
  return response.json();
};

export interface WifConfig {
  userProject: string;
  poolId: string;
  providerId: string;
  subjectToken: string;
  subjectTokenType: string;
}

/**
 * Exchanges an external IdP token for a Google Cloud STS access token
 * via the Security Token Service (Workforce Identity Federation).
 */
export const exchangeStsToken = async (
  wifConfig: WifConfig,
): Promise<{
  access_token: string;
  expires_in: number;
  token_type: string;
}> => {
  const audience = `//iam.googleapis.com/locations/global/workforcePools/${wifConfig.poolId}/providers/${wifConfig.providerId}`;

  const stsBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    audience,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token_type: wifConfig.subjectTokenType,
    subject_token: wifConfig.subjectToken,
    options: JSON.stringify({ userProject: wifConfig.userProject }),
  });

  const response = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: stsBody.toString(),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error_description: response.statusText }));
    throw new Error(
      `STS Token Exchange failed: ${errorData.error_description || errorData.error || response.statusText}`,
    );
  }

  return response.json();
};

/**
 * Queries a Data Store using a custom access token (e.g. from WIF exchange)
 * instead of the default gapi OAuth session.
 */
export const queryDataStoreWithToken = async (
  dataStoreName: string,
  appLocation: string,
  projectId: string,
  accessToken: string,
  query: string,
  pageSize: number = 10,
  servingConfigId: string = "default_serving_config",
): Promise<{
  results: { id: string; document: Document }[];
  totalSize?: number;
  nextPageToken?: string;
}> => {
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/servingConfigs/${servingConfigId}:search`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    },
    body: JSON.stringify({ query, pageSize }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: { message: response.statusText } }));
    throw new Error(
      `Search failed: ${errorData.error?.message || response.statusText}`,
    );
  }

  return response.json();
};

export const getDocument = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<Document>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${name}`,
    "GET",
    config.projectId,
  );
};

export const importDocuments = async (
  dataStoreName: string,
  gcsUris: string[],
  bucket: string,
  config: Config,
): Promise<Operation> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const payload = {
    reconciliationMode: "INCREMENTAL",
    gcsSource: { inputUris: gcsUris, dataSchema: "content" },
  };
  return gapiRequest<Operation>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/branches/default_branch/documents:import`,
    "POST",
    config.projectId,
    undefined,
    payload,
  );
};

export const listAuthorizations = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 200,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/authorizations?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return gapiRequest<{
    authorizations: Authorization[];
    nextPageToken?: string;
  }>(url, "GET", config.projectId);
};

export const getAuthorization = async (name: string, config: Config) => {
  const location = getLocationFromResourceName(name);
  const baseUrl = getDiscoveryEngineUrl(location);
  return gapiRequest<Authorization>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "GET",
    config.projectId,
  );
};

export const createAuthorization = async (
  authId: string,
  payload: Partial<Authorization> | Record<string, unknown>,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/authorizations?authorizationId=${authId}`;
  return gapiRequest<Authorization>(
    url,
    "POST",
    config.projectId,
    undefined,
    payload,
  );
};

export const updateAuthorization = async (
  name: string,
  payload: Partial<Authorization> | Record<string, unknown>,
  updateMask: string[],
  config: Config,
) => {
  const location = getLocationFromResourceName(name);
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<Authorization>(
    url,
    "PATCH",
    config.projectId,
    undefined,
    payload,
  );
};

export const deleteAuthorization = async (name: string, config: Config) => {
  if (name.startsWith("projects/")) {
    const location = getLocationFromResourceName(name);
    const baseUrl = getDiscoveryEngineUrl(location);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`;
    return gapiRequest(url, "DELETE", config.projectId);
  } else {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/authorizations/${name}`;
    return gapiRequest(url, "DELETE", config.projectId);
  }
};
