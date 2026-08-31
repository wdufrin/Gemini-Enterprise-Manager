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

/**
 * Computes CRC-32 checksum of a Uint8Array.
 */
function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    let byte = bytes[i];
    for (let j = 0; j < 8; j++) {
      const bit = (byte ^ crc) & 1;
      crc >>>= 1;
      if (bit) {
        crc ^= 0xedb88320;
      }
      byte >>>= 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Creates a standard uncompressed ZIP archive containing files.
 * Returns the base64-encoded string of the zip file.
 */
export function createZipBase64(files: Record<string, string>): string {
  const encoder = new TextEncoder();
  const fileEntries: {
    filename: string;
    filenameBytes: Uint8Array;
    contentBytes: Uint8Array;
    crc: number;
    offset: number;
  }[] = [];

  let currentOffset = 0;
  const localHeaderChunks: Uint8Array[] = [];

  for (const [filename, content] of Object.entries(files)) {
    const filenameBytes = encoder.encode(filename);
    const contentBytes = encoder.encode(content);
    const crc = crc32(contentBytes);
    const offset = currentOffset;

    // Local file header: 30 bytes + filename length + content length
    const localHeader = new Uint8Array(30 + filenameBytes.length + contentBytes.length);
    const view = new DataView(localHeader.buffer);

    // Signature: 0x04034b50
    view.setUint32(0, 0x04034b50, true);
    // Version needed: 20 (2.0)
    view.setUint16(4, 20, true);
    // Flags: 0
    view.setUint16(6, 0, true);
    // Compression: 0 (stored)
    view.setUint16(8, 0, true);
    // Mod time / date: 0
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    // CRC-32
    view.setUint32(14, crc, true);
    // Compressed size
    view.setUint32(18, contentBytes.length, true);
    // Uncompressed size
    view.setUint32(22, contentBytes.length, true);
    // Filename length
    view.setUint16(26, filenameBytes.length, true);
    // Extra field length
    view.setUint16(28, 0, true);

    // Filename
    localHeader.set(filenameBytes, 30);
    // Content
    localHeader.set(contentBytes, 30 + filenameBytes.length);

    localHeaderChunks.push(localHeader);
    fileEntries.push({
      filename,
      filenameBytes,
      contentBytes,
      crc,
      offset,
    });

    currentOffset += localHeader.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirChunks: Uint8Array[] = [];

  for (const entry of fileEntries) {
    // Central directory header: 46 bytes + filename length
    const cdHeader = new Uint8Array(46 + entry.filenameBytes.length);
    const view = new DataView(cdHeader.buffer);

    // Signature: 0x02014b50
    view.setUint32(0, 0x02014b50, true);
    // Version made by: 20
    view.setUint16(4, 20, true);
    // Version needed: 20
    view.setUint16(6, 20, true);
    // Flags: 0
    view.setUint16(8, 0, true);
    // Compression: 0 (stored)
    view.setUint16(10, 0, true);
    // Mod time / date: 0
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    // CRC-32
    view.setUint32(16, entry.crc, true);
    // Compressed size
    view.setUint32(20, entry.contentBytes.length, true);
    // Uncompressed size
    view.setUint32(24, entry.contentBytes.length, true);
    // Filename length
    view.setUint16(28, entry.filenameBytes.length, true);
    // Extra field length
    view.setUint16(30, 0, true);
    // File comment length
    view.setUint16(32, 0, true);
    // Disk number start: 0
    view.setUint16(34, 0, true);
    // Internal file attributes: 0
    view.setUint16(36, 0, true);
    // External file attributes: 0
    view.setUint32(38, 0, true);
    // Relative offset of local header
    view.setUint32(42, entry.offset, true);

    // Filename
    cdHeader.set(entry.filenameBytes, 46);

    centralDirChunks.push(cdHeader);
    currentOffset += cdHeader.length;
  }

  const centralDirSize = currentOffset - centralDirOffset;

  // End of Central Directory (EOCD): 22 bytes
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  // Signature: 0x06054b50
  eocdView.setUint32(0, 0x06054b50, true);
  // Disk number: 0
  eocdView.setUint16(4, 0, true);
  // Start disk: 0
  eocdView.setUint16(6, 0, true);
  // Entries on this disk
  eocdView.setUint16(8, fileEntries.length, true);
  // Total entries
  eocdView.setUint16(10, fileEntries.length, true);
  // Size of central directory
  eocdView.setUint32(12, centralDirSize, true);
  // Offset of central directory
  eocdView.setUint32(16, centralDirOffset, true);
  // Comment length: 0
  eocdView.setUint16(20, 0, true);

  // Combine all parts into single Uint8Array
  const totalLength = currentOffset + eocd.length;
  const finalZip = new Uint8Array(totalLength);

  let writePos = 0;
  for (const chunk of localHeaderChunks) {
    finalZip.set(chunk, writePos);
    writePos += chunk.length;
  }
  for (const chunk of centralDirChunks) {
    finalZip.set(chunk, writePos);
    writePos += chunk.length;
  }
  finalZip.set(eocd, writePos);

  // Convert Uint8Array to base64 string
  let binary = '';
  const len = finalZip.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(finalZip[i]);
  }
  return btoa(binary);
}
