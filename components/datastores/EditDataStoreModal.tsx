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

import React, { useState, useEffect } from 'react';
import { Config, DataStore } from '../../types';
import * as api from '../../services/apiService';

export interface EditDataStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedDataStore: DataStore) => void;
  config: Config;
  dataStore: DataStore | null;
}

export const EditDataStoreModal: React.FC<EditDataStoreModalProps> = ({ isOpen, onClose, onSuccess, config, dataStore }) => {
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && dataStore) {
      setDisplayName(dataStore.displayName);
      setError(null);
    }
  }, [isOpen, dataStore]);

  if (!isOpen || !dataStore) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Display Name is required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = { displayName };
      const updatedDataStore = await api.updateDataStore(dataStore.name, payload, config);
      onSuccess(updatedDataStore);
    } catch (err: any) {
      setError(err.message || 'Failed to update data store.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg">
        <form onSubmit={handleSubmit}>
          <header className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Edit Data Store</h2>
          </header>
          <main className="p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-400">Data Store ID</label>
                <p className="mt-1 bg-gray-700 p-2 rounded-md text-sm font-mono text-gray-400">{dataStore.name.split('/').pop()}</p>
            </div>
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </main>
          <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default EditDataStoreModal;
