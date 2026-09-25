'use client';

import React, { useEffect, useState } from 'react';
import { Building2, Shield, Users } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useWorkspace } from '../../../lib/workspace';
import OrganisationPage from '../../../components/OrganisationPage';

function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        backgroundColor: 'var(--bg-soft)',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        gap: '16px',
      }}
    >
      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{label}</span>
      <span
        style={{
          fontSize: '12.5px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '60%',
        }}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export default function OrganisationSettingsPage() {
  const { activeOrgId, activeOrgRole, session } = useWorkspace();
  const [organisation, setOrganisation] = useState(null);
  const [memberCount, setMemberCount] = useState(null);

  useEffect(() => {
    if (!activeOrgId) {
      setOrganisation(null);
      setMemberCount(null);
      return;
    }

    async function load() {
      try {
        const [{ data: orgData }, { count }] = await Promise.all([
          supabase
            .from('organisations')
            .select('id, name, owner_id, created_at')
            .eq('id', activeOrgId)
            .maybeSingle(),
          supabase
            .from('organisation_members')
            .select('id', { count: 'exact', head: true })
            .eq('organisation_id', activeOrgId)
            .eq('status', 'active'),
        ]);
        setOrganisation(orgData || null);
        setMemberCount(count ?? 0);
      } catch (err) {
        console.error('Organisation settings load error:', err);
      }
    }

    load();
  }, [activeOrgId]);

  return (
    <OrganisationPage
      title="Organisation Settings"
      subtitle="Read-only details about this organisation workspace."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Details */}
        <div className="surface-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Building2 size={15} color="var(--brand-blue)" aria-hidden="true" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Organisation Details
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <InfoRow label="Name" value={organisation?.name || '—'} />
            <InfoRow label="Workspace ID" value={organisation?.id || activeOrgId || '—'} />
            <InfoRow
              label="Created"
              value={
                organisation?.created_at
                  ? new Date(organisation.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'
              }
            />
            <InfoRow
              label="Your Role"
              value={<span style={{ textTransform: 'capitalize' }}>{activeOrgRole || 'member'}</span>}
            />
          </div>
        </div>

        {/* Access */}
        <div className="surface-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={15} color="var(--brand-blue)" aria-hidden="true" />
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Access &amp; Membership
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <InfoRow
              label="Active members"
              value={memberCount === null ? '—' : memberCount}
            />
            <InfoRow label="Signed in as" value={session?.user?.email || '—'} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              marginTop: '16px',
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-soft)',
              border: '1px solid var(--border)',
            }}
          >
            <Shield size={14} color="var(--brand-blue)" style={{ marginTop: '2px', flexShrink: 0 }} aria-hidden="true" />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textWrap: 'pretty' }}>
              Roles are managed from the Members page. Owners can promote admins
              and remove members; admins can remove plain members. Private
              meetings of other members are never visible to organisation admins.
            </span>
          </div>
        </div>
      </div>
    </OrganisationPage>
  );
}
