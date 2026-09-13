import React, { useState, useRef, useEffect } from 'react';

interface Props {
    title: string;
    subtitle?: string;
    viewName: string;
    datasetId?: string;
    isInstalled: boolean;
    isOperating?: boolean;
    isBroken?: boolean;
    errorMessage?: string;
    onCreate: () => void;
    onDrop: () => void;
    ddlQuery: string;
    selectQuery?: string;
}

export const ViewControlHeader: React.FC<Props> = ({
    title,
    subtitle,
    viewName,
    datasetId,
    isInstalled,
    isOperating = false,
    isBroken = false,
    errorMessage,
    onCreate,
    onDrop,
    ddlQuery,
    selectQuery
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [copiedDdl, setCopiedDdl] = useState(false);
    const [showConfirmDrop, setShowConfirmDrop] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const handleCopyDdl = () => {
        navigator.clipboard.writeText(ddlQuery);
        setCopiedDdl(true);
        setTimeout(() => setCopiedDdl(false), 2000);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
                setShowTooltip(false);
            }
        };

        if (showTooltip) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showTooltip]);

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-800 gap-3">
            <div>
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>
                    {isInstalled && !isBroken ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Live View
                        </span>
                    ) : isBroken ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/40 tracking-wider" title={errorMessage || 'View query failed in BigQuery'}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            VIEW ERROR
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/40 tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                            MOCK
                        </span>
                    )}
                </div>
                {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
                {!isInstalled && (
                    <div className="mt-2 flex items-center justify-between bg-amber-950/20 border border-amber-800/40 rounded px-2.5 py-1 text-xs text-amber-300/90">
                        <span>
                            Showing <strong>MOCK</strong> data because <code className="font-mono text-amber-300 font-bold">{viewName}</code> is not in <strong>{datasetId || 'selected source'}</strong>. Add the view to populate live data.
                        </span>
                    </div>
                )}
                {isBroken && (
                    <div className="mt-2 flex items-center justify-between bg-rose-950/20 border border-rose-800/40 rounded px-2.5 py-1 text-xs text-rose-300/90">
                        <span>
                            Existing view <code className="font-mono text-rose-300 font-bold">{viewName}</code> failed in BigQuery ({errorMessage || 'schema mismatch or invalid definition'}). Using base tables or mock data.
                        </span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {/* DDL & Query Tooltip */}
                <div className="relative" ref={tooltipRef}>
                    <button
                        type="button"
                        onClick={() => setShowTooltip(!showTooltip)}
                        className="p-1.5 text-gray-400 hover:text-blue-400 bg-gray-800 hover:bg-gray-700/80 rounded border border-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="View BigQuery SQL Definition"
                        aria-label="View BigQuery SQL Definition"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>

                    {showTooltip && (
                        <div className="absolute right-0 top-full mt-2 w-96 sm:w-[500px] p-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 text-xs">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-semibold text-blue-400 font-mono">
                                    {viewName}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopyDdl}
                                    className="px-2 py-1 text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 rounded transition-colors"
                                >
                                    {copiedDdl ? 'Copied DDL!' : 'Copy CREATE VIEW SQL'}
                                </button>
                            </div>
                            <div className="mb-2">
                                <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                                    View DDL (Creates `{viewName}`)
                                </span>
                                <div className="max-h-48 overflow-y-auto mt-1 bg-gray-950 p-2.5 rounded border border-gray-800 font-mono text-[10px] text-gray-300 whitespace-pre-wrap break-all">
                                    {ddlQuery}
                                </div>
                            </div>
                            {selectQuery && (
                                <div>
                                    <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                                        Data Query
                                    </span>
                                    <div className="max-h-36 overflow-y-auto mt-1 bg-gray-950 p-2.5 rounded border border-gray-800 font-mono text-[10px] text-gray-300 whitespace-pre-wrap break-all">
                                        {selectQuery}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Create or Drop View Button */}
                {isBroken ? (
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled={isOperating || !datasetId}
                            onClick={onCreate}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded border border-amber-500 shadow-sm transition-all flex items-center gap-1 disabled:opacity-50"
                            title={`Recreate view ${viewName} in ${datasetId || ''}`}
                        >
                            {isOperating ? 'Recreating...' : 'Recreate View'}
                        </button>
                        <button
                            type="button"
                            disabled={isOperating || !datasetId}
                            onClick={onDrop}
                            className="px-2 py-1 text-xs font-medium text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-red-900/20 border border-gray-700 hover:border-red-800/50 rounded transition-colors"
                            title={`Drop broken view ${viewName}`}
                        >
                            Drop
                        </button>
                    </div>
                ) : isInstalled ? (
                    <div className="relative">
                        {showConfirmDrop ? (
                            <div className="flex items-center gap-1.5 bg-red-950/80 border border-red-800/80 px-2 py-1 rounded">
                                <span className="text-xs text-red-300">Drop view?</span>
                                <button
                                    type="button"
                                    disabled={isOperating}
                                    onClick={() => {
                                        setShowConfirmDrop(false);
                                        onDrop();
                                    }}
                                    className="px-2 py-0.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded transition-colors disabled:opacity-50"
                                >
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmDrop(false)}
                                    className="px-2 py-0.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled={isOperating || !datasetId}
                                onClick={() => setShowConfirmDrop(true)}
                                className="px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-red-900/20 border border-gray-700 hover:border-red-800/50 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                                title={`Drop ${viewName} from BigQuery`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Drop View
                            </button>
                        )}
                    </div>
                ) : (
                    <button
                        type="button"
                        disabled={isOperating || !datasetId}
                        onClick={onCreate}
                        className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded border border-blue-500 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                        title={`Deploy ${viewName} into your BigQuery dataset ${datasetId || ''}`}
                    >
                        {isOperating ? (
                            <>
                                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                Creating...
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add View to BigQuery
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};
