'use client';

import React from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { useWorkspace } from '../lib/workspace';

/**
 * Shared wrapper for every /organisation page.
 * - Shows a loading state while workspaces resolve.
 * - If the active workspace is personal, shows an empty state that asks the
 *   user to switch (or create) an organisation instead of rendering data.
 * - Renders the standard Recap page header, then the page body.
 */
export default function OrganisationPage({ title, subtitle, breadcrumb, actions, children }) {
  const { loading, isOrganisation, workspaces, switchWorkspace } =
    useWorkspace();

  if (loading) {
    return (
      <div
        style={{
          padding: '60px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: 'var(--text-secondary)',
          fontSize: '13px',
        }}
      >
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading workspaces...</span>
      </div>
    );
  }

  const organisations = workspaces.filter((ws) => ws.type === 'organisation');

  return (
    <div>
      {breadcrumb && (
        <div
          style={{
            fontSize: '13px',
            color: '#64748B',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 500,
          }}
        >
          {breadcrumb}
        </div>
      )}

      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            marginBottom: '24px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            {title && (
              <h1
                style={{
                  fontSize: '26px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.025em',
                  marginBottom: '4px',
                  textWrap: 'balance',
                }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                style={{
                  fontSize: '13.5px',
                  color: 'var(--text-secondary)',
                  textWrap: 'pretty',
                  maxWidth: '680px',
                  lineHeight: 1.5,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {actions}
            </div>
          )}
        </div>
      )}

      {!isOrganisation ? (
        <div className="surface-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div
            className="metric-icon-box"
            style={{ margin: '0 auto 14px', width: '48px', height: '48px' }}
          >
            <Building2 size={22} strokeWidth={2} aria-hidden="true" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Switch to an organisation workspace
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 16px', textWrap: 'pretty' }}>
            Organisation tools show members, meetings and analytics for one
            organisation. Use the workspace switcher in the sidebar to pick one.
          </p>
          {organisations.length > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {organisations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  className="btn-secondary"
                  onClick={() => switchWorkspace(org.id)}
                >
                  {org.name}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted, #94A3B8)' }}>
              You don&apos;t belong to an organisation yet — use the workspace
              switcher to create one.
            </p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
