import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedUserLicenses,
  setCachedUserLicenses,
  clearCachedUserLicenses,
  updateCachedUserLicenses,
} from './licenseCache';

describe('licenseCache', () => {
  const project = 'test-project-123';
  const userStore = 'default_user_store';

  beforeEach(async () => {
    await clearCachedUserLicenses(project, userStore);
  });

  it('returns null when nothing is cached', async () => {
    const cached = await getCachedUserLicenses(project, userStore);
    expect(cached).toBeNull();
  });

  it('saves and retrieves cached user licenses', async () => {
    const dummyLicenses = [
      { userPrincipal: 'alice@example.com', licenseAssignmentState: 'ASSIGNED' },
      { userPrincipal: 'bob@example.com', licenseAssignmentState: 'UNASSIGNED' },
    ];

    await setCachedUserLicenses(project, userStore, dummyLicenses);
    const cached = await getCachedUserLicenses(project, userStore);

    expect(cached).not.toBeNull();
    expect(cached?.data).toHaveLength(2);
    expect(cached?.data[0].userPrincipal).toBe('alice@example.com');
    expect(cached?.timestamp).toBeGreaterThan(0);
  });

  it('clears cached user licenses', async () => {
    await setCachedUserLicenses(project, userStore, [{ userPrincipal: 'alice@example.com' }]);
    await clearCachedUserLicenses(project, userStore);

    const cached = await getCachedUserLicenses(project, userStore);
    expect(cached).toBeNull();
  });

  it('updates cached user licenses via updater function', async () => {
    await setCachedUserLicenses(project, userStore, [
      { userPrincipal: 'alice@example.com', licenseAssignmentState: 'ASSIGNED' },
    ]);

    const updated = await updateCachedUserLicenses(project, userStore, (current) => [
      ...current,
      { userPrincipal: 'charlie@example.com', licenseAssignmentState: 'ASSIGNED' },
    ]);

    expect(updated).toHaveLength(2);
    const cached = await getCachedUserLicenses(project, userStore);
    expect(cached?.data).toHaveLength(2);
  });
});
