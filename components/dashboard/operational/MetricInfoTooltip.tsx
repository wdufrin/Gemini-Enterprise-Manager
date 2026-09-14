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

import React, { useState, useRef, useEffect } from 'react';

export interface MetricInfoTooltipProps {
    title: string;
    whatItShows: string;
    meaning?: string;
    formula?: string;
    sourceTables?: string[];
    fieldsUsed?: string[];
    align?: 'left' | 'right';
    buttonClassName?: string;
}

export const MetricInfoTooltip: React.FC<MetricInfoTooltipProps> = ({
    title,
    whatItShows,
    meaning,
    formula,
    sourceTables,
    fieldsUsed,
    align = 'right',
    buttonClassName = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative inline-block" ref={popoverRef}>
            <button
                type="button"
                aria-label={`Info about ${title}`}
                title={`Info about ${title}`}
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={`p-1 rounded-full text-gray-400 hover:text-blue-400 hover:bg-gray-800/80 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${buttonClassName}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>

            {isOpen && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute z-50 top-full mt-2 w-80 sm:w-96 p-3.5 bg-gray-900 text-gray-200 text-xs rounded-xl shadow-2xl border border-gray-700 font-sans ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800">
                        <div className="flex items-center gap-1.5 font-semibold text-white">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            <span>{title}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-white text-base leading-none px-1"
                        >
                            ×
                        </button>
                    </div>

                    <div className="space-y-2.5 text-[11px] leading-relaxed">
                        <div>
                            <span className="text-[10px] uppercase font-semibold text-blue-400 tracking-wider block mb-0.5">
                                What this shows
                            </span>
                            <p className="text-gray-300">{whatItShows}</p>
                        </div>

                        {meaning && (
                            <div>
                                <span className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider block mb-0.5">
                                    Metric Meaning & Significance
                                </span>
                                <p className="text-gray-300">{meaning}</p>
                            </div>
                        )}

                        {formula && (
                            <div>
                                <span className="text-[10px] uppercase font-semibold text-purple-400 tracking-wider block mb-0.5">
                                    Calculation / SQL Formula
                                </span>
                                <code className="block bg-gray-950 px-2 py-1 rounded font-mono text-[10px] text-purple-300 border border-gray-800 break-all">
                                    {formula}
                                </code>
                            </div>
                        )}

                        {sourceTables && sourceTables.length > 0 && (
                            <div>
                                <span className="text-[10px] uppercase font-semibold text-amber-400 tracking-wider block mb-1">
                                    Source BigQuery Tables
                                </span>
                                <div className="flex flex-wrap gap-1">
                                    {sourceTables.map((tbl) => (
                                        <code
                                            key={tbl}
                                            className="bg-gray-950 px-1.5 py-0.5 rounded font-mono text-[10px] text-amber-300 border border-gray-800 break-all"
                                            title={tbl}
                                        >
                                            {tbl}
                                        </code>
                                    ))}
                                </div>
                            </div>
                        )}

                        {fieldsUsed && fieldsUsed.length > 0 && (
                            <div>
                                <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider block mb-0.5">
                                    Underlying Log Fields
                                </span>
                                <p className="text-gray-400 font-mono text-[10px]">
                                    {fieldsUsed.join(', ')}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Small arrow indicator */}
                    <div
                        className={`absolute bottom-full transform w-2 h-2 bg-gray-900 border-l border-t border-gray-700 rotate-45 -mb-1 ${
                            align === 'right' ? 'right-3' : 'left-3'
                        }`}
                    />
                </div>
            )}
        </div>
    );
};
