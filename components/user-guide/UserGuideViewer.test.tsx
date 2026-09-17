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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserGuideViewer from './UserGuideViewer';

describe('UserGuideViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders headings and paragraph text', () => {
    const md = `
# Main Header
## Sub Header
### Section Header
This is a standard paragraph with **bold** text and \`code\` snippet.
    `;

    render(<UserGuideViewer content={md} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Main Header');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Sub Header');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Section Header');
    expect(screen.getByText(/bold/i)).toBeInTheDocument();
  });

  it('renders markdown tables properly', () => {
    const md = `
| Column A | Column B |
|---|---|
| Value 1 | Value 2 |
    `;

    render(<UserGuideViewer content={md} />);

    expect(screen.getByText('Column A')).toBeInTheDocument();
    expect(screen.getByText('Value 1')).toBeInTheDocument();
    expect(screen.getByText('Value 2')).toBeInTheDocument();
  });

  it('renders code blocks and handles copy button', async () => {
    const md = '```bash\ncurl -H "Authorization: Bearer test" https://example.com\n```';

    render(<UserGuideViewer content={md} />);

    expect(screen.getByText(/bash/i)).toBeInTheDocument();
    const copyBtn = screen.getByRole('button', { name: /Copy/i });
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'curl -H "Authorization: Bearer test" https://example.com'
    );
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('renders collapsible details summary blocks', () => {
    const md = `
<details>
<summary>Under the hood — the API call this makes</summary>
This is hidden API detail.
</details>
    `;

    render(<UserGuideViewer content={md} />);

    expect(screen.getByText(/Under the hood — the API call this makes/i)).toBeInTheDocument();
    expect(screen.getByText(/Click to expand/i)).toBeInTheDocument();
  });

  it('normalizes image urls and renders figure with caption', () => {
    const md = '![Architecture Canvas](../assets/19-architecture.png)';

    render(<UserGuideViewer content={md} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/docs/assets/19-architecture.png');
    expect(img).toHaveAttribute('alt', 'Architecture Canvas');
    expect(screen.getByText('Architecture Canvas')).toBeInTheDocument();
  });

  it('highlights search query matches', () => {
    const md = 'The Vertex AI search connector enables indexing.';

    render(<UserGuideViewer content={md} highlightQuery="connector" />);

    const mark = screen.getByText('connector');
    expect(mark.tagName.toLowerCase()).toBe('mark');
  });

  it('renders callout alerts for NOTE and WARNING', () => {
    const md = `
> [!NOTE] This is an important note for administrators.
> [!WARNING] Deleting an agent is permanent and cannot be undone.
    `;

    render(<UserGuideViewer content={md} />);

    expect(screen.getByText('NOTE')).toBeInTheDocument();
    expect(screen.getByText(/This is an important note/i)).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText(/Deleting an agent is permanent/i)).toBeInTheDocument();
  });
});
