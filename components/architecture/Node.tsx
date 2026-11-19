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


import React, { memo } from 'react';
import { Handle, Position, NodeProps as ReactFlowNodeProps } from 'reactflow';
import { NodeType } from '../../types';

interface NodeData {
    label: string;
    type: NodeType;
    fullId: string;
    isDimmed?: boolean;
}

const ICONS: Record<NodeType, React.ReactElement> = {
    Project: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>,
    Location: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 21l-4.95-6.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>,
    Collection: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3.5A1.5 1.5 0 014.5 2h11A1.5 1.5 0 0117 3.5v1.996c0 .414-.162.79-.44 1.07l-1.1 1.1a.5.5 0 01-.707 0l-1.1-1.1a1.5 1.5 0 00-2.122 0l-1.1 1.1a.5.5 0 01-.707 0l-1.1-1.1a1.5 1.5 0 00-2.122 0l-1.1 1.1a.5.5 0 01-.707 0l-1.1-1.1A1.5 1.5 0 013 5.496V3.5z" /><path d="M3 9.5A1.5 1.5 0 014.5 8h11A1.5 1.5 0 0117 9.5v5A1.5 1.5 0 0115.5 16h-11A1.5 1.5 0 013 14.5v-5z" /></svg>,
    Engine: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>,
    Assistant: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 00-1-1V6a1 1 0 011-1h3a1 1 0 011 1v.5a1.5 1.5 0 003 0V3.5z" /></svg>,
    Agent: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>,
    ReasoningEngine: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zM5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" /></svg>,
    DataStore: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" /><path d="M3 8a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" /><path d="M3 12a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" /></svg>,
    Authorization: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" /></svg>,
    CloudRunService: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" /></svg>,
};

const NODE_COLORS: Record<NodeType, { border: string; bg: string; iconBg: string; iconColor: string }> = {
    Project: { border: 'border-blue-500', bg: 'bg-gray-800', iconBg: 'bg-blue-500/20', iconColor: 'text-blue-400' },
    Location: { border: 'border-emerald-500', bg: 'bg-gray-800', iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' },
    Collection: { border: 'border-gray-500', bg: 'bg-gray-800', iconBg: 'bg-gray-500/20', iconColor: 'text-gray-400' },
    Engine: { border: 'border-violet-500', bg: 'bg-gray-800', iconBg: 'bg-violet-500/20', iconColor: 'text-violet-400' },
    Assistant: { border: 'border-orange-500', bg: 'bg-gray-800', iconBg: 'bg-orange-500/20', iconColor: 'text-orange-400' },
    Agent: { border: 'border-pink-500', bg: 'bg-gray-800', iconBg: 'bg-pink-500/20', iconColor: 'text-pink-400' },
    ReasoningEngine: { border: 'border-red-500', bg: 'bg-gray-800', iconBg: 'bg-red-500/20', iconColor: 'text-red-400' },
    DataStore: { border: 'border-cyan-500', bg: 'bg-gray-800', iconBg: 'bg-cyan-500/20', iconColor: 'text-cyan-400' },
    Authorization: { border: 'border-amber-500', bg: 'bg-gray-800', iconBg: 'bg-amber-500/20', iconColor: 'text-amber-400' },
    CloudRunService: { border: 'border-teal-500', bg: 'bg-gray-800', iconBg: 'bg-teal-500/20', iconColor: 'text-teal-400' },
};

const CustomNode: React.FC<ReactFlowNodeProps<NodeData>> = ({ data, selected }) => {
    const colors = NODE_COLORS[data.type] || NODE_COLORS.Project;
    
    return (
        <div
            className={`
                w-64 rounded-lg shadow-xl overflow-hidden transition-all duration-300
                border-2 ${selected ? 'border-white ring-2 ring-white/50 scale-105' : `border-transparent hover:border-gray-600`}
                ${data.isDimmed ? 'opacity-30 grayscale blur-[1px]' : 'opacity-100'}
                bg-gray-800
            `}
            title={data.fullId}
        >
            {/* Top accent bar */}
            <div className={`h-1.5 w-full ${colors.iconBg.replace('/20', '')}`}></div>
            
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className={`p-2 rounded-lg ${colors.iconBg} ${colors.iconColor}`}>
                        {ICONS[data.type]}
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{data.type}</span>
                </div>
                
                <p className="text-sm font-bold text-gray-100 truncate mb-1" title={data.label}>
                    {data.label}
                </p>
                
                <p className="text-[10px] text-gray-400 font-mono truncate bg-gray-900/60 p-1.5 rounded border border-gray-700/50">
                    {data.fullId.split('/').pop()}
                </p>
            </div>

            <Handle 
                type="target" 
                position={Position.Top} 
                className="!w-3 !h-3 !bg-gray-600 !border-2 !border-gray-800" 
            />
            <Handle 
                type="source" 
                position={Position.Bottom} 
                className="!w-3 !h-3 !bg-gray-600 !border-2 !border-gray-800" 
            />
        </div>
    );
};

export default memo(CustomNode);
