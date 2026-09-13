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


// This service manages the loading and initialization of the Google API Client (gapi).

export interface GapiClient {
  request: (args: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }) => Promise<{ result: unknown; [key: string]: unknown }>;
  getToken: () => { access_token?: string } | null;
  setToken: (token: { access_token: string } | null) => void;
  init: (args: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

declare global {
  interface Window {
    gapi: {
      client: GapiClient;
      config: {
        update: (key: string, value: unknown) => void;
        [key: string]: unknown;
      };
      load: (
        api: string,
        callbackOrConfig:
          | (() => void)
          | {
              callback: () => void;
              onerror?: (err?: unknown) => void;
              ontimeout?: () => void;
              timeout?: number;
              [key: string]: unknown;
            }
      ) => void;
      [key: string]: unknown;
    };
  }
}

// Singleton promise to ensure gapi is initialized only once.
let gapiClientPromise: Promise<void> | null = null;
let isGapiLoaded = false;

// List of all Google Cloud APIs the application needs to discover.
const DISCOVERY_DOCS = [
    'https://discoveryengine.googleapis.com/$discovery/rest?version=v1alpha',
    'https://discoveryengine.googleapis.com/$discovery/rest?version=v1beta',
    'https://aiplatform.googleapis.com/$discovery/rest?version=v1beta1',
    'https://cloudresourcemanager.googleapis.com/$discovery/rest?version=v1',
    'https://logging.googleapis.com/$discovery/rest?version=v2',
    'https://run.googleapis.com/$discovery/rest?version=v2',
    'https://www.googleapis.com/discovery/v1/apis/storage/v1/rest',
    'https://serviceusage.googleapis.com/$discovery/rest?version=v1',
    'https://dialogflow.googleapis.com/$discovery/rest?version=v3',
];

/**
 * Loads the gapi script from Google's CDN.
 * Ensures the script is only added to the page once.
 */
const loadGapiScript = (): Promise<void> => {
    return new Promise((resolve) => {
        if (isGapiLoaded) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
            isGapiLoaded = true;
            resolve();
        };
        document.body.appendChild(script);
    });
};

/**
 * Initializes the Google API client. This function should be called once
 * when the application receives a valid access token. It's idempotent and
 * will only run the full initialization once. Subsequent calls with a new
 * token will just update the token.
 * @param accessToken The user's GCP access token.
 */
export const initGapiClient = (accessToken: string): Promise<void> => {
    if (!gapiClientPromise) {
        const init = async (): Promise<void> => {
            await loadGapiScript();

            // gapi.load() is callback-based, so wrap just that call. Supplying
            // onerror matters: without it, a failure to load the 'client'
            // module leaves the promise pending forever.
            await new Promise<void>((resolve, reject) => {
                window.gapi.load('client', {
                    callback: () => resolve(),
                    onerror: (err: unknown) =>
                        reject(err instanceof Error ? err : new Error('Failed to load the gapi "client" module.')),
                    ontimeout: () => reject(new Error('Timed out loading the gapi "client" module.')),
                    timeout: 30000,
                });
            });

            if (window.gapi.config) {
                window.gapi.config.update('client/cors', true);
            }

            await window.gapi.client.init({
                discoveryDocs: DISCOVERY_DOCS,
            });
            window.gapi.client.setToken({ access_token: accessToken });
        };

        gapiClientPromise = init().catch((err) => {
            console.error('Error initializing gapi client:', err);
            gapiClientPromise = null; // Reset on failure to allow retry
            throw err;
        });
    } else {
        // If already initialized or initializing, wait for it to finish then set the new token.
        return gapiClientPromise.then(() => {
             window.gapi.client.setToken({ access_token: accessToken });
        });
    }
    return gapiClientPromise;
};

/**
 * Returns a promise that resolves with the initialized gapi client object.
 * Throws an error if the client has not been initialized.
 */
export const getGapiClient = async (): Promise<GapiClient> => {
    if (!gapiClientPromise) {
        throw new Error('GAPI client has not been initialized. Call initGapiClient first.');
    }
    await gapiClientPromise;
    return window.gapi.client;
};
