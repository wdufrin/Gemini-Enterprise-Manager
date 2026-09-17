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

import React from 'react';
import UserGuideModal from './user-guide/UserGuideModal';
import { Page } from '../types';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSectionId?: string;
  onNavigateToPage?: (page: Page) => void;
}

/**
 * UserManualModal delegates directly to the comprehensive, searchable
 * UserGuideModal containing the complete 18-tab administrator manual.
 */
const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
  initialSectionId,
  onNavigateToPage,
}) => {
  return (
    <UserGuideModal
      isOpen={isOpen}
      onClose={onClose}
      initialSectionId={initialSectionId}
      onNavigateToPage={onNavigateToPage}
    />
  );
};

export default UserManualModal;
