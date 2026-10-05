import React, { useState, useMemo, useEffect } from 'react';

export interface ColumnDef {
    key: string;
    header: string;
    type?: 'text' | 'timestamp' | 'badge' | 'mono';
}

interface Props {
    columns: ColumnDef[];
    data: any[];
    title: string;
    subtitle?: string;
    onRowClick?: (row: any) => void;
    pageSize?: number;
    isLoading?: boolean;
    isSimulated?: boolean;
}

export const DataTable: React.FC<Props> = ({
    columns,
    data = [],
    title,
    subtitle,
    onRowClick,
    pageSize = 15,
    isLoading = false,
    isSimulated = false
}) => {
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // Reset pagination when data array reference changes (e.g. switching views)
    useEffect(() => {
        setCurrentPage(1);
    }, [data]);

    const handleSort = (key: string) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
            }
            return { key, direction: 'asc' };
        });
        setCurrentPage(1);
    };

    // Filtered & sorted rows
    const filteredData = useMemo(() => {
        const base = !search.trim()
            ? data
            : data.filter(row => {
                  const q = search.toLowerCase();
                  return Object.values(row).some(val => {
                      if (val === null || val === undefined) return false;
                      return String(val).toLowerCase().includes(q);
                  });
              });

        if (!sortConfig) return base;

        const { key, direction } = sortConfig;
        return [...base].sort((a, b) => {
            const valA = a?.[key];
            const valB = b?.[key];
            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            const numA = Number(valA);
            const numB = Number(valB);
            if (!isNaN(numA) && !isNaN(numB) && String(valA).trim() !== '' && String(valB).trim() !== '') {
                return direction === 'asc' ? numA - numB : numB - numA;
            }

            const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
            return direction === 'asc' ? cmp : -cmp;
        });
    }, [data, search, sortConfig]);

    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredData.slice(start, start + pageSize);
    }, [filteredData, currentPage, pageSize]);

    // CSV Export
    const handleExportCSV = () => {
        if (!data.length) return;
        const headers = columns.map(c => c.header || c.key);
        const rows = filteredData.map(row => {
            return columns.map(c => {
                const val = row[c.key];
                if (val === null || val === undefined) return '""';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(',');
        });
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const prefix = isSimulated ? 'simulated_' : '';
        a.download = `${prefix}${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderBadge = (val: any) => {
        if (val === null || val === undefined) return <span className="text-gray-500">-</span>;
        const str = String(val).toUpperCase().trim();

        // Check negative / error statuses first to avoid false substring matches (e.g. 'DISLIKE' contains 'LIKE')
        if (str.includes('NEGATIVE') || str.includes('THUMBS_DOWN') || str.includes('DISLIKE') || str.includes('ERROR') || str.includes('FAIL') || str.includes('BLOCKED')) {
            return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">{String(val)}</span>;
        }
        if (str.includes('POSITIVE') || str.includes('THUMBS_UP') || str === 'LIKE' || str.includes('STOP') || str === 'DONE' || str === 'SUCCEEDED') {
            return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{String(val)}</span>;
        }
        if (str.includes('WARN') || str.includes('MAX_TOKENS') || str.includes('SKIPPED')) {
            return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">{String(val)}</span>;
        }
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">{String(val)}</span>;
    };

    const formatCell = (val: any, col: ColumnDef) => {
        if (val === null || val === undefined) return <span className="text-gray-500 italic">null</span>;
        if (col.type === 'timestamp' || col.key.includes('time') || col.key.includes('timestamp')) {
            try {
                // If value is a numeric epoch seconds or milliseconds (like 1.787851532467888E9)
                if (typeof val === 'number' || (!isNaN(Number(val)) && Number(val) > 1000000000)) {
                    const num = Number(val);
                    const ms = num > 1e11 ? num : num * 1000;
                    const d = new Date(ms);
                    if (!isNaN(d.getTime())) {
                        return (
                            <span className="font-mono text-xs text-gray-300 whitespace-nowrap">
                                {d.toISOString().replace('T', ' ').slice(0, 19)}
                            </span>
                        );
                    }
                }
                const str = String(val).replace('T', ' ').replace(/\.\d+Z?$/, '');
                return <span className="font-mono text-xs text-gray-300 whitespace-nowrap">{str}</span>;
            } catch {
                return <span className="font-mono text-xs text-gray-300">{String(val)}</span>;
            }
        }
        if (col.type === 'badge' || col.key.includes('status') || col.key.includes('reason') || col.key.includes('feedback') || col.key.includes('type')) {
            return renderBadge(val);
        }
        if (col.type === 'mono' || col.key.includes('id') || col.key.includes('trace') || col.key.includes('token') || col.key.includes('tools')) {
            return (
                <span className="font-mono text-xs text-gray-300 bg-gray-950/60 px-1.5 py-0.5 rounded max-w-[240px] truncate inline-block">
                    {String(val)}
                </span>
            );
        }
        return <span className="truncate max-w-[320px] inline-block text-gray-300">{String(val)}</span>;
    };

    return (
        <div className="bg-gray-800/90 border border-gray-700/80 rounded-xl overflow-hidden shadow-sm">
            {/* Table Header & Toolbar */}
            <div className="p-4 sm:p-5 border-b border-gray-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>
                        <span className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full font-mono">
                            {filteredData.length.toLocaleString()} rows
                        </span>
                        {isSimulated && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                Simulated Data
                            </span>
                        )}
                    </div>
                    {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
                </div>

                <div className="flex items-center gap-3">
                    {/* Search Input */}
                    <div className="relative">
                        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                            placeholder="Search rows..."
                            className="bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48 sm:w-64"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
                            >
                                ×
                            </button>
                        )}
                    </div>

                    {/* Export CSV Button */}
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        disabled={data.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                        title={isSimulated ? "Export simulated fallback data to CSV" : "Export current filtered data to CSV"}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>{isSimulated ? 'Export Simulated CSV' : 'Export CSV'}</span>
                    </button>
                </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-gray-900/80 uppercase text-[11px] text-gray-400 tracking-wider border-b border-gray-700/70">
                        <tr>
                            {columns.map(col => {
                                const isSorted = sortConfig?.key === col.key;
                                const ariaSort = isSorted
                                    ? sortConfig.direction === 'asc'
                                        ? 'ascending'
                                        : 'descending'
                                    : 'none';
                                return (
                                    <th
                                        key={col.key}
                                        aria-sort={ariaSort}
                                        className="px-4 py-3 font-semibold whitespace-nowrap select-none"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleSort(col.key)}
                                            className="inline-flex items-center gap-1.5 uppercase tracking-wider hover:text-white transition-colors focus:outline-none"
                                            title={`Sort by ${col.header}`}
                                        >
                                            <span>{col.header}</span>
                                            <span className={`text-[10px] ${isSorted ? 'text-blue-400 font-bold' : 'text-gray-600'}`}>
                                                {isSorted ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                            </span>
                                        </button>
                                    </th>
                                );
                            })}
                            {onRowClick && (
                                <th className="px-4 py-3 text-right font-semibold whitespace-nowrap w-16">
                                    Action
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                        {isLoading ? (
                            <tr>
                                <td colSpan={columns.length + (onRowClick ? 1 : 0)} className="py-12 text-center text-gray-400">
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent"></div>
                                        <span>Loading records from BigQuery...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : paginatedData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + (onRowClick ? 1 : 0)} className="py-12 text-center text-gray-500">
                                    {search ? 'No matching rows found.' : 'No data records available in this view.'}
                                </td>
                            </tr>
                        ) : (
                            paginatedData.map((row, idx) => (
                                <tr
                                    key={row.id || row.insertId ? `${row.id || row.insertId}` : `${row.trace || 'row'}_${idx}`}
                                    onClick={() => onRowClick && onRowClick(row)}
                                    className={`transition-colors duration-150 ${
                                        onRowClick
                                            ? 'cursor-pointer hover:bg-blue-950/30'
                                            : 'hover:bg-gray-750/50'
                                    }`}
                                >
                                    {columns.map(col => (
                                        <td key={col.key} className="px-4 py-3 whitespace-nowrap">
                                            {formatCell(row[col.key], col)}
                                        </td>
                                    ))}
                                    {onRowClick && (
                                        <td className="px-4 py-3 text-right text-gray-500 hover:text-blue-400">
                                            <span className="text-[11px] font-medium text-blue-400">Inspect →</span>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-gray-700/70 bg-gray-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
                <div>
                    Showing <span className="font-semibold text-white">{filteredData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{' '}
                    <span className="font-semibold text-white">{Math.min(currentPage * pageSize, filteredData.length)}</span> of{' '}
                    <span className="font-semibold text-white">{filteredData.length}</span> entries
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:hover:bg-gray-800 transition-colors"
                        title="First page"
                    >
                        «
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:hover:bg-gray-800 transition-colors"
                        title="Previous page"
                    >
                        ‹
                    </button>
                    <span className="px-3 py-1 font-mono text-gray-300">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages}
                        className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:hover:bg-gray-800 transition-colors"
                        title="Next page"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage >= totalPages}
                        className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:hover:bg-gray-800 transition-colors"
                        title="Last page"
                    >
                        »
                    </button>
                </div>
            </div>
        </div>
    );
};
