import React, { useState, useEffect, useRef } from 'react';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import { useModalA11y } from '../../hooks/useModalA11y';

interface PromptChipModalProps {
    isOpen: boolean;
    onClose: () => void;
    engineName: string;
    chip?: any; // Raw API response item for edit mode
    onSuccess: () => void;
}

const PromptChipModal: React.FC<PromptChipModalProps> = ({ isOpen, onClose, engineName, chip, onSuccess }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isEdit = !!chip;
    const isGoogleDefined = chip?.type === 'Google-made' || chip?.raw?.googleDefined || chip?.name?.split('/').pop()?.startsWith('goog_');
    const [name, setName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [title, setTitle] = useState('');
    const [prefix, setPrefix] = useState('');
    const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(['']);
    const [isEnabled, setIsEnabled] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useModalA11y({
        isOpen,
        onClose,
        containerRef,
        preventClose: isSubmitting,
    });

    useEffect(() => {
        if (isOpen) {
            if (chip) {
                // Pre-populate for Edit
                setName(chip.name.split('/').pop() || '');
                setDisplayName(chip.displayName || '');
                setTitle(chip.defaultTexts?.title || '');
                setPrefix(chip.defaultTexts?.prefix || '');
                setSuggestedPrompts(
                    chip.defaultTexts?.suggestedPrompts?.map((p: any) => p.promptText) || ['']
                );
                setIsEnabled(!!chip.enabled); // match table coercion logic of absent = false
            } else {
                // Reset for Create
                setName('');
                setDisplayName('');
                setTitle('');
                setPrefix('');
                setSuggestedPrompts(['']);
                setIsEnabled(true);
            }
            setError(null);
        }
    }, [isOpen, chip]);

    if (!isOpen) return null;

    const handleAddPrompt = () => {
        setSuggestedPrompts([...suggestedPrompts, '']);
    };

    const handlePromptChange = (index: number, value: string) => {
        const newPrompts = [...suggestedPrompts];
        newPrompts[index] = value;
        setSuggestedPrompts(newPrompts);
    };

    const handleRemovePrompt = (index: number) => {
        const newPrompts = suggestedPrompts.filter((_, i) => i !== index);
        setSuggestedPrompts(newPrompts.length > 0 ? newPrompts : ['']);
    };

    const handleSubmit = async (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        // Validation
        if (!name.trim()) {
            setError("Name is required");
            setIsSubmitting(false);
            return;
        }
        if (!isGoogleDefined && !displayName.trim()) {
            setError("Display Name is required");
            setIsSubmitting(false);
            return;
        }

        const payload: any = {
            enabled: isEnabled
        };

        if (!isGoogleDefined) {
            if (isEdit) payload.name = chip.name;
            payload.displayName = displayName.trim();
            payload.defaultTexts = {
                title: title.trim(),
                prefix: prefix.trim(),
                suggestedPrompts: suggestedPrompts
                    .filter(p => p.trim() !== '')
                    .map(p => ({ promptText: p.trim() }))
            };
        }

        try {
            if (isEdit) {
                const params = isGoogleDefined ? { updateMask: 'enabled' } : undefined;
                await api.updatePromptChip(engineName, name, payload, params);
            } else {
                // For create, API trace showed PUT to .../cannedQueries/{name}
                // We pass payload containing name or use name as ID
                await api.createPromptChip(engineName, { ...payload, name: name.trim() });
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Failed to save prompt chip", err);
            setError(err.message || "Failed to save prompt chip");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-chip-modal-title"
            onClick={() => {
                if (!isSubmitting) onClose();
            }}
        >
            <div
                ref={containerRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col"
            >
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 id="prompt-chip-modal-title" className="text-xl font-bold text-white">
                        {isEdit ? 'Edit Prompt Chip' : 'Create Custom Prompt Chip'}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="text-gray-400 hover:text-white"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {error && (
                        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                Name (ID) <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                disabled={isEdit}
                                placeholder="locked-resource-id"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:bg-gray-800 disabled:cursor-not-allowed font-mono"
                                required
                            />
                            {!isEdit && (
                                <p className="text-xs text-gray-400 mt-1">
                                    Lowercase letters, numbers, hyphens. locked after creation.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                Display Name <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                disabled={isGoogleDefined}
                                placeholder="Visible Label"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:bg-gray-800"
                                required={!isGoogleDefined}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                disabled={isGoogleDefined}
                                placeholder="Text inside the chip"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:bg-gray-800"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Prefix</label>
                            <input
                                type="text"
                                value={prefix}
                                onChange={(e) => setPrefix(e.target.value)}
                                disabled={isGoogleDefined}
                                placeholder="Prepended search box text"
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:bg-gray-800"
                            />
                        </div>
                    </div>

                    <div className="flex items-center space-x-2 py-2">
                        <input
                            type="checkbox"
                            id="enabled-toggle"
                            checked={isEnabled}
                            onChange={(e) => setIsEnabled(e.target.checked)}
                            className="rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-700 h-4 w-4"
                        />
                        <label htmlFor="enabled-toggle" className="text-sm text-gray-300 select-none">
                            Chip Visibility Loop Enabled
                        </label>
                    </div>

                    <div className="border-t border-gray-700 pt-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-gray-300">
                                Suggested Dropdown Options
                            </label>
                            {!isGoogleDefined && (
                                <button
                                    type="button"
                                    onClick={handleAddPrompt}
                                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center"
                                >
                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Add option
                                </button>
                            )}
                        </div>

                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {suggestedPrompts.map((prompt, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => handlePromptChange(index, e.target.value)}
                                        disabled={isGoogleDefined}
                                        placeholder={`Suggested prompt option #${index + 1}`}
                                        className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:bg-gray-800"
                                    />
                                    {!isGoogleDefined && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemovePrompt(index)}
                                            className="text-gray-500 hover:text-red-400 p-1"
                                            title="Remove option"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-700 flex justify-end space-x-3 bg-gray-750">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-gray-700 text-gray-300 font-semibold rounded-md hover:bg-gray-600 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                    >
                        {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
                        {isSubmitting ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Chip')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PromptChipModal;
