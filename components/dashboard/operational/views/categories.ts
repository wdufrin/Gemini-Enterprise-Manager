export interface CategoryItem {
  id: string;
  title: string;
  badge?: string;
  count?: string | number;
}

export interface CategorySection {
  title: string;
  items: CategoryItem[];
}

export const VIEW_CATEGORIES: CategorySection[] = [
  {
    title: 'Dashboard',
    items: [{ id: 'overview', title: 'Global Overview', badge: 'Live' }],
  },
  {
    title: 'Connectors & Tools',
    items: [
      { id: 'v_user_connector_usage', title: 'Connector Usage (All)', count: 19 },
      { id: 'v_user_connector_usage_30d', title: 'Connector Usage (30d)', count: 17 },
    ],
  },
  {
    title: 'User Interactions',
    items: [
      { id: 'v_consolidated_user_activity', title: 'User Activity', count: '8.1k' },
      { id: 'v_consolidated_user_messages', title: 'User Messages', count: '8.2k' },
    ],
  },
  {
    title: 'Model & Telemetry',
    items: [
      { id: 'v_gemini_genai_telemetry', title: 'GenAI Telemetry & Tools', count: '2.5k' },
      { id: 'v_consolidated_ai_choices', title: 'AI Generation Choices', count: '10.9k' },
    ],
  },
  {
    title: 'Gemini Enterprise',
    items: [
      { id: 'v_gemini_assist_activity', title: 'Assist Activity', count: 882 },
      { id: 'v_gemini_search_activity', title: 'Search Operations', count: 274 },
    ],
  },
  {
    title: 'Feedback & Quality',
    items: [
      { id: 'v_admin_feedback_review', title: 'Admin Feedback Review', count: 2 },
      { id: 'v_agent_feedback', title: 'Agent Feedback Summary', count: 2 },
      { id: 'v_agent_feedback_detailed', title: 'Detailed Feedback Turns', count: 2 },
    ],
  },
];
