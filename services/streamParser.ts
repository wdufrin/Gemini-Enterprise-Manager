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

export interface StreamParseOptions {
  onError?: (err: Error, rawText: string) => void;
}

/**
 * Robust incremental JSON stream parser for Google Cloud SSE & REST streams.
 *
 * Handles:
 * - Line-delimited JSON (NDJSON)
 * - Arbitrary network chunk fragmentation (tokens/objects split across chunks)
 * - Server-Sent Events envelopes (`data: {...}`, `data: [DONE]`, comments)
 * - Streamed JSON arrays (`[\n{...},\n{...}\n]`)
 * - String literals containing escaped quotes, backslashes, and nested braces
 * - Multiple JSON objects within a single chunk
 */
export class JsonStreamParser<T = unknown> {
  private buffer: string = '';
  private readonly onError?: (err: Error, rawText: string) => void;

  constructor(options: StreamParseOptions = {}) {
    this.onError = options.onError;
  }

  /**
   * Resets internal buffer state.
   */
  public reset(): void {
    this.buffer = '';
  }

  /**
   * Returns current unparsed buffered text.
   */
  public getBuffer(): string {
    return this.buffer;
  }

  /**
   * Feeds a text chunk into the parser and returns all complete JSON objects parsed.
   */
  public feed(chunk: string): T[] {
    this.buffer += chunk;
    return this.extractObjects();
  }

  /**
   * Flushes any remaining parsable object in the buffer.
   */
  public flush(): T[] {
    return this.extractObjects(true);
  }

  /**
   * Extracts complete JSON objects from the current buffer.
   */
  private extractObjects(isFinal: boolean = false): T[] {
    const results: T[] = [];

    while (this.buffer.length > 0) {
      // 1. Skip SSE comments, events, whitespace, array delimiters at top level
      const startObjIdx = this.findNextObjectStart();
      if (startObjIdx === -1) {
        // No object start found
        if (isFinal) {
          // If buffer has non-whitespace leftover that isn't [DONE] or closing array, check if it's valid JSON
          const trimmed = this.buffer.trim();
          if (
            trimmed &&
            trimmed !== ']' &&
            trimmed !== '[DONE]' &&
            trimmed !== 'data: [DONE]'
          ) {
            try {
              const obj = JSON.parse(trimmed) as T;
              results.push(obj);
              this.buffer = '';
            } catch {
              // Not valid JSON, discard
              this.buffer = '';
            }
          } else {
            this.buffer = '';
          }
        }
        break;
      }

      // Discard any preceding skipped tokens
      if (startObjIdx > 0) {
        this.buffer = this.buffer.substring(startObjIdx);
      }

      // 2. We are now positioned at '{'. Find matching '}'.
      let depth = 0;
      let inString = false;
      let isEscaped = false;
      let matchEndIdx = -1;

      for (let i = 0; i < this.buffer.length; i++) {
        const char = this.buffer[i];

        if (isEscaped) {
          isEscaped = false;
          continue;
        }

        if (char === '\\' && inString) {
          isEscaped = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              matchEndIdx = i;
              break;
            }
          }
        }
      }

      // If matching brace was not found yet, wait for more chunks
      if (matchEndIdx === -1) {
        break;
      }

      // Candidate JSON string
      const candidate = this.buffer.substring(0, matchEndIdx + 1);
      try {
        const parsed = JSON.parse(candidate) as T;
        results.push(parsed);
        // Advance buffer past candidate
        this.buffer = this.buffer.substring(matchEndIdx + 1);
      } catch (err: unknown) {
        const parseError = err instanceof Error ? err : new Error(String(err));
        if (this.onError) {
          this.onError(parseError, candidate);
        }
        // Advance past the failed candidate
        this.buffer = this.buffer.substring(matchEndIdx + 1);
      }
    }

    return results;
  }

  /**
   * Scans and skips top-level SSE headers, array delimiters, and whitespace
   * to locate the next opening brace '{'.
   */
  private findNextObjectStart(): number {
    let i = 0;
    while (i < this.buffer.length) {
      const char = this.buffer[i];

      // Whitespace and array delimiters at top-level
      if (
        char === ' ' ||
        char === '\t' ||
        char === '\r' ||
        char === '\n' ||
        char === ',' ||
        char === '[' ||
        char === ']'
      ) {
        i++;
        continue;
      }

      // SSE Comment line (: ping) or event header (event: ...) or id header (id: ...)
      if (
        char === ':' ||
        this.buffer.startsWith('event:', i) ||
        this.buffer.startsWith('id:', i) ||
        this.buffer.startsWith('retry:', i)
      ) {
        const nextNewline = this.buffer.indexOf('\n', i);
        if (nextNewline === -1) {
          return -1; // Wait for full line
        }
        i = nextNewline + 1;
        continue;
      }

      // SSE Data prefix: "data:"
      if (this.buffer.startsWith('data:', i)) {
        i += 5; // skip 'data:'
        // Skip whitespace after 'data:'
        while (i < this.buffer.length && (this.buffer[i] === ' ' || this.buffer[i] === '\t')) {
          i++;
        }
        // Check for "data: [DONE]"
        if (this.buffer.startsWith('[DONE]', i)) {
          i += 6;
        }
        continue;
      }

      // Found start of JSON object
      if (char === '{') {
        return i;
      }

      // Unknown character before '{', advance by 1
      i++;
    }

    return -1;
  }
}

/**
 * Reads from a ReadableStream<Uint8Array> and yields parsed JSON objects incrementally.
 */
export async function parseJsonStream<T = unknown>(
  stream: ReadableStream<Uint8Array>,
  onObject: (obj: T) => void,
  options: StreamParseOptions & { signal?: AbortSignal } = {}
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new JsonStreamParser<T>(options);

  try {
    for (;;) {
      if (options.signal?.aborted) {
        await reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (value && value.length > 0) {
        const chunk = decoder.decode(value, { stream: !done });
        const parsedObjects = parser.feed(chunk);
        for (const obj of parsedObjects) {
          onObject(obj);
        }
      }

      if (done) {
        const finalChunk = decoder.decode();
        if (finalChunk) {
          const finalObjects = parser.feed(finalChunk);
          for (const obj of finalObjects) {
            onObject(obj);
          }
        }
        const flushedObjects = parser.flush();
        for (const obj of flushedObjects) {
          onObject(obj);
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
