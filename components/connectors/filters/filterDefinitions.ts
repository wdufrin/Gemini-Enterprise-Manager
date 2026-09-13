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

export interface FilterKeyDefinition {
  key: string;
  label: string;
  placeholder: string;
  description: string;
  example: string;
}

export const CONNECTOR_FILTER_DEFINITIONS: Record<string, FilterKeyDefinition[]> = {
  sharepoint: [
    {
      key: 'Path',
      label: 'Site / Folder Path (URL)',
      placeholder: 'https://tenant.sharepoint.com/sites/HR/*',
      description: 'Matches site or document library URL paths with wildcards (*)',
      example: 'https://tenant.sharepoint.com/sites/Finance/*',
    },
    {
      key: 'Site',
      label: 'Site Collection URL',
      placeholder: 'https://tenant.sharepoint.com/sites/Engineering',
      description: 'Restricts crawling to specific SharePoint site collections',
      example: 'https://tenant.sharepoint.com/sites/Engineering',
    },
    {
      key: 'Folder',
      label: 'Folder Path',
      placeholder: '/sites/Engineering/Shared Documents/2026',
      description: 'Restricts indexing to specific folder subdirectories',
      example: '/Shared Documents/General',
    },
    {
      key: 'InformationProtectionLabelId',
      label: 'MIP Sensitivity Label GUID',
      placeholder: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      description: 'Microsoft Information Protection (MIP) sensitivity label GUID for document exclusion',
      example: '9c5f89e2-6bfb-4876-9c42-0f0bf26d3663',
    },
    {
      key: 'FileType',
      label: 'File Extensions',
      placeholder: 'pdf, docx, pptx, xlsx',
      description: 'File extensions to include or exclude',
      example: 'pdf, docx',
    },
  ],
  onedrive: [
    {
      key: 'Path',
      label: 'OneDrive Folder / Drive Path',
      placeholder: 'https://tenant-my.sharepoint.com/personal/user_tenant_com/*',
      description: 'Path URL to restrict indexing within personal or shared OneDrive drives',
      example: 'https://tenant-my.sharepoint.com/personal/user_tenant_com/*',
    },
    {
      key: 'User',
      label: 'User Principal Name (Email)',
      placeholder: 'alice@company.com, bob@company.com',
      description: 'User email addresses whose drives should be synced or excluded',
      example: 'ceo@company.com',
    },
    {
      key: 'Folder',
      label: 'Folder Path',
      placeholder: '/Documents/Work',
      description: 'Folder path within OneDrive to scope crawling',
      example: '/Documents/Projects',
    },
    {
      key: 'FileType',
      label: 'File Extensions',
      placeholder: 'pdf, docx, pptx',
      description: 'File extensions to filter',
      example: 'pdf, docx',
    },
  ],
  jira: [
    {
      key: 'Project',
      label: 'Jira Project Key',
      placeholder: 'ENG, PROD, MOBILE, IT',
      description: 'Jira project keys to crawl or exclude',
      example: 'ENG, PROD',
    },
    {
      key: 'IssueType',
      label: 'Issue Type',
      placeholder: 'Bug, Story, Task, Epic',
      description: 'Jira issue types to include or exclude',
      example: 'Bug, Task',
    },
    {
      key: 'Status',
      label: 'Workflow Status',
      placeholder: 'Done, Closed, In Progress',
      description: 'Workflow status of Jira issues',
      example: 'Done, Closed',
    },
    {
      key: 'Site',
      label: 'Jira Cloud Site URL',
      placeholder: 'https://yourcompany.atlassian.net',
      description: 'Atlassian Cloud tenant URL',
      example: 'https://company.atlassian.net',
    },
  ],
  confluence: [
    {
      key: 'Space',
      label: 'Space Key (spaceKey)',
      placeholder: 'ENG, DOCS, PRODUCT, KB',
      description: 'Confluence space keys to include or exclude',
      example: 'ENG, PRODUCT',
    },
    {
      key: 'Ancestor',
      label: 'Ancestor Page ID',
      placeholder: '123456789',
      description: 'Confluence Page ID to scope crawling to its subpage hierarchy',
      example: '1048576',
    },
    {
      key: 'Label',
      label: 'Page Label / Tag',
      placeholder: 'published, internal, archived',
      description: 'Confluence labels attached to pages',
      example: 'gemini-search',
    },
    {
      key: 'Site',
      label: 'Confluence Site URL',
      placeholder: 'https://yourcompany.atlassian.net/wiki',
      description: 'Atlassian Cloud Confluence site URL',
      example: 'https://company.atlassian.net/wiki',
    },
  ],
  teams: [
    {
      key: 'Team',
      label: 'Team Name / ID',
      placeholder: 'Engineering Team, Marketing',
      description: 'Microsoft Teams names or group IDs to sync',
      example: 'Product Team',
    },
    {
      key: 'Channel',
      label: 'Channel Name',
      placeholder: 'general, announcements, dev',
      description: 'Teams channel names to filter',
      example: 'General',
    },
    {
      key: 'User',
      label: 'User Email',
      placeholder: 'user@company.com',
      description: 'User principal name or email',
      example: 'alice@company.com',
    },
  ],
  outlook: [
    {
      key: 'Folder',
      label: 'Mail Folder',
      placeholder: 'Inbox, Archive, Sent Items',
      description: 'Mailbox folders to index or exclude',
      example: 'Inbox, Archive',
    },
    {
      key: 'Sender',
      label: 'Sender Email / Domain',
      placeholder: 'alerts@service.com, @external.com',
      description: 'Filter emails by sender address or domain',
      example: '@company.com',
    },
    {
      key: 'Domain',
      label: 'Email Domain',
      placeholder: 'company.com',
      description: 'Filter emails by corporate domain',
      example: 'company.com',
    },
  ],
  azure_active_directory: [
    {
      key: 'Department',
      label: 'Department Name',
      placeholder: 'Engineering, Sales, HR, Legal',
      description: 'Directory department attribute filter',
      example: 'Engineering, Product',
    },
    {
      key: 'Company',
      label: 'Company Name',
      placeholder: 'Acme Corp, Subsidiary LLC',
      description: 'Company organization name in Entra ID',
      example: 'Acme Corp',
    },
    {
      key: 'City',
      label: 'Office City',
      placeholder: 'New York, London, Tokyo',
      description: 'Physical office city filter',
      example: 'New York, Seattle',
    },
    {
      key: 'Country',
      label: 'Country / Region',
      placeholder: 'US, UK, JP, Germany',
      description: 'Country or region attribute',
      example: 'US, CA',
    },
    {
      key: 'JobTitle',
      label: 'Job Title',
      placeholder: 'Software Engineer, Director, VP',
      description: 'Job title filter for user directory sync',
      example: 'Software Engineer',
    },
  ],
  entraid: [
    {
      key: 'Department',
      label: 'Department Name',
      placeholder: 'Engineering, Sales, HR, Legal',
      description: 'Directory department attribute filter',
      example: 'Engineering, Product',
    },
    {
      key: 'Company',
      label: 'Company Name',
      placeholder: 'Acme Corp, Subsidiary LLC',
      description: 'Company organization name in Entra ID',
      example: 'Acme Corp',
    },
    {
      key: 'City',
      label: 'Office City',
      placeholder: 'New York, London, Tokyo',
      description: 'Physical office city filter',
      example: 'New York, Seattle',
    },
    {
      key: 'Country',
      label: 'Country / Region',
      placeholder: 'US, UK, JP, Germany',
      description: 'Country or region attribute',
      example: 'US, CA',
    },
    {
      key: 'JobTitle',
      label: 'Job Title',
      placeholder: 'Software Engineer, Director, VP',
      description: 'Job title filter for user directory sync',
      example: 'Software Engineer',
    },
  ],
  servicenow: [
    {
      key: 'Table',
      label: 'ServiceNow Table Name',
      placeholder: 'kb_knowledge, incident, sc_cat_item',
      description: 'ServiceNow database table to index',
      example: 'kb_knowledge',
    },
    {
      key: 'Category',
      label: 'Knowledge Category',
      placeholder: 'IT Support, HR Benefits, Policies',
      description: 'Category name or sys_id',
      example: 'IT Support',
    },
    {
      key: 'Domain',
      label: 'Domain / Instance',
      placeholder: 'TOP, default',
      description: 'Domain-separated instance domain filter',
      example: 'TOP',
    },
  ],
  salesforce: [
    {
      key: 'Object',
      label: 'Salesforce Object',
      placeholder: 'Account, Contact, Case, Opportunity, Knowledge__kav',
      description: 'Standard or Custom Salesforce sObject API name',
      example: 'Knowledge__kav, Case',
    },
    {
      key: 'RecordType',
      label: 'Record Type Name / ID',
      placeholder: 'Customer_Support, Internal_Doc',
      description: 'Salesforce RecordType filter',
      example: 'Customer_Support',
    },
  ],
  github: [
    {
      key: 'Repository',
      label: 'Repository (org/repo)',
      placeholder: 'my-org/backend-service, my-org/docs',
      description: 'GitHub repository full path to index',
      example: 'google/gemini-enterprise',
    },
    {
      key: 'Org',
      label: 'Organization',
      placeholder: 'my-org, partner-org',
      description: 'GitHub organization account name',
      example: 'my-org',
    },
    {
      key: 'Branch',
      label: 'Branch Name',
      placeholder: 'main, master, release/*',
      description: 'Branch name or pattern to crawl',
      example: 'main',
    },
  ],
  box: [
    {
      key: 'Folder',
      label: 'Folder Name / ID',
      placeholder: '0, 123456789, /Corporate/Policies',
      description: 'Box folder ID (0 is root) or folder path',
      example: '0',
    },
    {
      key: 'Path',
      label: 'Path Pattern',
      placeholder: '/All Files/Company Wiki/*',
      description: 'Box path hierarchy to crawl or exclude',
      example: '/All Files/Public/*',
    },
  ],
  slack: [
    {
      key: 'Channel',
      label: 'Channel Name / ID',
      placeholder: 'C12345678, general, announcements',
      description: 'Slack public/private channel ID or name',
      example: 'C0123456789',
    },
    {
      key: 'Workspace',
      label: 'Enterprise Grid Workspace',
      placeholder: 'T12345678, corp-workspace',
      description: 'Slack team/workspace ID',
      example: 'T0123456789',
    },
  ],
  zendesk: [
    {
      key: 'Brand',
      label: 'Brand Name / ID',
      placeholder: 'brand-1, brand-2',
      description: 'Zendesk brand identifier',
      example: 'SupportBrand',
    },
    {
      key: 'Category',
      label: 'Guide Category',
      placeholder: 'Getting Started, FAQ',
      description: 'Zendesk Guide article category ID or name',
      example: 'FAQ',
    },
  ],
};

export const DEFAULT_DEFINITIONS: FilterKeyDefinition[] = [
  {
    key: 'Site',
    label: 'Site / Workspace URL',
    placeholder: 'https://mysite.example.com',
    description: 'Target site collection or host URL',
    example: 'https://site.example.com',
  },
  {
    key: 'Path',
    label: 'Path Pattern',
    placeholder: '/documents/folder/*',
    description: 'Resource path pattern with optional wildcards',
    example: '/sites/HR/*',
  },
  {
    key: 'Project',
    label: 'Project Key / ID',
    placeholder: 'PROJ-1, PROJ-2',
    description: 'Project or workspace identifier',
    example: 'ENG',
  },
  {
    key: 'Folder',
    label: 'Folder Path',
    placeholder: '/Shared/Documents',
    description: 'Folder path to scope content',
    example: '/Documents/Work',
  },
  {
    key: 'Domain',
    label: 'Domain Name',
    placeholder: 'example.com',
    description: 'Domain filter',
    example: 'company.com',
  },
  {
    key: 'Category',
    label: 'Category',
    placeholder: 'Support, Knowledge',
    description: 'Category name or classification',
    example: 'Documentation',
  },
];
