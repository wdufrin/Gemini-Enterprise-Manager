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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Config, DiscoverySession } from '../types';
import * as api from '../services/apiService';
import { useToast } from '../context/ToastContext';
import { toErrorMessage } from '../utils/errors';

export function useChatHistory(config: Config) {
  const { toast } = useToast();

  // List State
  const [sessions, setSessions] = useState<DiscoverySession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [rawContent, setRawContent] = useState<any | null>(null);

  // Detail View State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionDetails, setSelectedSessionDetails] = useState<DiscoverySession | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Batch Auto-Load State
  const [autoLoadSession, setAutoLoadSession] = useState<Set<string>>(new Set());

  // Fetching Logic
  const fetchSessions = useCallback(
    async (pageToken?: string) => {
      setIsLoading(true);
      setError(null);
      if (!pageToken) {
        setSessions([]);
        setSelectedSessionId(null);
        setSelectedSessionDetails(null);
      }

      try {
        const response = await api.listDiscoverySessions(config, pageToken);
        const newSessions = response.sessions || [];

        setSessions((prev) => {
          const combined = pageToken ? [...prev, ...newSessions] : newSessions;
          return combined.sort((a, b) => {
            const dateA = a.startTime ? new Date(a.startTime).getTime() : 0;
            const dateB = b.startTime ? new Date(b.startTime).getTime() : 0;
            return dateB - dateA;
          });
        });
        setNextPageToken(response.nextPageToken);
      } catch (err: any) {
        console.error('Failed to fetch sessions', err);
        setError(err.message || 'Failed to fetch sessions.');
      } finally {
        setIsLoading(false);
      }
    },
    [config],
  );

  useEffect(() => {
    if (config.appId) {
      fetchSessions();
    }
  }, [config.appId, config.appLocation, fetchSessions]);

  const handleSessionClick = async (session: DiscoverySession) => {
    setRawContent(null);
    setIsJsonModalOpen(false);

    if (selectedSessionId === session.name) {
      setSelectedSessionId(null);
      setSelectedSessionDetails(null);
      return;
    }

    setSelectedSessionId(session.name);
    setIsDetailLoading(true);
    try {
      const details = await api.getDiscoverySession(session.name, config);
      setSelectedSessionDetails(details);
    } catch (err: any) {
      console.error('Failed to fetch session details', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const enableAutoLoad = () => {
    if (selectedSessionId) {
      setAutoLoadSession((prev) => new Set(prev).add(selectedSessionId));
    }
  };

  const handleCloneSession = async () => {
    if (!selectedSessionDetails) return;

    const targetUser = prompt(
      'Enter Target User ID for the new session (e.g. email):',
      selectedSessionDetails.userPseudoId || '',
    );
    if (targetUser === null) return;

    setIsDetailLoading(true);
    try {
      const clonePayload: DiscoverySession = {
        name: '',
        userPseudoId: targetUser || 'cloned-user',
        turns: selectedSessionDetails.turns,
      };

      const newSessionRaw = await api.createDiscoverySession(clonePayload, config);
      await fetchSessions();

      if (newSessionRaw && newSessionRaw.name) {
        handleSessionClick(newSessionRaw);
      }
      toast.success('Session cloned successfully!');
    } catch (err: any) {
      console.error('Failed to clone session', err);
      toast.error(`Failed to clone session: ${toErrorMessage(err)}`);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleShareSession = async () => {
    if (!selectedSessionDetails) return;

    const targetUser = prompt(
      'Enter the User ID (e.g. email) you want to share this session with:',
      '',
    );
    if (!targetUser) return;

    setIsDetailLoading(true);
    try {
      const clonePayload: DiscoverySession = {
        name: '',
        userPseudoId: targetUser,
        turns: selectedSessionDetails.turns,
      };

      await api.createDiscoverySession(clonePayload, config);
      await fetchSessions();
      toast.success(`Session successfully shared with ${targetUser}!`);
    } catch (err: any) {
      console.error('Failed to share session', err);
      toast.error(`Failed to share session: ${toErrorMessage(err)}`);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!selectedSessionDetails) return;

    let cid = localStorage.getItem('agentspace_console_cid');
    if (!cid) {
      const defaultCid = config.collectionId || 'default_collection';
      const userCid = prompt(
        'Enter the "Console CID" for the link (usually a UUID like "c90049eb...").\n\nIf unknown, check the URL when you are in the Agent Builder console.',
        defaultCid,
      );
      if (!userCid) return;
      cid = userCid;
      localStorage.setItem('agentspace_console_cid', cid);
    }

    const sessionId = selectedSessionDetails.name.split('/').pop();
    const url = `https://vertexaisearch.cloud.google.com/u/0/home/cid/${cid}/r/session/${sessionId}`;

    navigator.clipboard.writeText(url).then(
      () => {
        toast.success('Link copied to clipboard!');
      },
      (err) => {
        console.error('Could not copy text: ', err);
        toast.error('Failed to copy link.');
      },
    );
  };

  const filteredSessions = useMemo(() => {
    return sessions
      .filter(
        (s) =>
          (s.userPseudoId && s.userPseudoId.includes(searchQuery)) ||
          s.name.includes(searchQuery),
      )
      .filter((s) => {
        if (!userFilter) return true;
        return s.userPseudoId === userFilter;
      });
  }, [sessions, searchQuery, userFilter]);

  const uniqueUsers = useMemo(() => {
    return Array.from(
      new Set(sessions.map((s) => s.userPseudoId).filter(Boolean)),
    ) as string[];
  }, [sessions]);

  return {
    sessions,
    isLoading,
    nextPageToken,
    error,
    searchQuery,
    setSearchQuery,
    userFilter,
    setUserFilter,
    isJsonModalOpen,
    setIsJsonModalOpen,
    rawContent,
    setRawContent,
    selectedSessionId,
    selectedSessionDetails,
    isDetailLoading,
    autoLoadSession,
    fetchSessions,
    handleSessionClick,
    enableAutoLoad,
    handleCloneSession,
    handleShareSession,
    handleCopyLink,
    filteredSessions,
    uniqueUsers,
  };
}
