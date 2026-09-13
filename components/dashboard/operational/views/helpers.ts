import { ColumnDef } from '../DataTable';

export interface ViewDefinition {
  id: string;
  viewName: string;
  title: string;
  description: string;
  category: string;
  columns: ColumnDef[];
  getDdl: (projectId: string, dataset: string, tables?: Set<string> | string[]) => string;
  getQuery: (projectId: string, dataset: string) => string;
  getRowsQuery: (projectId: string, dataset: string) => string;
}

export const hasTable = (
  tables: Set<string> | string[] | undefined,
  name: string,
): boolean => {
  if (!tables) return false;
  return tables instanceof Set ? tables.has(name) : tables.includes(name);
};

export const hasMatchingTable = (
  tables: Set<string> | string[] | undefined,
  prefix: string,
): boolean => {
  if (!tables) return false;
  const list = tables instanceof Set ? Array.from(tables) : tables;
  return list.some((t) => t.includes(prefix));
};

export const getLogsSource = (
  projectId: string,
  dataset: string,
  tables?: Set<string> | string[],
): string => {
  if (hasTable(tables, '_AllLogs')) {
    return `\`${projectId}.${dataset}._AllLogs\``;
  }
  return `\`${projectId}.ge_analytics_link._AllLogs\``;
};
