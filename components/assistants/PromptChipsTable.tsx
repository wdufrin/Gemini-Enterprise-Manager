import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/apiService';
import PromptChipModal from './PromptChipModal';
import DestructiveConfirmModal from '../DestructiveConfirmModal';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';

interface PromptChip {
    name: string;
    status: string;
    displayName: string;
    title: string;
    type: 'Google-made' | 'Custom';
    raw?: any;
}

interface PromptChipRowProps {
    chip: PromptChip;
    onEdit: (raw: any) => void;
    onDelete: (chip: PromptChip) => void;
}

const PromptChipRow = React.memo<PromptChipRowProps>(({ chip, onEdit, onDelete }) => (
    <tr className="hover:bg-gray-750">
        <td className="px-4 py-3 font-mono text-xs">{chip.name}</td>
        <td className="px-4 py-3">
            <span className="flex items-center">
                <span className={`w-2 h-2 rounded-full mr-1.5 ${chip.status === 'Enabled' ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                {chip.status}
            </span>
        </td>
        <td className="px-4 py-3 text-gray-400">{chip.displayName}</td>
        <td className="px-4 py-3">{chip.title}</td>
        <td className="px-4 py-3">
            <div className="flex space-x-2">
                <button 
                    onClick={() => onEdit(chip.raw)}
                    className="text-gray-400 hover:text-white" 
                    title="Edit"
                    aria-label={`Edit ${chip.title || chip.name}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button 
                    onClick={() => onDelete(chip)}
                    className="text-gray-400 hover:text-red-400" 
                    title="Delete"
                    aria-label={`Delete ${chip.title || chip.name}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
        </td>
    </tr>
));

PromptChipRow.displayName = 'PromptChipRow';

interface PromptChipsTableProps {
    engineName: string;
}

const PromptChipsTable: React.FC<PromptChipsTableProps> = ({ engineName }) => {
    const { toast } = useToast();
    const [chips, setChips] = useState<PromptChip[]>([]);
    const [activeTab, setActiveTab] = useState<'All' | 'Google-made' | 'Our prompts'>('All');

    const [isLoading, setIsLoading] = useState(false);
    const [filterText, setFilterText] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedChip, setSelectedChip] = useState<any | null>(null);
    const [chipToDelete, setChipToDelete] = useState<PromptChip | null>(null);
    const [isDeletingChip, setIsDeletingChip] = useState(false);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    const triggerReload = () => setReloadTrigger(prev => prev + 1);

    const handleEdit = useCallback((raw: any) => {
        setSelectedChip(raw);
        setIsModalOpen(true);
    }, []);

    const handleDelete = useCallback((chip: PromptChip) => {
        setChipToDelete(chip);
    }, []);

    useEffect(() => {
        const fetchChips = async () => {
            setIsLoading(true);
            try {
                const data = await api.listPromptChips(engineName);
                setChips(data as PromptChip[]);
            } catch (err) {
                console.error("Failed to fetch prompt chips", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchChips();
    }, [engineName, reloadTrigger]);

    const filteredChips = chips.filter(chip => {
        const matchesTab = 
            activeTab === 'All' || 
            (activeTab === 'Google-made' && chip.type === 'Google-made') ||
            (activeTab === 'Our prompts' && chip.type === 'Custom');
        
        const matchesSearch = 
            chip.name.toLowerCase().includes(filterText.toLowerCase()) ||
            chip.title.toLowerCase().includes(filterText.toLowerCase());

        const isGoogle = chip.type === 'Google-made';
        const hasDropdowns = chip.raw?.defaultTexts?.suggestedPrompts && chip.raw.defaultTexts.suggestedPrompts.length > 0;
        const matchesVisibility = !isGoogle || hasDropdowns;

        return matchesTab && matchesSearch && matchesVisibility;
    });

    return (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Prompt chips</h3>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => setActiveTab('All')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'All' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                        All
                    </button>
                    <button 
                        onClick={() => setActiveTab('Google-made')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'Google-made' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                        Google-made
                    </button>
                    <button 
                        onClick={() => setActiveTab('Our prompts')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'Our prompts' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                        Our prompts
                    </button>
                </div>
                <button 
                    onClick={() => { setSelectedChip(null); setIsModalOpen(true); }}
                    className="flex items-center text-blue-400 hover:text-blue-300 font-semibold text-sm"
                >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    New prompt
                </button>
            </div>



            <div className="flex items-center bg-gray-700 rounded-md px-3 py-1.5 w-full max-w-xs border border-gray-600">
                <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input 
                    type="text" 
                    placeholder="Filter prompts" 
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="bg-transparent border-none focus:outline-none text-sm text-white placeholder-gray-400 w-full"
                />
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead>
                        <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Display name</th>
                            <th className="px-4 py-3">Title</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 text-sm text-gray-200">
                        {isLoading ? (
                            <tr><td colSpan={5} className="text-center py-4 text-gray-400">Loading chips...</td></tr>
                        ) : filteredChips.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-4 text-gray-400">No matching prompts found</td></tr>
                        ) : (
                            filteredChips.map((chip) => (
                                <PromptChipRow 
                                    key={chip.name} 
                                    chip={chip} 
                                    onEdit={handleEdit} 
                                    onDelete={handleDelete} 
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <PromptChipModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                engineName={engineName}
                chip={selectedChip}
                onSuccess={triggerReload}
            />

            <DestructiveConfirmModal
                isOpen={!!chipToDelete}
                onClose={() => setChipToDelete(null)}
                onConfirm={async () => {
                    if (!chipToDelete) return;
                    setIsDeletingChip(true);
                    try {
                        await api.deletePromptChip(engineName, chipToDelete.name);
                        setChipToDelete(null);
                        triggerReload();
                    } catch (err) {
                        console.error("Failed to delete", err);
                        toast.error("Failed to delete chip: " + toErrorMessage(err));
                    } finally {
                        setIsDeletingChip(false);
                    }
                }}
                title="Delete Prompt Chip"
                resourceType="Prompt Chip"
                resources={chipToDelete ? [{ name: chipToDelete.title || chipToDelete.name, details: chipToDelete.name }] : []}
                confirmKeyword={chipToDelete?.name || 'DELETE'}
                confirmButtonText="Delete Prompt Chip"
                description={`Are you sure you want to delete prompt chip "${chipToDelete?.title || chipToDelete?.name}"?`}
                consequences={[
                    "This prompt chip will be permanently deleted from the assistant engine.",
                    "Users will no longer see this suggested prompt chip in the conversation interface."
                ]}
                isLoading={isDeletingChip}
            />
        </div>
    );
};

export default PromptChipsTable;
