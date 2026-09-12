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
import ReactDOM from 'react-dom/client';
import JSZip from 'jszip';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './src/index.css';

(window as any).JSZip = JSZip;


// Suppress benign ResizeObserver errors usually caused by rapid layout changes in ReactFlow or containers
const resizeObserverErrRegex = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

window.addEventListener('error', (e) => {
    if (e.message && resizeObserverErrRegex.test(e.message)) {
        e.stopImmediatePropagation();
        e.preventDefault(); // Prevents the error from appearing in the console in some browsers
    }
});

const originalError = console.error;
console.error = (...args) => {
  if (args[0] && (typeof args[0] === 'string' && resizeObserverErrRegex.test(args[0]) || (args[0].message && resizeObserverErrRegex.test(args[0].message)))) {
    return;
  }
  originalError(...args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary boundaryName="Gemini Enterprise Manager">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
