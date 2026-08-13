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
import { Config } from '../../types';
import * as api from '../../services/apiService';

export type ResourceType = 'engine' | 'datastore' | 'connector' | 'entity';

export interface SetDataStoreIamPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedPolicy: any) => void;
  resourceId: string;
  resourceDisplayName?: string;
  resourceType: ResourceType;
  resourcePath: string;
  config: Config;
  currentPolicy: any;
}

const DEFAULT_ROLE = 'roles/discoveryengine.agentspaceUser';

const SetDataStoreIamPolicyModal: React.FC<SetDataStoreIamPolicyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  resourceId,
  resourceDisplayName,
  resourceType,
  resourcePath,
  config,
  currentPolicy,
}) => {
  const [editablePolicy, setEditablePolicy] = useState<any | null>(null);
  const [newMemberInputs, setNewMemberInputs] = useState<{ [key: number]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentPolicy) {
      const policyCopy = JSON.parse(JSON.stringify(currentPolicy));
      if (!policyCopy.bindings) {
        policyCopy.bindings = [];
      }
      setEditablePolicy(policyCopy);
      setNewMemberInputs({});
      setError(null);
    }
  }, [isOpen, currentPolicy]);

  const updateBindings = (updateFn: (draftBindings: any[]) => any[]) => {
    setEditablePolicy((prevPolicy: any) => {
      const newPolicy = JSON.parse(JSON.stringify(prevPolicy));
      newPolicy.bindings = updateFn(newPolicy.bindings || []);
      return newPolicy;
    });
  };

  const handleAddBinding = () => {
    updateBindings(bindings => [...bindings, { role: DEFAULT_ROLE, members: [] }]);
  };

  const handleRemoveBinding = (index: number) => {
    updateBindings(bindings => bindings.filter((_, i) => i !== index));
  };

  const handleBindingChange = (index: number, field: string, value: string) => {
    updateBindings(bindings => {
      bindings[index][field] = value;
      return bindings;
    });
  };

  const handleRemoveMember = (bindingIndex: number, memberIndex: number) => {
    updateBindings(bindings => {
      bindings[bindingIndex].members.splice(memberIndex, 1);
      return bindings;
    });
  };

  const handleAddMember = (bindingIndex: number) => {
    const rawInput = newMemberInputs[bindingIndex] || '';
    const membersToAdd = rawInput
      .split(/[\s,]+/)
      .map(m => m.trim())
      .filter(m => m !== '')
      .map(m => {
        if (!m.includes(':')) {
          return `user:${m}`;
        }
        return m;
      });

    if (membersToAdd.length === 0) return;

    updateBindings(bindings => {
      const binding = bindings[bindingIndex];
      const existingMembers = new Set(binding.members || []);
      membersToAdd.forEach(member => existingMembers.add(member));
      binding.members = Array.from(existingMembers);
      return bindings;
    });
    setNewMemberInputs(prev => ({ ...prev, [bindingIndex]: '' }));
  };

  const handleConditionChange = (bindingIndex: number, field: 'title' | 'description' | 'expression', value: string) => {
    updateBindings(bindings => {
      if (bindings[bindingIndex].condition) {
        bindings[bindingIndex].condition[field] = value;
      }
      return bindings;
    });
  };

  const handleAddCondition = (bindingIndex: number) => {
    updateBindings(bindings => {
      bindings[bindingIndex].condition = { title: '', description: '', expression: '' };
      return bindings;
    });
  };

  const handleRemoveCondition = (bindingIndex: number) => {
    updateBindings(bindings => {
      delete bindings[bindingIndex].condition;
      return bindings;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editablePolicy || !currentPolicy?.etag) {
      setError("Cannot update policy: ETag is missing. Please fetch the policy again.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const finalPolicy = JSON.parse(JSON.stringify(editablePolicy));
      finalPolicy.bindings = (finalPolicy.bindings || []).filter(
        (b: any) => b.members && b.members.length > 0 && b.role && b.role.trim() !== ''
      );
      finalPolicy.etag = currentPolicy.etag;

      let responsePolicy: any;
      if (resourceType === 'engine') {
        responsePolicy = await api.setEngineIamPolicy(resourceId, finalPolicy, config);
      } else if (resourceType === 'connector') {
        responsePolicy = await api.setCollectionIamPolicy(resourceId, finalPolicy, config);
      } else {
        // datastore or entity
        responsePolicy = await api.setDataStoreIamPolicy(resourceId, finalPolicy, config);
      }

      onSuccess(responsePolicy);
    } catch (err: any) {
      setError(err.message || "An unknown error occurred while updating the policy.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !editablePolicy) return null;

  const resourceTypeLabel =
    resourceType === 'engine'
      ? 'App Engine'
      : resourceType === 'connector'
      ? 'DataConnector Collection'
      : resourceType === 'entity'
      ? 'DataConnector Entity DataStore'
      : 'Legacy DataStore';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-700 animate-fade-in">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <header className="p-5 border-b border-gray-700 bg-gray-800/90 shrink-0">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">Edit Resource IAM Policy</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-900/60 text-purple-300 border border-purple-700">
                    {resourceTypeLabel}
                  </span>
                </div>
                <p className="text-sm text-gray-300 mt-1 font-medium">{resourceDisplayName || resourceId}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5 break-all">{resourcePath}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          <main className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="bg-blue-900/20 border border-blue-800/60 p-3.5 rounded-lg text-xs text-blue-200">
              <p className="font-semibold mb-1 uppercase tracking-wider text-blue-300">Gemini Enterprise Access Control Pattern:</p>
              <p className="mb-2">
                Assign <code>roles/discoveryengine.agentspaceUser</code> to end users or groups to grant access to this resource in the GE Web App.
              </p>
              <div className="text-[11px] text-gray-400">
                Supported Member Formats: <code>user:alice@example.com</code>, <code>group:analytics-team@example.com</code>, <code>serviceAccount:...</code>
              </div>
            </div>

            {editablePolicy.bindings.map((binding: any, index: number) => (
              <div key={index} className="bg-gray-900/70 p-4 rounded-lg border border-gray-700 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <h3 className="font-semibold text-white text-sm">Role Binding</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveBinding(index)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
                  >
                    Remove Binding
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">IAM Role</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={binding.role}
                      onChange={(e) => handleBindingChange(index, 'role', e.target.value)}
                      placeholder="e.g., roles/discoveryengine.agentspaceUser"
                      className="w-full bg-gray-800 border border-gray-600 rounded-md shadow-sm text-sm p-2 text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleBindingChange(index, 'role', DEFAULT_ROLE)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 rounded-md border border-gray-600 whitespace-nowrap"
                    >
                      Set agentspaceUser
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-gray-300 mb-2">Members ({binding.members?.length || 0})</h4>
                  <div className="space-y-2">
                    {binding.members && binding.members.length > 0 ? (
                      binding.members.map((member: string, memberIndex: number) => (
                        <div key={memberIndex} className="flex justify-between items-center text-xs bg-gray-800 border border-gray-700/80 px-3 py-2 rounded-md">
                          <span className="font-mono text-gray-200 truncate mr-4">{member}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(index, memberIndex)}
                            className="p-1 text-gray-400 hover:text-white hover:bg-red-600 rounded transition-colors"
                            aria-label={`Remove ${member}`}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
                            </svg>
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-500 italic py-1">No members assigned to this role.</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add member (e.g. user:userA@example.com, group:team@example.com)"
                      value={newMemberInputs[index] || ''}
                      onChange={(e) => setNewMemberInputs(prev => ({ ...prev, [index]: e.target.value }))}
                      className="flex-grow bg-gray-800 border border-gray-600 rounded-md text-sm p-2 text-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddMember(index);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddMember(index)}
                      disabled={!(newMemberInputs[index] || '').trim()}
                      className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 shrink-0 transition-colors"
                    >
                      Add Member
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-gray-400">Condition (Optional)</h4>
                  {!binding.condition ? (
                    <button
                      type="button"
                      onClick={() => handleAddCondition(index)}
                      className="mt-1 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      + Add IAM Condition
                    </button>
                  ) : (
                    <div className="mt-2 space-y-2 p-3 bg-gray-800/80 rounded-md border border-gray-700">
                      <input
                        type="text"
                        value={binding.condition.title}
                        onChange={(e) => handleConditionChange(index, 'title', e.target.value)}
                        placeholder="Condition Title"
                        className="w-full bg-gray-900 border border-gray-600 rounded-md text-xs p-2 text-white"
                      />
                      <textarea
                        value={binding.condition.description}
                        onChange={(e) => handleConditionChange(index, 'description', e.target.value)}
                        placeholder="Description"
                        className="w-full bg-gray-900 border border-gray-600 rounded-md text-xs p-2 text-white"
                        rows={2}
                      />
                      <textarea
                        value={binding.condition.expression}
                        onChange={(e) => handleConditionChange(index, 'expression', e.target.value)}
                        placeholder="CEL Expression, e.g., request.time < timestamp(...)"
                        className="w-full bg-gray-900 border border-gray-600 rounded-md text-xs p-2 font-mono text-white"
                        rows={2}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveCondition(index)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove Condition
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddBinding}
              className="mt-4 w-full py-2.5 bg-gray-800 hover:bg-gray-700 border border-dashed border-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Role Binding
            </button>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}
          </main>

          <footer className="p-4 bg-gray-900/80 border-t border-gray-700 flex justify-between items-center">
            <div className="text-xs text-gray-500 font-mono">
              ETag: {currentPolicy?.etag ? `${currentPolicy.etag.slice(0, 16)}...` : 'None'}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors shadow-md flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Save Policy'
                )}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default SetDataStoreIamPolicyModal;
