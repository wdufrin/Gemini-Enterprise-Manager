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


import React, { useState, useEffect, useRef } from 'react';
import { Agent, Config, IamPolicy, IamBinding } from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';

interface SetIamPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedPolicy: IamPolicy) => void;
  agent: Agent;
  config: Config;
  currentPolicy: IamPolicy | null;
}

const SetIamPolicyModal: React.FC<SetIamPolicyModalProps> = ({ isOpen, onClose, onSuccess, agent, config, currentPolicy }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editablePolicy, setEditablePolicy] = useState<IamPolicy | null>(null);
  const [newMemberInputs, setNewMemberInputs] = useState<{ [key: number]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isSubmitting,
  });

  useEffect(() => {
    if (isOpen && currentPolicy) {
      const policyCopy: IamPolicy = JSON.parse(JSON.stringify(currentPolicy));
      if (!policyCopy.bindings) {
        policyCopy.bindings = [];
      }
      setEditablePolicy(policyCopy);
      setNewMemberInputs({});
      setError(null);
    }
  }, [isOpen, currentPolicy]);

  const updateBindings = (updateFn: (draftBindings: IamBinding[]) => IamBinding[]) => {
    setEditablePolicy((prevPolicy: IamPolicy | null) => {
      if (!prevPolicy) return null;
      const newPolicy: IamPolicy = JSON.parse(JSON.stringify(prevPolicy));
      newPolicy.bindings = updateFn(newPolicy.bindings || []);
      return newPolicy;
    });
  };

  const handleAddBinding = () => {
    updateBindings(bindings => [...bindings, { role: 'roles/discoveryengine.agentUser', members: [] }]);
  };

  const handleRemoveBinding = (index: number) => {
    updateBindings(bindings => bindings.filter((_, i) => i !== index));
  };
  
  const handleBindingChange = (index: number, field: string, value: string) => {
      updateBindings(bindings => {
          (bindings[index] as unknown as Record<string, unknown>)[field] = value;
          return bindings;
      });
  };

  const handleRemoveMember = (bindingIndex: number, memberIndex: number) => {
    updateBindings(bindings => {
      const members = bindings[bindingIndex].members || [];
      members.splice(memberIndex, 1);
      bindings[bindingIndex].members = members;
      return bindings;
    });
  };

  const handleAddMember = (bindingIndex: number) => {
    const membersToAdd = (newMemberInputs[bindingIndex] || '').split(/[\s,]+/).filter(m => m.trim() !== '');
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
              bindings[bindingIndex].condition![field] = value;
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
        const finalPolicy: IamPolicy = JSON.parse(JSON.stringify(editablePolicy));
        finalPolicy.bindings = (finalPolicy.bindings || []).filter((b: IamBinding) => b.members && b.members.length > 0 && b.role && b.role.trim() !== '');
        finalPolicy.etag = currentPolicy.etag;

        const hasConditions = (finalPolicy.bindings || []).some((b: IamBinding) => b.condition);
        if (hasConditions) {
            finalPolicy.version = 3;
        } else if (finalPolicy.version === 3) {
            // If we remove the last condition, we should still submit with v3 to correctly process the removal.
            finalPolicy.version = 3;
        } else {
            delete finalPolicy.version; 
        }
        
        const responsePolicy = await api.setAgentIamPolicy(agent.name, finalPolicy, config);
        onSuccess(responsePolicy);
    } catch (err: unknown) {
        setError(toErrorMessage(err, "An unknown error occurred while updating the policy."));
    } finally {
        setIsSubmitting(false);
    }
  };
  
  if (!isOpen || !editablePolicy) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="set-iam-policy-title"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-700"
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <header className="p-4 border-b border-gray-700 shrink-0 flex justify-between items-start">
            <div>
              <h2 id="set-iam-policy-title" className="text-xl font-bold text-white">Edit IAM Policy for Agent</h2>
              <p className="text-sm text-gray-400 mt-1">{agent.displayName}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close dialog"
              className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          <main className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="bg-blue-900/20 border border-blue-800 p-3 rounded-md text-xs text-blue-300 mb-4">
                  <p className="font-bold mb-1 uppercase tracking-wider">Supported Principal Formats:</p>
                  <ul className="list-disc list-inside space-y-1">
                      <li><strong>Users:</strong> <code>user:someone@example.com</code></li>
                      <li><strong>Groups:</strong> <code>group:admins@example.com</code></li>
                      <li><strong>Service Accounts:</strong> <code>serviceAccount:my-sa@project.iam.gserviceaccount.com</code></li>
                      <li><strong>WIF Principals:</strong> <code>principal://iam.googleapis.com/projects/NUM/locations/global/workloadIdentityPools/POOL/subject/SUB</code></li>
                      <li><strong>WIF Groups/Sets:</strong> <code>principalSet://iam.googleapis.com/projects/NUM/locations/global/workloadIdentityPools/POOL/group/GRP</code></li>
                  </ul>
              </div>

              {(editablePolicy.bindings || []).map((binding: IamBinding, index: number) => (
                <div key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-white">Role Binding #{index + 1}</h3>
                    <button type="button" onClick={() => handleRemoveBinding(index)} className="text-sm text-red-400 hover:text-red-300">Remove Binding</button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400">Role</label>
                    <input type="text" value={binding.role} onChange={(e) => handleBindingChange(index, 'role', e.target.value)} placeholder="e.g., roles/discoveryengine.agentUser" className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm p-2 text-white" />
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-400">Members</h4>
                    <div className="mt-2 space-y-2">
                      {(binding.members || []).length > 0 ? (
                        (binding.members || []).map((member: string, memberIndex: number) => (
                          <div key={memberIndex} className="flex justify-between items-center text-sm bg-gray-700 px-3 py-1.5 rounded-md">
                            <span className="font-mono text-gray-300 truncate mr-4">{member}</span>
                            <button type="button" onClick={() => handleRemoveMember(index, memberIndex)} className="p-1 text-gray-400 hover:text-white hover:bg-red-500 rounded-full shrink-0" aria-label={`Remove ${member}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
                            </button>
                          </div>
                        ))
                      ) : ( <p className="text-xs text-gray-500 italic">No members assigned.</p> )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <input 
                        type="text" 
                        placeholder="user:..., principal://..., principalSet://..." 
                        value={newMemberInputs[index] || ''} 
                        onChange={(e) => setNewMemberInputs(prev => ({...prev, [index]: e.target.value}))} 
                        className="flex-grow bg-gray-700 border border-gray-600 rounded-md text-sm p-2 text-white" 
                      />
                      <button type="button" onClick={() => handleAddMember(index)} disabled={!(newMemberInputs[index] || '').trim()} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-500 shrink-0">Add Member</button>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-400">Condition</h4>
                    {!binding.condition ? (
                       <button type="button" onClick={() => handleAddCondition(index)} className="mt-2 text-sm text-blue-400 hover:text-blue-300">+ Add Condition</button>
                    ) : (
                       <div className="mt-2 space-y-2 p-3 bg-gray-700/50 rounded-md">
                           <input type="text" value={binding.condition.title} onChange={(e) => handleConditionChange(index, 'title', e.target.value)} placeholder="Title" className="w-full bg-gray-800 border-gray-600 rounded-md text-sm p-2 text-white" />
                           <textarea value={binding.condition.description} onChange={(e) => handleConditionChange(index, 'description', e.target.value)} placeholder="Description" className="w-full bg-gray-800 border-gray-600 rounded-md text-sm p-2 text-white" rows={2} />
                           <textarea value={binding.condition.expression} onChange={(e) => handleConditionChange(index, 'expression', e.target.value)} placeholder="CEL Expression, e.g., request.time < timestamp(...)" className="w-full bg-gray-800 border-gray-600 rounded-md text-sm p-2 font-mono text-white" rows={3} />
                           <button type="button" onClick={() => handleRemoveCondition(index)} className="text-xs text-red-400 hover:text-red-300">Remove Condition</button>
                       </div>
                    )}
                  </div>

                </div>
              ))}
              <button type="button" onClick={handleAddBinding} className="mt-4 w-full text-center px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600">+ Add Role Binding</button>
              {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
            </main>

            <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3">
                <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
            </footer>
        </form>
      </div>
    </div>
  );
};

export default SetIamPolicyModal;
