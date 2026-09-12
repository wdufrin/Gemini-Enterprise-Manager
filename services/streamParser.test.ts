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

import { describe, it, expect, vi } from 'vitest';
import { JsonStreamParser, parseJsonStream } from './streamParser';

describe('JsonStreamParser', () => {
  it('parses newline-delimited JSON chunks correctly', () => {
    const parser = new JsonStreamParser();
    const result1 = parser.feed('{"a": 1}\n');
    const result2 = parser.feed('{"b": 2}\n');

    expect(result1).toEqual([{ a: 1 }]);
    expect(result2).toEqual([{ b: 2 }]);
  });

  it('handles multiple JSON objects within a single chunk', () => {
    const parser = new JsonStreamParser();
    const results = parser.feed('{"first": 1}{"second": 2}{"third": 3}');

    expect(results).toEqual([{ first: 1 }, { second: 2 }, { third: 3 }]);
  });

  it('handles chunks split arbitrarily across network packets', () => {
    const parser = new JsonStreamParser();
    const fullJson = JSON.stringify({
      message: 'Hello, world!',
      nested: { count: 42, active: true },
    });

    const part1 = fullJson.slice(0, 15);
    const part2 = fullJson.slice(15, 30);
    const part3 = fullJson.slice(30);

    expect(parser.feed(part1)).toEqual([]);
    expect(parser.feed(part2)).toEqual([]);
    expect(parser.feed(part3)).toEqual([JSON.parse(fullJson)]);
  });

  it('handles extreme fragmentation (1 byte per chunk)', () => {
    const parser = new JsonStreamParser();
    const json = JSON.stringify({ key: 'fragmented', list: [1, 2, 3] });
    const collected: unknown[] = [];

    for (const char of json) {
      const parsed = parser.feed(char);
      collected.push(...parsed);
    }

    expect(collected).toEqual([JSON.parse(json)]);
  });

  it('correctly handles braces inside string values', () => {
    const parser = new JsonStreamParser();
    const complex = JSON.stringify({
      code: 'function test() { return "{ nested }"; }',
      other: '}{}{',
    });

    const results = parser.feed(complex + '\n');
    expect(results).toEqual([JSON.parse(complex)]);
  });

  it('correctly handles escaped quotes and backslashes inside strings', () => {
    const parser = new JsonStreamParser();
    const payload = JSON.stringify({
      escapedQuote: 'He said "Hello"',
      escapedBackslash: 'C:\\Users\\admin\\path',
    });

    const results = parser.feed(payload);
    expect(results).toEqual([JSON.parse(payload)]);
  });

  it('handles Server-Sent Events (SSE) formatting with data: prefix and [DONE]', () => {
    const parser = new JsonStreamParser();
    const sseChunk =
      ': comment ping\n\n' +
      'data: {"event": "chunk_1"}\n\n' +
      'event: update\n' +
      'data: {"event": "chunk_2"}\n\n' +
      'data: [DONE]\n\n';

    const results = parser.feed(sseChunk);
    expect(results).toEqual([{ event: 'chunk_1' }, { event: 'chunk_2' }]);
  });

  it('handles streaming JSON arrays with commas and brackets', () => {
    const parser = new JsonStreamParser();
    const stream = '[\n{"id": 1},\n{"id": 2},\n{"id": 3}\n]';

    const results = parser.feed(stream);
    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('flushes any trailing JSON object without trailing newline', () => {
    const parser = new JsonStreamParser();
    parser.feed('{"complete": "yes"}');
    const flushed = parser.flush();
    expect(Array.isArray(flushed)).toBe(true);
    expect(parser.getBuffer()).toBe('');
  });

  it('resets buffer cleanly', () => {
    const parser = new JsonStreamParser();
    parser.feed('{"incomplete": true, ');
    expect(parser.getBuffer().length).toBeGreaterThan(0);

    parser.reset();
    expect(parser.getBuffer()).toBe('');
  });

  it('reports error and recovers on malformed JSON', () => {
    const onError = vi.fn();
    const parser = new JsonStreamParser({ onError });

    // Invalid JSON between braces
    const results = parser.feed('{ bad json : 123 } {"valid": true}');
    expect(onError).toHaveBeenCalled();
    expect(results).toEqual([{ valid: true }]);
  });
});

describe('parseJsonStream', () => {
  it('reads and parses chunks from a ReadableStream', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      '{"message": "part 1"}',
      '{"message": "part 2"}',
    ];

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });

    const onObject = vi.fn();
    await parseJsonStream(stream, onObject);

    expect(onObject).toHaveBeenCalledTimes(2);
    expect(onObject).toHaveBeenNthCalledWith(1, { message: 'part 1' });
    expect(onObject).toHaveBeenNthCalledWith(2, { message: 'part 2' });
  });

  it('respects abort signal cancellation', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(encoder.encode('{"step": 1}\n'));
        ctrl.enqueue(encoder.encode('{"step": 2}\n'));
        ctrl.close();
      },
    });

    const onObject = vi.fn().mockImplementation((obj) => {
      if (obj.step === 1) {
        controller.abort();
      }
    });

    await parseJsonStream(stream, onObject, { signal: controller.signal });

    // Stream cancelled after first item
    expect(onObject).toHaveBeenCalledTimes(1);
    expect(onObject).toHaveBeenCalledWith({ step: 1 });
  });
});
