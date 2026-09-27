'use client';

import React from 'react';
import OrganisationPage from '../../../components/OrganisationPage';
import BillingPanel from '../../../components/BillingPanel';

export default function OrganisationBillingPage() {
  return (
    <OrganisationPage
      title="Billing"
      subtitle="Plan, invoices and payment methods for this organisation."
    >
      <BillingPanel />
    </OrganisationPage>
  );
}
