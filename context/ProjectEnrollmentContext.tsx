import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ProjectEnrollmentStatus } from '../types';
import {
    getCachedProjectEnrollment,
    setCachedProjectEnrollment,
    clearCachedProjectEnrollment,
    probeProjectEnrollment,
} from '../services/api/project';

export interface ProjectEnrollmentContextValue {
    enrollment: ProjectEnrollmentStatus | null;
    isProbingEnrollment: boolean;
    isGoogleInternal: boolean;
    isTrustedTester: boolean;
    isNotebookLmApiUser: boolean;
    isAgentRegistryEnabled: boolean;
    refreshEnrollment: () => Promise<ProjectEnrollmentStatus | null>;
    setEnrollment: (status: ProjectEnrollmentStatus | null) => void;
}

const DEFAULT_CONTEXT_VALUE: ProjectEnrollmentContextValue = {
    enrollment: null,
    isProbingEnrollment: false,
    isGoogleInternal: false,
    isTrustedTester: false,
    isNotebookLmApiUser: false,
    isAgentRegistryEnabled: false,
    refreshEnrollment: async () => null,
    setEnrollment: () => {},
};

const ProjectEnrollmentContext = createContext<ProjectEnrollmentContextValue>(DEFAULT_CONTEXT_VALUE);

interface ProjectEnrollmentProviderProps {
    projectId: string;
    projectNumber: string;
    isGapiReady: boolean;
    initialEnrollment?: ProjectEnrollmentStatus | null;
    children: React.ReactNode;
}

export const ProjectEnrollmentProvider: React.FC<ProjectEnrollmentProviderProps> = ({
    projectId,
    projectNumber,
    isGapiReady,
    initialEnrollment = null,
    children,
}) => {
    const activeProjectRef = (projectId || projectNumber || '').trim();
    const [enrollment, setEnrollmentState] = useState<ProjectEnrollmentStatus | null>(() => {
        if (initialEnrollment) return initialEnrollment;
        return getCachedProjectEnrollment(activeProjectRef);
    });
    const [isProbingEnrollment, setIsProbingEnrollment] = useState(false);

    const setEnrollment = useCallback((status: ProjectEnrollmentStatus | null) => {
        setEnrollmentState(status);
        if (status) {
            setCachedProjectEnrollment(status);
        } else {
            clearCachedProjectEnrollment();
        }
    }, []);

    useEffect(() => {
        if (initialEnrollment) {
            setEnrollmentState(initialEnrollment);
            setCachedProjectEnrollment(initialEnrollment);
        }
    }, [initialEnrollment]);

    const refreshEnrollment = useCallback(async (): Promise<ProjectEnrollmentStatus | null> => {
        if (!activeProjectRef || !isGapiReady) {
            return null;
        }
        setIsProbingEnrollment(true);
        try {
            const probed = await probeProjectEnrollment(activeProjectRef);
            setEnrollmentState(probed);
            return probed;
        } finally {
            setIsProbingEnrollment(false);
        }
    }, [activeProjectRef, isGapiReady]);

    useEffect(() => {
        if (!activeProjectRef) {
            setEnrollmentState(null);
            return;
        }
        const cached = getCachedProjectEnrollment(activeProjectRef);
        if (cached) {
            setEnrollmentState(cached);
            return;
        }
        if (isGapiReady) {
            void refreshEnrollment();
        }
    }, [activeProjectRef, isGapiReady, refreshEnrollment]);

    const isGoogleInternal = Boolean(enrollment?.googleInternal);
    const isTrustedTester = Boolean(enrollment?.trustedTester || enrollment?.googleInternal);
    const isNotebookLmApiUser = Boolean(enrollment?.notebookLmApiUser || enrollment?.googleInternal);
    const isAgentRegistryEnabled = Boolean(enrollment?.agentRegistryEnabled);

    return (
        <ProjectEnrollmentContext.Provider
            value={{
                enrollment,
                isProbingEnrollment,
                isGoogleInternal,
                isTrustedTester,
                isNotebookLmApiUser,
                isAgentRegistryEnabled,
                refreshEnrollment,
                setEnrollment,
            }}
        >
            {children}
        </ProjectEnrollmentContext.Provider>
    );
};

export const useProjectEnrollment = (): ProjectEnrollmentContextValue => {
    return useContext(ProjectEnrollmentContext);
};
