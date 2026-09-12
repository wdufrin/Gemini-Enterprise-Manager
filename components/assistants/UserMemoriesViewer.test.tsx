import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import UserMemoriesViewer from './UserMemoriesViewer';
import UserMemoriesModal from './UserMemoriesModal';
import * as api from '../../services/apiService';
import { Config, UserProfile } from '../../types';

vi.mock('../../services/apiService', () => ({
  listUserMemories: vi.fn(),
  deleteUserMemory: vi.fn(),
}));

const mockConfig: Config = {
  projectId: 'test-project',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'test-engine',
  assistantId: 'default_assistant',
};

const mockUserProfile: UserProfile = {
  email: 'testuser@example.com',
  name: 'Test User',
  picture: 'https://example.com/photo.jpg',
};

const mockMemories = [
  {
    name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/memories/mem-1',
    fact: 'User prefers Python over TypeScript for data analysis workflows.',
    createTime: '2026-05-10T12:00:00Z',
    updateTime: '2026-05-10T12:00:00Z',
  },
  {
    name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/memories/mem-2',
    fact: 'User is working on Project Titan in the US East region.',
    createTime: '2026-05-11T14:30:00Z',
    updateTime: '2026-05-12T09:15:00Z',
  },
];

describe('UserMemoriesViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders memories list successfully for authenticated user', async () => {
    vi.mocked(api.listUserMemories).mockResolvedValue({
      memories: mockMemories,
    });

    render(
      <UserMemoriesViewer config={mockConfig} userProfile={mockUserProfile} />
    );

    expect(screen.getByRole('heading', { name: /User Personalization Memories/i })).toBeInTheDocument();
    expect(screen.getByText(/testuser@example.com/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/User prefers Python over TypeScript/i)).toBeInTheDocument();
      expect(screen.getByText(/User is working on Project Titan/i)).toBeInTheDocument();
    });

    expect(api.listUserMemories).toHaveBeenCalledWith(mockConfig, 15, undefined);
  });

  it('filters memories based on search query', async () => {
    vi.mocked(api.listUserMemories).mockResolvedValue({
      memories: mockMemories,
    });

    render(
      <UserMemoriesViewer config={mockConfig} userProfile={mockUserProfile} />
    );

    await waitFor(() => {
      expect(screen.getByText(/User prefers Python over TypeScript/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search memories/i);
    fireEvent.change(searchInput, { target: { value: 'Titan' } });

    expect(screen.queryByText(/User prefers Python over TypeScript/i)).not.toBeInTheDocument();
    expect(screen.getByText(/User is working on Project Titan/i)).toBeInTheDocument();
  });

  it('renders empty state when no memories exist', async () => {
    vi.mocked(api.listUserMemories).mockResolvedValue({
      memories: [],
    });

    render(
      <UserMemoriesViewer config={mockConfig} userProfile={mockUserProfile} />
    );

    await waitFor(() => {
      expect(screen.getByText(/No saved memories yet/i)).toBeInTheDocument();
    });
  });

  it('renders error state with troubleshooting tips when API call fails', async () => {
    vi.mocked(api.listUserMemories).mockRejectedValue(
      new Error('Permission denied on discoveryengine.memories.list')
    );

    render(
      <UserMemoriesViewer config={mockConfig} userProfile={mockUserProfile} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Error Loading Memories/i)).toBeInTheDocument();
      expect(screen.getByText(/Permission denied on discoveryengine.memories.list/i)).toBeInTheDocument();
      expect(screen.getByText(/Troubleshooting Tips/i)).toBeInTheDocument();
    });
  });

  it('opens confirmation modal and deletes a memory', async () => {
    vi.mocked(api.listUserMemories).mockResolvedValue({
      memories: mockMemories,
    });
    vi.mocked(api.deleteUserMemory).mockResolvedValue({});

    render(
      <UserMemoriesViewer config={mockConfig} userProfile={mockUserProfile} />
    );

    await waitFor(() => {
      expect(screen.getByText(/User prefers Python over TypeScript/i)).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTitle(/Delete this memory/i);
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText(/Delete User Memory/i)).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this memory/i)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: /^Delete Memory$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.deleteUserMemory).toHaveBeenCalledWith(mockMemories[0].name, mockConfig);
    });
  });

  it('renders in modal wrapper UserMemoriesModal correctly', async () => {
    vi.mocked(api.listUserMemories).mockResolvedValue({
      memories: mockMemories,
    });

    const onClose = vi.fn();
    render(
      <UserMemoriesModal
        isOpen={true}
        onClose={onClose}
        config={mockConfig}
        userProfile={mockUserProfile}
        targetDisplayName="Test Engine Assistant"
      />
    );

    expect(screen.getByText(/Engine: Test Engine Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/User Memories & Personalization/i)).toBeInTheDocument();

    const doneButton = screen.getByRole('button', { name: /^Done$/i });
    fireEvent.click(doneButton);
    expect(onClose).toHaveBeenCalled();
  });
});
