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

const DB_NAME = 'GeminiLicenseCache';
const DB_VERSION = 1;
const STORE_NAME = 'user_licenses';

export interface CachedLicenseData {
  data: any[];
  timestamp: number;
}

// In-memory fallback if IndexedDB is not available or throws (e.g. test environments / private browsing)
const memoryCache = new Map<string, CachedLicenseData>();

const isIndexedDBAvailable = (): boolean => {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB not available'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
};

const getCacheKey = (projectNumber: string, userStoreId: string): string => {
  return `${projectNumber}:${userStoreId}`;
};

export const getCachedUserLicenses = async (
  projectNumber: string,
  userStoreId: string
): Promise<CachedLicenseData | null> => {
  const key = getCacheKey(projectNumber, userStoreId);

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result || memoryCache.get(key) || null);
      };
      req.onerror = () => {
        resolve(memoryCache.get(key) || null);
      };
    });
  } catch {
    return memoryCache.get(key) || null;
  }
};

export const setCachedUserLicenses = async (
  projectNumber: string,
  userStoreId: string,
  data: any[]
): Promise<void> => {
  const key = getCacheKey(projectNumber, userStoreId);
  const record: CachedLicenseData = {
    data,
    timestamp: Date.now(),
  };

  // Always keep in memory cache as well
  memoryCache.set(key, record);

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record, key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to write to cache'));
    });
  } catch (err) {
    // Memory cache is already updated, so fail gracefully
    if (isIndexedDBAvailable()) {
      console.warn('IndexedDB write failed, falling back to in-memory cache:', err);
    }
  }
};

export const clearCachedUserLicenses = async (
  projectNumber: string,
  userStoreId: string
): Promise<void> => {
  const key = getCacheKey(projectNumber, userStoreId);
  memoryCache.delete(key);

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to delete from cache'));
    });
  } catch {
    // Memory cache cleared, fail gracefully
  }
};

export const updateCachedUserLicenses = async (
  projectNumber: string,
  userStoreId: string,
  updater: (current: any[]) => any[]
): Promise<any[]> => {
  const current = await getCachedUserLicenses(projectNumber, userStoreId);
  const updatedData = updater(current ? current.data : []);
  await setCachedUserLicenses(projectNumber, userStoreId, updatedData);
  return updatedData;
};
