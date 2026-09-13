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

/**
 * Result accounting for restore operations.
 *
 * The restore functions in `restoreOperations.ts` deliberately continue after
 * a single resource fails -- restoring 9 of 10 agents is more useful than
 * aborting on the first error. The previous implementation expressed that by
 * catching the error, appending an `ERROR: ...` line to the scrolling log and
 * returning normally, which meant the promise resolved and the caller
 * reported "Restore process finished." A disaster-recovery run that restored
 * nothing at all was indistinguishable from one that restored everything.
 *
 * These types let a restore keep going while still recording what failed, so
 * the caller can fail loudly at the end.
 */

export interface RestoreFailure {
  /** e.g. "Agent", "Data Store", "Collection". */
  resourceType: string;
  /** Identifier or display name of the specific resource. */
  resourceId: string;
  reason: string;
}

export interface RestoreOutcome {
  created: string[];
  /** Resources intentionally not restored (already present, user canceled). */
  skipped: string[];
  failed: RestoreFailure[];
}

export const createRestoreOutcome = (): RestoreOutcome => ({
  created: [],
  skipped: [],
  failed: [],
});

export const recordCreated = (outcome: RestoreOutcome, resourceId: string): void => {
  outcome.created.push(resourceId);
};

export const recordSkipped = (outcome: RestoreOutcome, resourceId: string): void => {
  outcome.skipped.push(resourceId);
};

export const recordFailure = (
  outcome: RestoreOutcome,
  resourceType: string,
  resourceId: string,
  reason: string
): void => {
  outcome.failed.push({ resourceType, resourceId, reason });
};

/** Folds `sources` into `target` in place and returns it. */
export const mergeRestoreOutcomes = (
  target: RestoreOutcome,
  ...sources: Array<RestoreOutcome | void | undefined>
): RestoreOutcome => {
  for (const source of sources) {
    if (!source) continue;
    target.created.push(...source.created);
    target.skipped.push(...source.skipped);
    target.failed.push(...source.failed);
  }
  return target;
};

export const summarizeRestoreOutcome = (outcome: RestoreOutcome): string =>
  `restored=${outcome.created.length}, skipped=${outcome.skipped.length}, failed=${outcome.failed.length}`;

/**
 * Thrown when a restore finished but did not restore everything it was asked
 * to. Carries the full outcome so the UI can list exactly what is missing
 * rather than showing a generic failure.
 */
export class RestoreIncompleteError extends Error {
  readonly outcome: RestoreOutcome;

  constructor(sectionName: string, outcome: RestoreOutcome) {
    const detail = outcome.failed
      .map((f) => `${f.resourceType} '${f.resourceId}': ${f.reason}`)
      .join('; ');
    super(
      `Restore of ${sectionName} did not complete: ${outcome.failed.length} of ` +
        `${outcome.created.length + outcome.failed.length} resource(s) failed. ${detail}`
    );
    this.name = 'RestoreIncompleteError';
    this.outcome = outcome;
  }
}

/**
 * Throws if anything failed. Call this at the end of a restore so a partial
 * restore surfaces as an error state instead of a success message.
 */
export const assertRestoreComplete = (
  outcome: RestoreOutcome,
  sectionName: string
): void => {
  if (outcome.failed.length > 0) {
    throw new RestoreIncompleteError(sectionName, outcome);
  }
};
