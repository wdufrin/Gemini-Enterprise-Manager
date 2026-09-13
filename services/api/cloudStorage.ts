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

import { GcsBucket, GcsObject } from "../../types";
import { getGapiClient } from "../gapiService";
import { gapiRequest } from "./core";

export const listBuckets = async (projectId: string): Promise<{ items?: GcsBucket[] }> => {
  return gapiRequest<{ items?: GcsBucket[] }>(
    `https://storage.googleapis.com/storage/v1/b?project=${projectId}`,
    "GET",
    projectId,
  );
};

export const listGcsObjects = async (
  bucket: string,
  prefix?: string,
  projectId?: string,
): Promise<{ items?: GcsObject[] }> => {
  let url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o`;
  if (prefix) url += `?prefix=${encodeURIComponent(prefix)}`;
  return gapiRequest<{ items?: GcsObject[] }>(url, "GET", projectId);
};

export const getGcsObjectContent = async (
  bucket: string,
  objectName: string,
  projectId: string,
) => {
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`;
  const client = await getGapiClient();
  const response = await client.request({
    path: url,
    method: "GET",
    headers: { "X-Goog-User-Project": projectId },
  });
  return typeof response.body === "string"
    ? response.body
    : JSON.stringify(response.body);
};

export const uploadFileToGcs = async (
  bucket: string,
  objectName: string,
  file: File | Blob,
  projectId: string,
) => {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const client = await getGapiClient();
  const token = client.getToken()?.access_token || "";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Goog-User-Project": projectId,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(
      `GCS Upload Failed: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};

export const deleteGcsObject = async (
  bucket: string,
  objectName: string,
  projectId: string,
): Promise<Record<string, unknown>> => {
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`;
  return gapiRequest<Record<string, unknown>>(url, "DELETE", projectId);
};

export const downloadGcsObject = async (
  bucketInfo: string,
  objectName: string,
  accessToken: string,
) => {
  const bucketArray = bucketInfo.split("/");
  const bucketName = bucketArray[bucketArray.length - 1]; // ensure we just have the name
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Failed to download object: ${response.status} - ${errText}`,
    );
  }

  return response.blob();
};
