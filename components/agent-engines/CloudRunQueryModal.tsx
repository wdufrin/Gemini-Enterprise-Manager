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
import { CloudRunService, ChatMessage } from '../../types';
import * as api from '../../services/apiService';
import { useModalA11y } from '../../hooks/useModalA11y';

interface CloudRunQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    service: CloudRunService;
    accessToken: string;
}

const CodeBlock: React.FC<{ content: string }> = ({ content }) => {
  const [copyText, setCopyText] = useState('Copy');
  
  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopyText('Copied!');
      setTimeout(() => setCopyText('Copy'), 2000);
    });
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500"
      >
        {copyText}
      </button>
      <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
        <code>{content}</code>
      </pre>
    </div>
  );
};

const CloudRunCurlModal: React.FC<{ isOpen: boolean; onClose: () => void; service: CloudRunService; messages: ChatMessage[]; isA2a: boolean }> = ({ isOpen, onClose, service, messages, isA2a }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useModalA11y({
        isOpen,
        onClose,
        containerRef,
    });

    if (!isOpen) return null;

    const userMessages = messages.filter(m => m.role === 'user');

    const getCurlCommand = (userMessage: string) => {
        const cleanPrompt = userMessage.replace(/'/g, "'\\''");
        if (isA2a) {
            return `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": {
      "role": "user",
      "parts": [{"text": "${cleanPrompt}"}]
    }
  }' \\
  "${service.uri}/message"`;
        }
        return `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "${cleanPrompt}"}' \\
  "${service.uri}"`;
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60] p-4"
            aria-modal="true"
            role="dialog"
            aria-labelledby="cloudrun-curl-modal-title"
            onClick={onClose}
        >
            <div
                ref={containerRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
            >
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 id="cloudrun-curl-modal-title" className="text-xl font-bold text-white">cURL Commands</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        className="text-gray-400 hover:text-white"
                    >
                        &times;
                    </button>
                </header>

                <main className="p-6 overflow-y-auto space-y-6">
                    {userMessages.length === 0 ? (
                        <div>
                            <p className="text-gray-400 text-center mb-4">No requests sent yet. Here is a template:</p>
                            <CodeBlock content={getCurlCommand("Hello World")} />
                        </div>
                    ) : (
                        userMessages.map((msg, index) => (
                            <div key={index}>
                                <h3 className="text-md font-semibold text-gray-200 mb-2">Request #{index + 1}:</h3>
                                <CodeBlock content={getCurlCommand(msg.content)} />
                            </div>
                        ))
                    )}
                </main>
                
                <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
                </footer>
            </div>
        </div>
    );
};

const CloudRunQueryModal: React.FC<CloudRunQueryModalProps> = ({ isOpen, onClose, service, accessToken }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useModalA11y({
        isOpen,
        onClose,
        containerRef,
        preventClose: isCurlModalOpen || isLoading,
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    // Reset on open/service change
    useEffect(() => {
        if (isOpen) {
            setMessages([]);
            setError(null);
            setInput('');
        }
    }, [isOpen, service]);

    if (!isOpen) return null;

    const envVars = service.template?.containers?.[0]?.env || [];
    const getEnv = (name: string) => envVars.find(e => e.name === name)?.value;
    const isA2a = !!(getEnv('AGENT_URL') || getEnv('PROVIDER_ORGANIZATION') || service.name.toLowerCase().includes('a2a'));
    const displayName = getEnv('AGENT_DISPLAY_NAME') || service.name.split('/').pop();

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
        const assistantIndex = messages.length + 1;
        
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            let responseText = '';

            if (isA2a) {
                // Use A2A invocation (JSON-RPC)
                const result = await api.invokeA2aAgent(service.uri, userMessage.content, accessToken);
                // A2A result structure: { message: { role: "agent", parts: [{ text: "..." }] } }
                responseText = result?.message?.parts?.[0]?.text || JSON.stringify(result);
            } else {
                // Generic Agent invocation (Simple POST)
                const response = await fetch(service.uri, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: userMessage.content,
                        message: userMessage.content,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }

                const data = await response.json();
                responseText = data.response || data.reply || data.text || JSON.stringify(data);
            }

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

    return (
        <>
            <CloudRunCurlModal 
                isOpen={isCurlModalOpen} 
                onClose={() => setIsCurlModalOpen(false)} 
                service={service} 
                messages={messages} 
                isA2a={isA2a} 
            />
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cloudrun-query-title"
                tabIndex={-1}
                className="fixed bottom-4 right-4 z-50"
            >
                <div className="flex flex-col h-[600px] w-[450px] bg-gray-800 shadow-2xl rounded-lg border border-gray-700">
                    <header className="p-4 flex justify-between items-center border-b border-gray-700 shrink-0">
                        <div className="flex items-center overflow-hidden">
                            <div className={`w-2 h-2 rounded-full mr-2 ${isA2a ? 'bg-purple-500' : 'bg-teal-500'}`}></div>
                            <h2 id="cloudrun-query-title" className="text-lg font-bold text-white truncate" title={`Query: ${displayName}`}>
                                {displayName}
                            </h2>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button
                                type="button"
                                onClick={() => setIsCurlModalOpen(true)}
                                className="text-gray-400 hover:text-white"
                                aria-label="Show cURL commands"
                                title="Show cURL commands"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close dialog"
                                className="text-gray-400 hover:text-white"
                            >
                                &times;
                            </button>
                        </div>
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
                                placeholder={`Message ${isA2a ? 'A2A Agent' : 'Agent'}...`}
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
        </>
    );
};

export default CloudRunQueryModal;
