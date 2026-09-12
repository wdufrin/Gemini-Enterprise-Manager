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

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Human-readable name of the area being guarded, e.g. the page title. */
  boundaryName?: string;
  /**
   * Changing this value resets the boundary. Pass the current page so that
   * navigating away from a crashed page recovers automatically.
   */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
  showDetails: boolean;
}

/**
 * Catches render-phase exceptions so a single broken component cannot
 * white-screen the entire console.
 *
 * Note: React error boundaries only catch errors thrown during rendering,
 * in lifecycle methods, and in constructors of the tree below them. They do
 * NOT catch errors in event handlers, async callbacks, or promise rejections.
 * Those paths still need their own try/catch.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, componentStack: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ componentStack: errorInfo.componentStack ?? null });
    // Keep the full detail in the console for developers.
    console.error(
      `[ErrorBoundary${this.props.boundaryName ? `: ${this.props.boundaryName}` : ''}]`,
      error,
      errorInfo
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Recover automatically when the guarded area changes (e.g. page navigation).
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ error: null, componentStack: null, showDetails: false });
  };

  render() {
    const { error, componentStack, showDetails } = this.state;
    const { boundaryName, children } = this.props;

    if (!error) return children;

    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="w-full max-w-2xl rounded-lg border border-red-800/60 bg-gray-900 p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mt-0.5 h-6 w-6 flex-shrink-0 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-100">
                {boundaryName ? `Something went wrong in ${boundaryName}` : 'Something went wrong'}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                This section failed to render. The rest of the application is still usable &mdash;
                you can retry, or switch to another page.
              </p>

              <p className="mt-3 rounded border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs text-red-300">
                {error.message || String(error)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={this.reset}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded border border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-800"
                >
                  Reload application
                </button>
                {componentStack && (
                  <button
                    type="button"
                    onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                    aria-expanded={showDetails}
                    className="rounded px-3 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-gray-200"
                  >
                    {showDetails ? 'Hide' : 'Show'} technical details
                  </button>
                )}
              </div>

              {showDetails && componentStack && (
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-gray-700 bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-gray-400">
                  {error.stack}
                  {'\n'}
                  {componentStack}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
