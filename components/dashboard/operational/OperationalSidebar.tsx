import React from 'react';
import { VIEW_CATEGORIES } from './analyticsData';

interface Props {
    activeViewId: string;
    onViewChange: (viewId: string) => void;
    installedViews: Set<string>;
    totalDeployedCount: number;
}

export const OperationalSidebar: React.FC<Props> = ({
    activeViewId,
    onViewChange,
    installedViews,
    totalDeployedCount
}) => {
    return (
        <aside className="w-full lg:w-64 shrink-0 bg-gray-900 border border-gray-700/80 rounded-xl p-3.5 space-y-4 shadow-sm">
            {/* Sidebar Header */}
            <div className="px-2 py-1 flex items-center justify-between border-b border-gray-800 pb-2.5">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
                        Operational Views
                    </span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60 font-semibold">
                    {totalDeployedCount}/11 Live
                </span>
            </div>

            {/* Navigation Categories */}
            <nav className="space-y-4 text-xs">
                {VIEW_CATEGORIES.map((category) => (
                    <div key={category.title} className="space-y-1">
                        <div className="px-2 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                            {category.title}
                        </div>
                        <div className="space-y-0.5">
                            {category.items.map((item) => {
                                const isActive = activeViewId === item.id;
                                const isInstalled = item.id === 'overview' || installedViews.has(item.id);

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => onViewChange(item.id)}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-all ${
                                            isActive
                                                ? 'bg-blue-600 text-white font-medium shadow-sm'
                                                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 pr-1">
                                            {/* Status Dot */}
                                            {item.id === 'overview' ? (
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                            ) : isInstalled ? (
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                                                    title="Live View deployed in BigQuery"
                                                />
                                            ) : (
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                                                    title="Mock View (Not yet deployed in this dataset)"
                                                />
                                            )}
                                            <span className="truncate">{item.title}</span>
                                        </div>

                                        {/* Count or Live badge */}
                                        {item.badge ? (
                                            <span
                                                className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold shrink-0 ${
                                                    isActive
                                                        ? 'bg-blue-700 text-blue-100'
                                                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                }`}
                                            >
                                                {item.badge}
                                            </span>
                                        ) : item.count !== undefined ? (
                                            <span
                                                className={`text-[10px] font-mono px-1 rounded shrink-0 ${
                                                    isActive ? 'text-blue-100' : 'text-gray-500'
                                                }`}
                                            >
                                                {item.count}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>
        </aside>
    );
};
