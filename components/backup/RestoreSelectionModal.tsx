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

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../common/Modal';

// A generic item with a unique name and an optional display name
export interface SelectableItem {
  name: string;
  displayName?: string;
  agentType?: string; // Optional property for displaying agent type
  disabled?: boolean;
  disabledReason?: string;
}

interface RestoreSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedItems: SelectableItem[]) => void;
  title: string;
  items: SelectableItem[];
  isLoading: boolean;
}

const RestoreSelectionModal: React.FC<RestoreSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  items,
  isLoading,
}) => {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  // When the modal opens with new items, select all of them by default (except disabled ones)
  useEffect(() => {
    if (isOpen) {
      setSelectedNames(new Set(items.filter(item => !item.disabled).map(item => item.name)));
    }
  }, [isOpen, items]);

  const allItemNames = useMemo(() => items.map(item => item.name), [items]);

  const handleToggle = (itemName: string) => {
    setSelectedNames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemName)) {
        newSet.delete(itemName);
      } else {
        newSet.add(itemName);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedNames(new Set(items.filter(item => !item.disabled).map(item => item.name)));
  };

  const handleDeselectAll = () => {
    setSelectedNames(new Set());
  };

  const handleConfirm = () => {
    const selectedItems = items.filter(item => selectedNames.has(item.name));
    onConfirm(selectedItems);
  };
  
  const isAllSelected = selectedNames.size === items.length && items.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="Select the items you wish to restore from the backup file."
      size="2xl"
      preventClose={isLoading}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading || selectedNames.size === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-sm font-semibold"
          >
            {isLoading ? 'Restoring...' : `Restore ${selectedNames.size} Item(s)`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-300">
            {selectedNames.size} of {items.length} selected
          </div>
          <div className="space-x-2">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={isAllSelected}
              className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              disabled={selectedNames.size === 0}
              className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              Deselect All
            </button>
          </div>
        </div>
        
        <ul className="space-y-2 bg-gray-900/50 p-3 rounded-md">
          {items.map(item => {
            const itemId = item.name.split('/').pop() || item.name;
            return (
              <li key={item.name} className={`p-2 rounded-md ${item.disabled ? 'opacity-50 cursor-not-allowed bg-gray-800/20' : 'hover:bg-gray-700/50'}`}>
                <label className={`flex items-center ${item.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`} title={item.disabledReason}>
                  <input
                    type="checkbox"
                    checked={selectedNames.has(item.name)}
                    onChange={() => !item.disabled && handleToggle(item.name)}
                    disabled={item.disabled}
                    className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 disabled:opacity-50"
                  />
                  <div className="ml-3 text-sm">
                    <span className="font-medium text-white">{item.displayName || itemId}</span>
                    {item.agentType && (
                      <span className={`ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${item.disabled ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-blue-900/50 text-blue-300 border border-blue-800'}`}>
                        {item.agentType}
                      </span>
                    )}
                    <p className="text-gray-400 font-mono text-xs">{itemId}</p>
                    {item.disabledReason && (
                      <p className="text-red-400 text-xs mt-1">{item.disabledReason}</p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};

export default RestoreSelectionModal;
