import React from 'react';
import CostsUI from '../components/dashboard/CostsUI';
import CloudConsoleButton from '../components/CloudConsoleButton';

interface Props {
    projectNumber: string;
}

const GEQuotaUsagePage: React.FC<Props> = ({ projectNumber }) => {
    return (
        <div className="flex-1 overflow-auto bg-gray-900 border-l border-gray-800 custom-scrollbar">
            <div className="p-8 max-w-7xl mx-auto">
                <div className="mb-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Gemini Enterprise Quota Usage</h1>
                        <p className="mt-2 text-sm text-gray-400">
                            Model and calculate your organization&apos;s pooled Gemini Enterprise quota limits.
                        </p>
                    </div>
                    <CloudConsoleButton url={`https://console.cloud.google.com/gemini-enterprise/user-license?project=${projectNumber}`} />
                </div>
                
                <div className="mt-6">
                    <CostsUI projectNumber={projectNumber} />
                </div>
            </div>
        </div>
    );
};

export default GEQuotaUsagePage;
