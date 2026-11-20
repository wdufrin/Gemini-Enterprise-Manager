import React, { useState } from 'react';
import { Page } from '../types';
import PageShell from '../components/layout/PageShell';
import PageHeader from '../components/layout/PageHeader';
import { Tabs, TabItem } from '../components/common/Tabs';
import CostsUI, { QuotaCostSectionId } from '../components/dashboard/CostsUI';

interface Props {
  projectNumber: string;
  projectId?: string;
}

const QUOTA_COST_TABS: readonly TabItem<QuotaCostSectionId>[] = [
  { id: 'quota', label: 'Quota & Capacity Simulator' },
  { id: 'finops', label: 'FinOps Cloud Billing (BigQuery)' },
];

function getInitialQuotaSection(): QuotaCostSectionId {
  if (typeof window === 'undefined') return 'quota';
  const search = window.location.search || window.location.hash.split('?')[1] || '';
  const tabParam = new URLSearchParams(search).get('tab');
  if (tabParam === 'finops' || tabParam === 'quota') {
    return tabParam;
  }
  return 'quota';
}

const GEQuotaUsagePage: React.FC<Props> = ({ projectNumber, projectId }) => {
  const [activeSection, setActiveSection] = useState<QuotaCostSectionId>(getInitialQuotaSection);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  return (
    <PageShell variant="wide">
      <PageHeader
        title="Quota & Cost Estimator"
        subtitle="Simulate pooled Gemini Enterprise capacity, monitor live Cloud Monitoring utilization, and query BigQuery FinOps spend."
        consolePage={Page.GE_QUOTA_USAGE}
        projectId={projectId}
        projectNumber={projectNumber}
        onRefresh={() => setRefreshTrigger((n) => n + 1)}
        isRefreshing={isRefreshing}
        refreshDisabled={!projectNumber}
      />

      <Tabs
        items={QUOTA_COST_TABS}
        activeTab={activeSection}
        onChange={setActiveSection}
        ariaLabel="Quota and FinOps sections"
        syncSearchParam="tab"
      />

      <CostsUI
        projectNumber={projectNumber}
        activeSection={activeSection}
        refreshTrigger={refreshTrigger}
        onLoadingChange={setIsRefreshing}
      />
    </PageShell>
  );
};

export default GEQuotaUsagePage;
