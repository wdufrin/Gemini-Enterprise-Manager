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

import { useState, useEffect, useMemo } from 'react';
import * as api from '../services/apiService';
import { Config, DataConnector } from '../types';
import {
  discoverFields,
  buildDuplicatePayload,
} from '../components/connectors/duplicate/duplicateFieldUtils';
import { toErrorMessage } from '../utils/errors';

interface UseDuplicateConnectorProps {
  isOpen: boolean;
  onSuccess: () => void;
  sourceCollectionName: string;
  sourceConnectorState: DataConnector | null | Record<string, unknown>;
  currentProjectId: string;
  currentLocation: string;
}

export function useDuplicateConnector({
  isOpen,
  onSuccess,
  sourceCollectionName,
  sourceConnectorState,
  currentProjectId,
  currentLocation,
}: UseDuplicateConnectorProps) {
  const sourceCollectionId = sourceCollectionName.split('/').pop() || '';

  // Wizard Step State
  const [currentStep, setCurrentStep] = useState(1);

  // Target Destination Configuration
  const [targetProjectId, setTargetProjectId] = useState(currentProjectId);
  const [targetLocation, setTargetLocation] = useState(currentLocation);
  const [targetCollectionId, setTargetCollectionId] = useState(`${sourceCollectionId}-clone`);
  const [targetCollectionDisplayName, setTargetCollectionDisplayName] = useState(`Cloned ${sourceCollectionId}`);

  // Credentials / Fields Values State
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [includeActions, setIncludeActions] = useState(true);

  // Parse fields
  const formFields = useMemo(() => {
    return discoverFields(sourceConnectorState, includeActions);
  }, [sourceConnectorState, includeActions]);

  // Pre-populate defaults once when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setTargetProjectId(currentProjectId);
      setTargetLocation(currentLocation);
      setTargetCollectionId(`${sourceCollectionId}-clone`);
      setTargetCollectionDisplayName(`Cloned ${sourceCollectionId}`);
      setValidationError(null);
      setSubmitError(null);

      // Default includeActions to false for OneDrive and SharePoint
      const ds = sourceConnectorState && 'dataSource' in sourceConnectorState && typeof sourceConnectorState.dataSource === 'string'
        ? sourceConnectorState.dataSource.toLowerCase()
        : '';
      const defaultInclude = !['sharepoint', 'onedrive', 'ms-onedrive'].includes(ds);
      setIncludeActions(defaultInclude);

      const initialFields = discoverFields(sourceConnectorState, defaultInclude);
      const initialValues: Record<string, unknown> = {};
      initialFields.forEach((field) => {
        const valueKey = `${field.location}.${field.key}`;
        initialValues[valueKey] = field.defaultValue ?? '';
      });
      setFieldValues(initialValues);
    }
  }, [isOpen, currentProjectId, currentLocation, sourceCollectionId, sourceConnectorState]);

  const handleFieldChange = (fieldKey: string, value: string | boolean) => {
    setFieldValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const steps = ['Destination', 'Identifier', 'Credentials', 'Review'];

  // Helper to validate current step before proceeding
  const validateStep = () => {
    setValidationError(null);
    if (currentStep === 1) {
      if (!targetProjectId.trim()) {
        setValidationError('Target Project ID / Number is required.');
        return false;
      }
      if (!targetLocation.trim()) {
        setValidationError('Target Region / Location is required.');
        return false;
      }
    } else if (currentStep === 2) {
      if (!targetCollectionId.trim()) {
        setValidationError('Target Collection ID is required.');
        return false;
      }
      if (!/^[a-z0-9-_]{1,63}$/.test(targetCollectionId)) {
        setValidationError(
          'Collection ID must be lowercase alphanumeric, dashes, or underscores, up to 63 characters.'
        );
        return false;
      }
      if (!targetCollectionDisplayName.trim()) {
        setValidationError('Target Collection Display Name is required.');
        return false;
      }
    } else if (currentStep === 3) {
      // Validate required fields in Step 3
      for (const field of formFields) {
        if (field.required) {
          const valueKey = `${field.location}.${field.key}`;
          const val = fieldValues[valueKey];
          if (
            val === undefined ||
            val === null ||
            (typeof val === 'string' && !val.trim())
          ) {
            setValidationError(`Credential '${field.label}' is required.`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length));
    }
  };

  const handleBack = () => {
    setValidationError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Re-construct the full payload for setUpDataConnector
  const finalPayload = useMemo(() => {
    return buildDuplicatePayload({
      sourceConnectorState,
      targetCollectionId,
      targetCollectionDisplayName,
      fieldValues,
      includeActions,
    });
  }, [
    sourceConnectorState,
    targetCollectionId,
    targetCollectionDisplayName,
    fieldValues,
    includeActions,
  ]);

  const handleSubmit = async () => {
    if (!validateStep()) return;
    if (!finalPayload) {
      setSubmitError('Failed to build configuration payload.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    const config: Config = {
      projectId: targetProjectId,
      appLocation: targetLocation,
      collectionId: targetCollectionId,
      appId: '',
      assistantId: '',
    };

    try {
      await api.setUpDataConnector(finalPayload, config);
      setIsSubmitting(false);
      onSuccess();
    } catch (err: unknown) {
      console.error('Failed to set up duplicated connector:', err);
      setSubmitError(toErrorMessage(err, 'Failed to duplicate data connector.'));
      setIsSubmitting(false);
    }
  };

  return {
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
    validateStep,
    handleNext,
    handleBack,
    handleSubmit,
    finalPayload,
  };
}
