import React from 'react';
import CostsUI from '../components/dashboard/CostsUI';
import CloudConsoleButton from '../components/CloudConsoleButton';

interface Props {
    projectNumber: string;
}

const GEQuotaUsagePage: React.FC<Props> = ({ projectNumber }) => {
    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                    <h1 className="text-2xl xl:text-3xl font-bold text-white tracking-tight">Gemini Enterprise Quota Usage</h1>
                    <p className="mt-1.5 text-sm text-gray-400">
                        Model and calculate your organization&apos;s pooled Gemini Enterprise quota limits.
                    </p>
                </div>
                <CloudConsoleButton url={`https://console.cloud.google.com/gemini-enterprise/user-license?project=${projectNumber}`} />
            </div>
            
            <div>
                <CostsUI projectNumber={projectNumber} />
            </div>
        </div>
    );
};

export default GEQuotaUsagePage;
