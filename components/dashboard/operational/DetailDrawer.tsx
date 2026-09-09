import React, { useState, useEffect } from 'react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    data: any;
    title?: string;
}

export const DetailDrawer: React.FC<Props> = ({
    isOpen,
    onClose,
    data,
    title = 'Log Record Details'
}) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen || !data) return null;

    const handleCopyJson = () => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-200">
            {/* Backdrop click area */}
            <div className="absolute inset-0" onClick={onClose} />

            {/* Slide-over panel */}
            <div className="relative w-full max-w-2xl bg-gray-900 border-l border-gray-700/80 h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="p-5 border-b border-gray-800 bg-gray-950/70 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">{title}</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Deep inspection of row attributes & payloads</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleCopyJson}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
                            title="Copy full record JSON to clipboard"
                        >
                            {copied ? (
                                <>
                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-emerald-400">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                    <span>Copy JSON</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                            title="Close drawer (Esc)"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content Attributes List */}
                <div className="p-5 flex-1 overflow-y-auto space-y-3.5 custom-scrollbar">
                    {Object.entries(data).map(([key, val]) => {
                        const isLong = typeof val === 'string' && val.length > 80;
                        const isJson = typeof val === 'object' && val !== null;
                        const isToolCall = key.toLowerCase().includes('tool');

                        return (
                            <div key={key} className="bg-gray-800/70 border border-gray-700/60 rounded-lg p-3.5">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 font-mono">
                                        {key}
                                    </span>
                                    {isToolCall && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                            Tool Call
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 text-sm text-gray-200">
                                    {isJson ? (
                                        <pre className="mt-1.5 p-3 rounded-lg bg-gray-950 font-mono text-xs text-emerald-300 overflow-x-auto border border-gray-800 leading-relaxed">
                                            {JSON.stringify(val, null, 2)}
                                        </pre>
                                    ) : isLong ? (
                                        <div className="mt-1.5 p-3 rounded-lg bg-gray-950/80 font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border border-gray-800">
                                            {String(val)}
                                        </div>
                                    ) : (
                                        <div className="font-mono text-xs text-gray-300 mt-0.5 break-all">
                                            {val === null || val === undefined ? (
                                                <span className="text-gray-500 italic">null</span>
                                            ) : (key.toLowerCase().includes('time') || key.toLowerCase().includes('timestamp')) && (typeof val === 'number' || (!isNaN(Number(val)) && Number(val) > 1000000000)) ? (
                                                new Date(Number(val) > 1e11 ? Number(val) : Number(val) * 1000).toISOString().replace('T', ' ').slice(0, 19)
                                            ) : (
                                                String(val)
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
