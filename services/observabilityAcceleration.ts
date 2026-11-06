/**
 * Copyright 2026 Google LLC
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

/**
 * High-scale acceleration for the Live Activity dashboard.
 *
 * The dashboard's dominant cost is reading and parsing the large nested `jsonPayload` column of the
 * Gemini Enterprise user-activity sink table on every load. Acceleration materializes the handful
 * of fields the dashboard needs into a small, flat, partitioned table (`ACCELERATION_TABLE_ID`).
 *
 * - Refresh is MANUAL (a button). Nothing runs automatically.
 * - Reads use ONLY the acceleration table while it is enabled and non-empty, so charts include
 *   events up to the last Refresh (shown in the UI). A hybrid accelerated + raw read was benchmarked
 *   at 80k-user scale and spent 26-44s in BigQuery query preparation vs 3-9s accelerated-only.
 * - Refresh is idempotent: MERGE inserts only (insert_id, event_time) pairs not already present,
 *   and the read path also deduplicates, so overlapping refreshes cannot double-count events.
 *
 * Scope: this accelerates the Live Activity tab only. The Operational Analytics views are unchanged.
 */

import { runBigQueryQuery, BigQueryQueryResponse } from './apiService';

export const ACCELERATION_TABLE_ID = 'gem_accel_user_activity';
export const USER_ACTIVITY_TABLE_PREFIX = 'discoveryengine_googleapis_com_gemini_enterprise_user_activity';
export const ACTIVITY_METHODS_SQL = "('WriteUserEvent', 'StreamAssist', 'Assist', 'Search')";
/** Initial backfill length; matches the dashboard's largest time range. */
export const ACCELERATION_BACKFILL_DAYS = 30;
/** Each refresh re-reads this much history before the watermark to pick up late-arriving logs. */
export const ACCELERATION_REFRESH_OVERLAP_HOURS = 2;
/** Partitions older than this are deleted by BigQuery automatically to bound storage. */
export const ACCELERATION_PARTITION_EXPIRATION_DAYS = 90;

const tableRef = (projectId: string, datasetId: string, tableId: string) =>
    `\`${projectId}.${datasetId}.${tableId}\``;

const assertSafeIdentifier = (value: string, label: string) => {
    // Project IDs may contain '-', ':' and '.' (domain-scoped); dataset/table IDs are [A-Za-z0-9_].
    if (!/^[A-Za-z0-9_.:-]+$/.test(value)) {
        throw new Error(`Invalid BigQuery ${label}: ${JSON.stringify(value)}`);
    }
};

const assertIsoTimestamp = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
        throw new Error(`Invalid ISO timestamp: ${JSON.stringify(value)}`);
    }
};

/**
 * Column projection shared by the raw read path and the acceleration refresh, so both produce
 * identical values. Expects an input relation with columns `jp` (TO_JSON_STRING(jsonPayload)),
 * `event_time`, `trace`, `insertId`. Output column order:
 * user_email, event_time, trace, agent_name, agent_id, session_id, method_name.
 */
export const ACTIVITY_PROJECTION_SQL = `
  COALESCE(
    JSON_VALUE(jp, '$.useriamprincipal'),
    JSON_VALUE(jp, '$.userIamPrincipal')
  ) as user_email,
  event_time,
  trace,
  COALESCE(
    JSON_VALUE(jp, '$.request.userevent.agentspaceinfo.agentinfo.name'),
    JSON_VALUE(jp, '$.request.userEvent.agentSpaceInfo.agentInfo.name'),
    JSON_VALUE(jp, '$.request.userEvent.agentSpaceInfo.agentInfo.displayName'),
    JSON_VALUE(jp, '$.request.userevent.agentspaceinfo.agentinfo.displayname'),
    JSON_VALUE(jp, '$.response.agentinfo.displayname'),
    JSON_VALUE(jp, '$.response.agentInfo.displayName'),
    IF(COALESCE(JSON_VALUE(jp, '$.logMetadata.methodName'), JSON_VALUE(jp, '$.logmetadata.methodname')) = 'Search',
       CONCAT('Search (', COALESCE(REGEXP_EXTRACT(COALESCE(JSON_VALUE(jp, '$.request.servingconfig'), JSON_VALUE(jp, '$.request.servingConfig')), r'engines/([^/]+)'), 'default'), ')'),
       NULL)
  ) as agent_name,
  COALESCE(
    JSON_VALUE(jp, '$.request.userevent.agentspaceinfo.agentinfo.agentid'),
    JSON_VALUE(jp, '$.request.userEvent.agentSpaceInfo.agentInfo.agentId'),
    JSON_VALUE(jp, '$.response.agentinfo.agent'),
    JSON_VALUE(jp, '$.response.agentInfo.agent'),
    IF(COALESCE(JSON_VALUE(jp, '$.logMetadata.methodName'), JSON_VALUE(jp, '$.logmetadata.methodname')) = 'Search', 'search', NULL)
  ) as agent_id,
  COALESCE(
    REGEXP_EXTRACT(
      COALESCE(
        JSON_VALUE(jp, '$.response.answer.name'),
        JSON_VALUE(jp, '$.request.session'),
        JSON_VALUE(jp, '$.response.session')
      ),
      r'sessions/([^/]+)'
    ),
    JSON_VALUE(jp, '$.request.userEvent.sessionId'),
    JSON_VALUE(jp, '$.request.userevent.sessionid'),
    trace,
    insertId
  ) as session_id,
  COALESCE(
    JSON_VALUE(jp, '$.logMetadata.methodName'),
    JSON_VALUE(jp, '$.logmetadata.methodname')
  ) as method_name`;

/**
 * Picks user-activity sink tables that can contain events at or after `since`: the un-suffixed
 * (time-partitioned) table, plus date shards whose `_YYYYMMDD` suffix is on/after `since` (UTC).
 */
export const selectActivityTablesSince = (tableIds: string[], since: Date): string[] => {
    const sinceSuffix = since.toISOString().slice(0, 10).replace(/-/g, '');
    return tableIds.filter((id) => {
        if (id.startsWith('v_')) return false;
        if (id === USER_ACTIVITY_TABLE_PREFIX) return true;
        if (id.startsWith(`${USER_ACTIVITY_TABLE_PREFIX}_`)) {
            const datePart = id.slice(USER_ACTIVITY_TABLE_PREFIX.length + 1);
            return /^\d{8}$/.test(datePart) && datePart >= sinceSuffix;
        }
        return false;
    });
};

/** One raw sink table, filtered by time and method; serializes jsonPayload once per row. */
export const buildRawActivitySelect = (
    projectId: string,
    datasetId: string,
    tableId: string,
    startIso: string,
): string => {
    assertSafeIdentifier(projectId, 'project');
    assertSafeIdentifier(datasetId, 'dataset');
    assertSafeIdentifier(tableId, 'table');
    assertIsoTimestamp(startIso);
    return `
      SELECT jp, event_time, trace, insertId
      FROM (
        SELECT
          TO_JSON_STRING(jsonPayload) as jp,
          timestamp as event_time,
          trace,
          insertId
        FROM ${tableRef(projectId, datasetId, tableId)}
        WHERE timestamp >= TIMESTAMP('${startIso}')
      )
      WHERE COALESCE(
          JSON_VALUE(jp, '$.logMetadata.methodName'),
          JSON_VALUE(jp, '$.logmetadata.methodname')
        ) IN ${ACTIVITY_METHODS_SQL}
    `;
};

export const buildCreateAccelerationTableDdl = (projectId: string, datasetId: string): string => {
    assertSafeIdentifier(projectId, 'project');
    assertSafeIdentifier(datasetId, 'dataset');
    return `CREATE TABLE IF NOT EXISTS ${tableRef(projectId, datasetId, ACCELERATION_TABLE_ID)} (
  event_time TIMESTAMP NOT NULL,
  insert_id STRING NOT NULL,
  trace STRING,
  user_email STRING,
  agent_name STRING,
  agent_id STRING,
  session_id STRING,
  method_name STRING
)
PARTITION BY DATE(event_time)
CLUSTER BY method_name, trace
OPTIONS (
  partition_expiration_days = ${ACCELERATION_PARTITION_EXPIRATION_DAYS},
  description = 'Gemini Enterprise Manager: pre-extracted user activity for the Live Activity dashboard. Refreshed manually from the dashboard. Safe to drop; the dashboard falls back to raw sink tables.'
);`;
};

/**
 * Idempotent refresh: inserts deduplicated events from `sourceTableIds` with timestamp >= startIso
 * that are not already present. Re-running it (or running two concurrently) does not create
 * duplicate (insert_id, event_time) rows.
 */
export const buildRefreshMergeSql = (
    projectId: string,
    datasetId: string,
    sourceTableIds: string[],
    startIso: string,
): string => {
    if (sourceTableIds.length === 0) {
        throw new Error('No user-activity sink tables cover the refresh window.');
    }
    const sources = sourceTableIds
        .map((t) => buildRawActivitySelect(projectId, datasetId, t, startIso))
        .join('\nUNION ALL\n');
    return `MERGE ${tableRef(projectId, datasetId, ACCELERATION_TABLE_ID)} T
USING (
  SELECT
    insertId AS insert_id,
    ${ACTIVITY_PROJECTION_SQL}
  FROM (
    ${sources}
  )
  WHERE insertId IS NOT NULL AND event_time IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY insertId, event_time ORDER BY event_time) = 1
) S
ON T.insert_id = S.insert_id
  AND T.event_time = S.event_time
  AND T.event_time >= TIMESTAMP('${startIso}')
WHEN NOT MATCHED THEN
  INSERT (event_time, insert_id, trace, user_email, agent_name, agent_id, session_id, method_name)
  VALUES (S.event_time, S.insert_id, S.trace, S.user_email, S.agent_name, S.agent_id, S.session_id, S.method_name);`;
};

export const buildWatermarkQuery = (projectId: string, datasetId: string): string => {
    assertSafeIdentifier(projectId, 'project');
    assertSafeIdentifier(datasetId, 'dataset');
    return `SELECT MAX(event_time) AS watermark FROM ${tableRef(projectId, datasetId, ACCELERATION_TABLE_ID)}`;
};

/**
 * Accelerated dashboard read: all events at/after startIso in the acceleration table. Output columns
 * match ACTIVITY_PROJECTION_SQL order (same shape as the raw path's base_activity).
 */
export const buildAcceleratedActivitySelect = (
    projectId: string,
    datasetId: string,
    startIso: string,
): string => {
    assertSafeIdentifier(projectId, 'project');
    assertSafeIdentifier(datasetId, 'dataset');
    assertIsoTimestamp(startIso);
    return `
      SELECT user_email, event_time, trace, agent_name, agent_id, session_id, method_name
      FROM ${tableRef(projectId, datasetId, ACCELERATION_TABLE_ID)}
      WHERE event_time >= TIMESTAMP('${startIso}')
      QUALIFY ROW_NUMBER() OVER (PARTITION BY insert_id, event_time ORDER BY event_time) = 1
    `;
};

const throwIfQueryError = (res: BigQueryQueryResponse | undefined, action: string) => {
    if (res?.error || (res?.errors && res.errors.length > 0)) {
        throw new Error(`${action} failed: ${res.error?.message || res.errors?.[0]?.message || 'unknown BigQuery error'}`);
    }
};

/** Returns the latest event_time in the acceleration table, or null if it is empty. */
export const getAccelerationWatermark = async (projectId: string, datasetId: string): Promise<Date | null> => {
    const res = await runBigQueryQuery(projectId, buildWatermarkQuery(projectId, datasetId), true);
    throwIfQueryError(res, 'Reading acceleration watermark');
    const raw = res?.rows?.[0]?.f?.[0]?.v;
    if (raw === null || raw === undefined || raw === '') return null;
    // BigQuery REST returns TIMESTAMP values as epoch seconds (string, possibly fractional).
    const seconds = Number(raw);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(raw));
    if (!Number.isFinite(ms)) {
        throw new Error(`Acceleration watermark is not a valid timestamp: ${JSON.stringify(raw)}`);
    }
    return new Date(ms);
};

export interface AccelerationRefreshResult {
    startIso: string;
    sourceTables: string[];
    insertedRows: number | null;
    watermark: Date | null;
}

/** Computes the refresh start: watermark minus overlap, or the backfill window for an empty table. */
export const computeRefreshStart = (watermark: Date | null, now: Date = new Date()): Date => {
    if (watermark) {
        return new Date(watermark.getTime() - ACCELERATION_REFRESH_OVERLAP_HOURS * 3600 * 1000);
    }
    return new Date(now.getTime() - ACCELERATION_BACKFILL_DAYS * 24 * 3600 * 1000);
};

export const refreshAcceleration = async (
    projectId: string,
    datasetId: string,
    allTableIds: string[],
    now: Date = new Date(),
): Promise<AccelerationRefreshResult> => {
    const watermarkBefore = await getAccelerationWatermark(projectId, datasetId);
    const start = computeRefreshStart(watermarkBefore, now);
    const startIso = start.toISOString();
    const sourceTables = selectActivityTablesSince(allTableIds, start);
    if (sourceTables.length === 0) {
        // No sink table (partitioned table or date shard) covers the window: nothing new to load.
        return { startIso, sourceTables, insertedRows: 0, watermark: watermarkBefore };
    }
    const res = await runBigQueryQuery(projectId, buildRefreshMergeSql(projectId, datasetId, sourceTables, startIso), true);
    throwIfQueryError(res, 'Refreshing acceleration table');
    const affected = (res as { numDmlAffectedRows?: string } | undefined)?.numDmlAffectedRows;
    const insertedRows = affected !== undefined && Number.isFinite(Number(affected)) ? Number(affected) : null;
    const watermark = await getAccelerationWatermark(projectId, datasetId);
    return { startIso, sourceTables, insertedRows, watermark };
};

/** Creates the table (if needed) and backfills the last ACCELERATION_BACKFILL_DAYS days. */
export const enableAcceleration = async (
    projectId: string,
    datasetId: string,
    allTableIds: string[],
    now: Date = new Date(),
): Promise<AccelerationRefreshResult> => {
    const res = await runBigQueryQuery(projectId, buildCreateAccelerationTableDdl(projectId, datasetId), true);
    throwIfQueryError(res, 'Creating acceleration table');
    return refreshAcceleration(projectId, datasetId, allTableIds, now);
};

export const disableAcceleration = async (projectId: string, datasetId: string): Promise<void> => {
    assertSafeIdentifier(projectId, 'project');
    assertSafeIdentifier(datasetId, 'dataset');
    const res = await runBigQueryQuery(
        projectId,
        `DROP TABLE IF EXISTS ${tableRef(projectId, datasetId, ACCELERATION_TABLE_ID)};`,
        true,
    );
    throwIfQueryError(res, 'Dropping acceleration table');
};
