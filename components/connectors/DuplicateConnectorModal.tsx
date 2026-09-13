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

import React, { useRef } from "react";
import WizardStepper from "../WizardStepper";
import { useDuplicateConnector } from "../../hooks/useDuplicateConnector";
import { useModalA11y } from "../../hooks/useModalA11y";
import { DuplicateStepDestination } from "./duplicate/DuplicateStepDestination";
import { DuplicateStepIdentifier } from "./duplicate/DuplicateStepIdentifier";
import { DuplicateStepCredentials } from "./duplicate/DuplicateStepCredentials";
import { DuplicateStepReview } from "./duplicate/DuplicateStepReview";
import { DuplicateModalFooter } from "./duplicate/DuplicateModalFooter";

export {
  discoverFields,
  buildDuplicatePayload,
  type FormField,
  tooltipTexts,
} from "./duplicate/duplicateFieldUtils";

interface DuplicateConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sourceCollectionName: string;
  sourceConnectorState: any;
  currentProjectId: string;
  currentLocation: string;
}

const DuplicateConnectorModal: React.FC<DuplicateConnectorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  sourceCollectionName,
  sourceConnectorState,
  currentProjectId,
  currentLocation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    sourceCollectionId,
    currentStep,
    setCurrentStep,
    steps,
    targetProjectId,
    setTargetProjectId,
    targetLocation,
    setTargetLocation,
    targetCollectionId,
    setTargetCollectionId,
    targetCollectionDisplayName,
    setTargetCollectionDisplayName,
    fieldValues,
    handleFieldChange,
    includeActions,
    setIncludeActions,
    formFields,
    validationError,
    isSubmitting,
    submitError,
    handleNext,
    handleBack,
    handleSubmit,
    finalPayload,
  } = useDuplicateConnector({
    isOpen,
    onSuccess,
    sourceCollectionName,
    sourceConnectorState,
    currentProjectId,
    currentLocation,
  });

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isSubmitting,
  });

  // NOTE: This early return MUST stay below every hook call above.
  if (!isOpen) return null;

  const isAtlassian = ["jira", "confluence"].includes(
    sourceConnectorState?.dataSource?.toLowerCase(),
  );
  const isMicrosoft = ["sharepoint", "onedrive", "outlook", "teams"].includes(
    sourceConnectorState?.dataSource?.toLowerCase(),
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-connector-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700 ring-1 ring-white/10 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 bg-gray-900/40 flex justify-between items-center rounded-t-lg shrink-0">
          <h2 id="duplicate-connector-title" className="text-xl font-bold text-white flex items-center gap-2">
            <svg
              className="w-5 h-5 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
              />
            </svg>
            Duplicate Connector: {sourceCollectionId}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <main className="flex-1 overflow-auto p-6 bg-gray-900 flex flex-col">
          <WizardStepper
            currentStep={currentStep}
            steps={steps}
            onStepClick={(step) => {
              if (step < currentStep) setCurrentStep(step);
            }}
          />

          <div className="flex-1">
            {/* Step 1: Destination */}
            {currentStep === 1 && (
              <DuplicateStepDestination
                targetProjectId={targetProjectId}
                setTargetProjectId={setTargetProjectId}
                targetLocation={targetLocation}
                setTargetLocation={setTargetLocation}
                hasActionConfig={Boolean(sourceConnectorState?.actionConfig)}
                includeActions={includeActions}
                setIncludeActions={setIncludeActions}
              />
            )}

            {/* Step 2: Identification */}
            {currentStep === 2 && (
              <DuplicateStepIdentifier
                targetCollectionId={targetCollectionId}
                setTargetCollectionId={setTargetCollectionId}
                targetCollectionDisplayName={targetCollectionDisplayName}
                setTargetCollectionDisplayName={setTargetCollectionDisplayName}
              />
            )}

            {/* Step 3: Credentials */}
            {currentStep === 3 && (
              <DuplicateStepCredentials
                dataSource={sourceConnectorState?.dataSource}
                isAtlassian={isAtlassian}
                isMicrosoft={isMicrosoft}
                formFields={formFields}
                fieldValues={fieldValues}
                onFieldChange={handleFieldChange}
              />
            )}

            {/* Step 4: Review */}
            {currentStep === 4 && (
              <DuplicateStepReview
                targetProjectId={targetProjectId}
                targetLocation={targetLocation}
                targetCollectionId={targetCollectionId}
                targetCollectionDisplayName={targetCollectionDisplayName}
                finalPayload={finalPayload}
              />
            )}
          </div>

          {validationError && (
            <div className="mt-4 p-2.5 bg-red-950/40 border border-red-900/50 rounded text-xs text-red-300 flex items-center gap-1.5">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              {validationError}
            </div>
          )}

          {submitError && (
            <div className="mt-4 p-3 bg-red-950/40 border border-red-900/50 rounded text-xs text-red-300 flex items-start gap-1.5">
              <svg
                className="w-4 h-4 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1 break-words">{submitError}</div>
            </div>
          )}
        </main>

        <DuplicateModalFooter
          currentStep={currentStep}
          totalSteps={steps.length}
          isSubmitting={isSubmitting}
          onBack={handleBack}
          onClose={onClose}
          onNext={handleNext}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};

export default DuplicateConnectorModal;
