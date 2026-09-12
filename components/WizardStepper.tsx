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

import React from 'react';

interface WizardStepperProps {
    currentStep: number;
    steps: string[];
    onStepClick: (step: number) => void;
}

const WizardStepper: React.FC<WizardStepperProps> = ({ currentStep, steps, onStepClick }) => {
    return (
        <div className="w-full py-4 mb-6">
            <div className="flex items-center justify-center space-x-4">
                {steps.map((label, index) => {
                    const stepNum = index + 1;
                    const isActive = stepNum === currentStep;
                    const isCompleted = stepNum < currentStep;
                    
                    return (
                        <div key={index} className="flex items-center">
                            {/* Line connector */}
                            {index > 0 && (
                                <div className={`flex-1 h-1 w-12 mx-2 rounded ${isCompleted ? 'bg-teal-500' : 'bg-gray-700'}`}></div>
                            )}
                            
                            {/* Step Circle */}
                            <div 
                                onClick={() => isCompleted ? onStepClick(stepNum) : null}
                                className={`
                                    flex items-center justify-center w-8 h-8 rounded-full border-2 font-bold text-sm cursor-pointer transition-colors z-10
                                    ${isActive ? 'border-teal-500 bg-teal-900 text-white shadow-[0_0_10px_rgba(20,184,166,0.5)]' : ''}
                                    ${isCompleted ? 'border-teal-500 bg-teal-500 text-black hover:bg-teal-400' : ''}
                                    ${!isActive && !isCompleted ? 'border-gray-600 bg-gray-800 text-gray-400' : ''}
                                `}
                            >
                                {isCompleted ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                ) : stepNum}
                            </div>
                            
                            {/* Label (Hidden on small screens if needed, but keeping for now) */}
                            <span 
                                className={`ml-2 text-sm font-medium ${isActive ? 'text-teal-400' : isCompleted ? 'text-gray-300' : 'text-gray-500'}`}
                            >
                                {label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WizardStepper;
