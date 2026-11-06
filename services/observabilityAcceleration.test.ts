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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBigQueryQuery } from './apiService';
import {
    ACCELERATION_TABLE_ID,
    ACCELERATION_BACKFILL_DAYS,
    ACCELERATION_REFRESH_OVERLAP_HOURS,
    USER_ACTIVITY_TABLE_PREFIX,
    buildAcceleratedActivitySelect,
    buildCreateAccelerationTableDdl,
    buildRawActivitySelect,
    buildRefreshMergeSql,
    computeRefreshStart,
    disableAcceleration,
    enableAcceleration,
    getAccelerationWatermark,
    refreshAcceleration,
    selectActivityTablesSince,
} from './observabilityAcceleration';

vi.mock('./apiService', () => ({
    runBigQueryQuery: vi.fn(),
}));

const mockedQuery = vi.mocked(runBigQueryQuery);
const P = 'proj-a';
const D = 'logs_ds';
const SHARD = (d: string) => `${USER_ACTIVITY_TABLE_PREFIX}_${d}`;

describe('observabilityAcceleration SQL builders', () => {
    it('creates a day-partitioned, clustered table with partition expiration and no JSON columns', () => {
        const ddl = buildCreateAccelerationTableDdl(P, D);
        expect(ddl).toContain(`CREATE TABLE IF NOT EXISTS \`${P}.${D}.${ACCELERATION_TABLE_ID}\``);
        expect(ddl).toContain('PARTITION BY DATE(event_time)');
        expect(ddl).toContain('CLUSTER BY method_name, trace');
        expect(ddl).toContain('partition_expiration_days = 90');
        expect(ddl).not.toMatch(/jsonPayload|JSON\b/);
    });

    it('selects the partitioned table and only date shards on/after the window start', () => {
        const ids = [
            USER_ACTIVITY_TABLE_PREFIX,
            SHARD('20261101'),
            SHARD('20261105'),
            SHARD('2026110X'), // malformed suffix
            `${USER_ACTIVITY_TABLE_PREFIX}_backup`, // non-date suffix
            'v_consolidated_user_activity',
            ACCELERATION_TABLE_ID,
            'discoveryengine_googleapis_com_gen_ai_choice_20261105',
        ];
        expect(selectActivityTablesSince(ids, new Date('2026-11-03T10:00:00Z'))).toEqual([
            USER_ACTIVITY_TABLE_PREFIX,
            SHARD('20261105'),
        ]);
    });

    it('builds an idempotent MERGE that dedupes the source, prunes the target, and only inserts unmatched rows', () => {
        const sql = buildRefreshMergeSql(P, D, [SHARD('20261105'), SHARD('20261106')], '2026-11-05T00:00:00.000Z');
        expect(sql).toMatch(/^MERGE `proj-a\.logs_ds\.gem_accel_user_activity` T/);
        expect(sql).toContain('QUALIFY ROW_NUMBER() OVER (PARTITION BY insertId, event_time ORDER BY event_time) = 1');
        expect(sql).toContain("AND T.event_time >= TIMESTAMP('2026-11-05T00:00:00.000Z')");
        expect(sql).toContain('WHEN NOT MATCHED THEN');
        expect(sql).not.toContain('WHEN MATCHED');
        expect(sql.match(/TO_JSON_STRING\(jsonPayload\)/g)).toHaveLength(2); // once per source table
        expect(sql).toContain('UNION ALL');
    });

    it('rejects a MERGE with no source tables instead of generating invalid SQL', () => {
        expect(() => buildRefreshMergeSql(P, D, [], '2026-11-05T00:00:00.000Z')).toThrow(/No user-activity sink tables/);
    });

    it('reads the accelerated table from the window start (no raw-log tail) and dedupes on (insert_id, event_time)', () => {
        const sql = buildAcceleratedActivitySelect(P, D, '2026-10-07T00:00:00.000Z');
        expect(sql).toContain("event_time >= TIMESTAMP('2026-10-07T00:00:00.000Z')");
        expect(sql).not.toContain('event_time <');
        expect(sql).not.toContain('jsonPayload');
        expect(sql).toContain('PARTITION BY insert_id, event_time');
        expect(sql).toMatch(/SELECT user_email, event_time, trace, agent_name, agent_id, session_id, method_name/);
    });

    it('rejects SQL-injection attempts in identifiers and timestamps', () => {
        expect(() => buildCreateAccelerationTableDdl(P, 'ds`; DROP TABLE x; --')).toThrow(/Invalid BigQuery dataset/);
        expect(() => buildRawActivitySelect(P, D, "t' OR 1=1", '2026-11-05T00:00:00.000Z')).toThrow(/Invalid BigQuery table/);
        expect(() => buildRawActivitySelect(P, D, SHARD('20261105'), "2026-11-05'); DROP TABLE x; --")).toThrow(
            /Invalid ISO timestamp/
        );
        expect(() => buildAcceleratedActivitySelect(P, D, 'not-a-date')).toThrow(
            /Invalid ISO timestamp/
        );
    });

    it('starts a refresh at watermark minus overlap, or backfills the full window when empty', () => {
        const now = new Date('2026-11-06T12:00:00Z');
        const wm = new Date('2026-11-06T09:00:00Z');
        expect(computeRefreshStart(wm, now).getTime()).toBe(wm.getTime() - ACCELERATION_REFRESH_OVERLAP_HOURS * 3600_000);
        expect(computeRefreshStart(null, now).getTime()).toBe(now.getTime() - ACCELERATION_BACKFILL_DAYS * 86400_000);
    });
});

describe('observabilityAcceleration operations', () => {
    beforeEach(() => {
        mockedQuery.mockReset();
    });

    it('parses the watermark from epoch-seconds, returns null for an empty table, and rejects garbage', async () => {
        mockedQuery.mockResolvedValueOnce({ rows: [{ f: [{ v: '1.7624304E9' }] }] });
        expect((await getAccelerationWatermark(P, D))?.toISOString()).toBe('2025-11-06T12:00:00.000Z');

        mockedQuery.mockResolvedValueOnce({ rows: [{ f: [{ v: null }] }] });
        expect(await getAccelerationWatermark(P, D)).toBeNull();

        mockedQuery.mockResolvedValueOnce({ rows: [{ f: [{ v: 'yesterday-ish' }] }] });
        await expect(getAccelerationWatermark(P, D)).rejects.toThrow(/not a valid timestamp/);

        mockedQuery.mockResolvedValueOnce({ error: { message: 'Not found: Table proj-a:logs_ds.gem_accel_user_activity' } });
        await expect(getAccelerationWatermark(P, D)).rejects.toThrow(/Reading acceleration watermark failed: Not found/);
    });

    it('enable creates the table, backfills 30 days from matching shards, and reports inserted rows', async () => {
        const now = new Date('2026-11-06T12:00:00Z');
        mockedQuery
            .mockResolvedValueOnce({}) // CREATE TABLE
            .mockResolvedValueOnce({ rows: [{ f: [{ v: null }] }] }) // watermark before (empty)
            .mockResolvedValueOnce({ numDmlAffectedRows: '1234' }) // MERGE
            .mockResolvedValueOnce({ rows: [{ f: [{ v: String(Date.parse('2026-11-06T11:58:00Z') / 1000) }] }] });

        const res = await enableAcceleration(P, D, [SHARD('20261001'), SHARD('20261010'), SHARD('20261106')], now);

        expect(mockedQuery.mock.calls[0][1]).toContain('CREATE TABLE IF NOT EXISTS');
        const mergeSql = mockedQuery.mock.calls[2][1];
        expect(mergeSql).toContain(SHARD('20261010'));
        expect(mergeSql).toContain(SHARD('20261106'));
        expect(mergeSql).not.toContain(SHARD('20261001')); // older than the 30-day backfill
        expect(res.insertedRows).toBe(1234);
        expect(res.startIso).toBe('2026-10-07T12:00:00.000Z');
        expect(res.watermark?.toISOString()).toBe('2026-11-06T11:58:00.000Z');
    });

    it('refresh with no sink tables in the window is a no-op and does not run a MERGE', async () => {
        mockedQuery.mockResolvedValueOnce({ rows: [{ f: [{ v: null }] }] });
        const res = await refreshAcceleration(P, D, [SHARD('20250101')], new Date('2026-11-06T12:00:00Z'));
        expect(res.insertedRows).toBe(0);
        expect(res.sourceTables).toEqual([]);
        expect(mockedQuery).toHaveBeenCalledTimes(1);
    });

    it('surfaces MERGE failures (e.g. missing permission) instead of reporting success', async () => {
        mockedQuery
            .mockResolvedValueOnce({ rows: [{ f: [{ v: null }] }] })
            .mockResolvedValueOnce({ error: { message: 'Access Denied: bigquery.tables.updateData' } });
        await expect(
            refreshAcceleration(P, D, [USER_ACTIVITY_TABLE_PREFIX], new Date('2026-11-06T12:00:00Z'))
        ).rejects.toThrow('Refreshing acceleration table failed: Access Denied: bigquery.tables.updateData');
    });

    it('disable drops only the acceleration table', async () => {
        mockedQuery.mockResolvedValueOnce({});
        await disableAcceleration(P, D);
        expect(mockedQuery.mock.calls[0][1]).toBe(`DROP TABLE IF EXISTS \`${P}.${D}.${ACCELERATION_TABLE_ID}\`;`);
    });
});
