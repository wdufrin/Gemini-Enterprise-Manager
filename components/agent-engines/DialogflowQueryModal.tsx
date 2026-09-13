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
import { DialogflowAgent, ChatMessage, Config } from '../../types';
import * as api from '../../services/apiService';
import { useModalA11y } from '../../hooks/useModalA11y';

interface DialogflowQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: DialogflowAgent;
    config: Config;
    accessToken: string;
}

const DialogflowQueryModal: React.FC<DialogflowQueryModalProps> = ({ isOpen, onClose, agent, config, accessToken }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useModalA11y({
        isOpen,
        onClose,
        containerRef,
        preventClose: isLoading,
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    useEffect(() => {
        if (isOpen) {
            setMessages([]);
            setSessionId(crypto.randomUUID());
            setError(null);
            setInput('');
        }
    }, [isOpen, agent]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
        const assistantIndex = messages.length + 1;
        
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            const response = await api.detectDialogflowIntent(
                agent.name,
                userMessage.content,
                sessionId,
                config,
                accessToken
            );

            // Dialogflow CX response structure
            const responseText = response.queryResult?.responseMessages?.[0]?.text?.text?.[0] || 
                                 JSON.stringify(response.queryResult, null, 2);

            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[assistantIndex] = { role: 'assistant', content: responseText };
                return newMessages;
            });

        } catch (err: any) {
            const errorMessage = `Error: ${err.message}`;
            setError(errorMessage);
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[assistantIndex] = { role: 'assistant', content: errorMessage };
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialogflow-query-title"
            className="fixed bottom-4 right-4 z-50"
        >
            <div className="flex flex-col h-[600px] w-[450px] bg-gray-800 shadow-2xl rounded-lg border border-gray-700">
                <header className="p-4 flex justify-between items-center border-b border-gray-700 shrink-0">
                    <div className="flex items-center overflow-hidden">
                        <div className="w-2 h-2 rounded-full mr-2 bg-orange-500"></div>
                        <h2 id="dialogflow-query-title" className="text-lg font-bold text-white truncate" title={`Dialogflow CX: ${agent.displayName}`}>
                            {agent.displayName}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="text-gray-400 hover:text-white"
                    >
                        &times;
                    </button>
                </header>
                
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && (
                                <div className="max-w-[85%] px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                                    <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                                </div>
                            )}
                            {msg.role === 'user' && (
                                <div className="max-w-[85%] px-4 py-2 rounded-lg bg-blue-600 text-white">
                                    <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
                        <div className="flex justify-start">
                           <div className="max-w-xl px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                               <div className="flex items-center space-x-2">
                                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                               </div>
                           </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </main>

                {error && <p className="text-red-400 text-xs px-4 pb-2">{error}</p>}

                <footer className="p-4 border-t border-gray-700 shrink-0">
                    <div className="flex items-center space-x-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                            placeholder="Message Agent..."
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800"
                        >
                            Send
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default DialogflowQueryModal;
