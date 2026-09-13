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
import { Modal } from '../common/Modal';

interface JsonViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  title?: string;
}

const JsonViewModal: React.FC<JsonViewModalProps> = ({ isOpen, onClose, data, title = 'JSON Data' }) => {
  return (
    <Modal
      isOpen={isOpen && !!data}
      onClose={onClose}
      title={title}
      size="3xl"
      footer={
        <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
          Close
        </button>
      }
    >
      <pre className="p-4 bg-gray-900 rounded-lg text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
        <code>{JSON.stringify(data, null, 2)}</code>
      </pre>
    </Modal>
  );
};

export default JsonViewModal;