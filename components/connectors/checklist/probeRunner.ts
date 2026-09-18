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

import { Config, DataConnector } from '../../../types';
import * as api from '../../../services/apiService';
import { toErrorMessage } from '../../../utils/errors';
import { ChecklistProbeConfig, ProbeExecutionResult } from './types';

export async function runAutomatedProbe(
  probe: ChecklistProbeConfig,
  connector: DataConnector | any,
  config: Config
): Promise<ProbeExecutionResult> {
  const executedAt = new Date().toISOString();
  const connectorState = connector.connectorState || connector || {};

  try {
    switch (probe.type) {
      case 'IAM_PERMISSION_CHECK': {
        const permissions = probe.requiredPermissions || [
          'discoveryengine.dataStores.get',
          'discoveryengine.collections.get',
        ];
        if (!config.projectId) {
          return {
            status: 'warning',
            message: 'No Google Cloud project ID configured in session.',
            executedAt,
          };
        }

        try {
          const result = await api.checkServiceAccountPermissions(
            config.projectId,
            '',
            permissions
          );
          if (result.hasAll) {
            return {
              status: 'pass',
              message: `All ${permissions.length} verified project IAM permissions are active.`,
              details: { grantedPermissions: permissions },
              executedAt,
            };
          } else {
            return {
              status: 'fail',
              message: `Missing required IAM permissions: ${result.missing.join(', ')}`,
              details: { missing: result.missing },
              executedAt,
            };
          }
        } catch (err: unknown) {
          return {
            status: 'fail',
            message: `IAM Permission Check Failed: ${toErrorMessage(err)}`,
            executedAt,
          };
        }
      }

      case 'MCP_CONNECTIVITY': {
        const params = connectorState.params || {};
        const actionConfig = connectorState.actionConfig || {};
        const actionParams = actionConfig.actionParams || {};
        const instanceUri =
          (typeof params.instance_uri === 'string' ? params.instance_uri : undefined) ||
          (typeof actionParams.instance_uri === 'string' ? actionParams.instance_uri : undefined);

        if (!instanceUri) {
          return {
            status: 'warning',
            message: 'No MCP instance_uri configured in connector parameters.',
            executedAt,
          };
        }

        const parts = (connector.name || connectorState.name || '').split('/');
        const projId =
          (parts.indexOf('projects') !== -1 ? parts[parts.indexOf('projects') + 1] : undefined) ||
          config.projectId;

        try {
          const tools = await api.listMcpTools(projId, instanceUri);
          if (!tools || tools.length === 0) {
            return {
              status: 'fail',
              message: `Connected to MCP server (${instanceUri}), but tools/list returned empty array.`,
              details: { instanceUri },
              executedAt,
            };
          }
          return {
            status: 'pass',
            message: `Successfully connected to MCP endpoint! Discovered ${tools.length} active dynamic tools.`,
            details: { toolsCount: tools.length, instanceUri },
            executedAt,
          };
        } catch (err: unknown) {
          return {
            status: 'fail',
            message: `Failed to connect to MCP endpoint (${instanceUri}): ${toErrorMessage(err)}`,
            executedAt,
          };
        }
      }

      case 'CONNECTOR_STATUS': {
        if (connectorState.state === 'FAILED') {
          return {
            status: 'fail',
            message: 'Connector is in FAILED state in Google Cloud Discovery Engine.',
            details: connectorState,
            executedAt,
          };
        }

        if (connectorState.latestRun?.error) {
          return {
            status: 'fail',
            message: `Latest sync run failed: ${connectorState.latestRun.error.message || 'Unknown error'}`,
            details: connectorState.latestRun.error,
            executedAt,
          };
        }

        if (connectorState.errorConfig?.error) {
          return {
            status: 'fail',
            message: `Connector error config: ${connectorState.errorConfig.error.message || 'Configuration error'}`,
            details: connectorState.errorConfig.error,
            executedAt,
          };
        }

        if (connectorState.state === 'INACTIVE') {
          return {
            status: 'warning',
            message: 'Connector state is currently INACTIVE.',
            executedAt,
          };
        }

        return {
          status: 'pass',
          message: `Connector state is ${connectorState.state || 'ACTIVE'} with zero reported sync failures.`,
          executedAt,
        };
      }

      case 'OAUTH_CONFIG_VALIDITY': {
        const actionParams = connectorState.actionConfig?.actionParams || {};
        const authType = actionParams.auth_type || connectorState.params?.auth_type || 'NONE';

        if (authType === 'NONE') {
          return {
            status: 'pass',
            message: 'Auth type is NONE (No client credentials required).',
            executedAt,
          };
        }

        if (authType === 'OAUTH') {
          const hasClientId = !!actionParams.client_id;
          const hasScopes = !!actionParams.scopes;
          if (!hasClientId && !connectorState.name) {
            return {
              status: 'warning',
              message: 'OAuth auth_type specified but Client ID is not configured.',
              executedAt,
            };
          }
          return {
            status: 'pass',
            message: `OAuth configuration syntax valid (auth_type: OAUTH, scopes: ${hasScopes ? 'configured' : 'default'}).`,
            executedAt,
          };
        }

        return {
          status: 'pass',
          message: `Auth type configured as ${authType}.`,
          executedAt,
        };
      }

      default:
        return {
          status: 'pass',
          message: 'Probe completed.',
          executedAt,
        };
    }
  } catch (err: unknown) {
    return {
      status: 'fail',
      message: `Probe execution error: ${toErrorMessage(err)}`,
      executedAt,
    };
  }
}
