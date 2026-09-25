'use client';

import React from 'react';
import { CreditCard, Lock } from 'lucide-react';
import OrganisationPage from '../../../components/OrganisationPage';

export default function OrganisationBillingPage() {
  return (
    <OrganisationPage
      title="Billing"
      subtitle="Plan, invoices and payment methods for this organisation."
    >
      <div className="surface-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div className="metric-icon-box" style={{ margin: '0 auto 14px' }}>
          <CreditCard size={20} strokeWidth={2} aria-hidden="true" />
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '10px',
          }}
        >
          <Lock size={12} aria-hidden="true" />
          <span>Not enabled</span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Billing integration coming soon
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', textWrap: 'pretty' }}>
          Plans, seats and invoices for organisation workspaces will be managed
          here. Until then your organisation stays on the current plan with no
          changes.
        </p>
      </div>
    </OrganisationPage>
  );
}
