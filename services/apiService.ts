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
 * apiService — unified API facade for Google Cloud & Discovery Engine services.
 * Individual domain implementations are modularized under services/api/ (Task 7.3).
 */

export * from "./api/core";
export * from "./api/project";
export * from "./api/iam";
export * from "./api/bigquery";
export * from "./api/monitoring";
export * from "./api/modelArmor";
export * from "./api/cloudRun";
export * from "./api/cloudStorage";
export * from "./api/cloudBuild";
export * from "./api/dialogflow";
export * from "./api/networking";
export * from "./api/discoveryEngine";
export * from "./api/dataStores";
export * from "./api/licenses";
export * from "./api/vertexReasoning";
export * from "./api/a2a";
export * from "./api/notebooks";
export * from "./api/mcp";
export * from "./api/registry";
