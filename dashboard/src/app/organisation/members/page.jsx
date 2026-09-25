'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Mail,
  MoreHorizontal,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useWorkspace } from '../../../lib/workspace';
import OrganisationPage from '../../../components/OrganisationPage';

const ROLE_PILL = { owner: 'tag-purple', admin: 'tag-blue', member: 'tag-gray' };
const STATUS_PILL = { active: 'tag-green', suspended: 'tag-orange' };
const INVITE_PILL = {
  pending: 'tag-blue',
  accepted: 'tag-green',
  expired: 'tag-orange',
  revoked: 'tag-pink',
};

export default function OrganisationMembersPage() {
  const { activeOrgId, activeOrgRole, session } = useWorkspace();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [rowMenuOpen, setRowMenuOpen] = useState(null);
  const [actionError, setActionError] = useState('');

  const myUserId = session?.user?.id || null;
  const canManage = activeOrgRole === 'owner' || activeOrgRole === 'admin';
  const canChangeRoles = activeOrgRole === 'owner';

  const load = async () => {
    if (!activeOrgId) {
      setMembers([]);
      setInvitations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: memberData }, { data: inviteData }] = await Promise.all([
        supabase
          .from('organisation_members')
          .select('id, user_id, role, status, email, display_name, created_at')
          .eq('organisation_id', activeOrgId)
          .order('created_at', { ascending: true }),
        supabase
          .from('organisation_invitations')
          .select('id, email, role, status, expires_at, created_at')
          .eq('organisation_id', activeOrgId)
          .order('created_at', { ascending: false }),
      ]);
      setMembers(memberData || []);
      setInvitations(inviteData || []);
    } catch (err) {
      console.error('Members load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    setRowMenuOpen(null);
    setActionError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  const handleInvite = async (event) => {
    event.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail.trim()) {
      setInviteError('Email is required.');
      return;
    }
    setInviteBusy(true);
    try {
      const { error } = await supabase.rpc('invite_member', {
        p_organisation_id: activeOrgId,
        p_email: inviteEmail.trim(),
        p_role: inviteRole,
      });
      if (error) throw error;
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}.`);
      setInviteEmail('');
      setInviteRole('member');
      await load();
    } catch (err) {
      setInviteError(err.message || 'Could not send invitation.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleChangeRole = async (targetUserId, newRole) => {
    setActionError('');
    setRowMenuOpen(null);
    try {
      const { error } = await supabase.rpc('update_member_role', {
        p_organisation_id: activeOrgId,
        p_target_user_id: targetUserId,
        p_role: newRole,
      });
      if (error) throw error;
      await load();
    } catch (err) {
      setActionError(err.message || 'Could not change role.');
    }
  };

  const handleRemove = async (targetUserId, label) => {
    setRowMenuOpen(null);
    if (
      !window.confirm(
        `Remove ${label} from this organisation? They will lose access immediately.`
      )
    ) {
      return;
    }
    setActionError('');
    try {
      const { error } = await supabase.rpc('remove_member', {
        p_organisation_id: activeOrgId,
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      await load();
    } catch (err) {
      setActionError(err.message || 'Could not remove member.');
    }
  };

  const handleRevoke = async (invitationId) => {
    setRowMenuOpen(null);
    setActionError('');
    try {
      const { error } = await supabase.rpc('revoke_invitation', {
        p_invitation_id: invitationId,
      });
      if (error) throw error;
      await load();
    } catch (err) {
      setActionError(err.message || 'Could not revoke invitation.');
    }
  };

  const visibleInvitations = invitations.filter(
    (inv) => canManage || (inv.email || '').toLowerCase() === (session?.user?.email || '').toLowerCase()
  );

  const memberLabel = (m) => m.display_name || m.email || 'Member';

  return (
    <OrganisationPage
      title="Members"
      subtitle="People with access to this organisation, their roles and invitations."
    >
      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {members.length} {members.length === 1 ? 'member' : 'members'}
          {canManage && ' · you can invite and manage access'}
        </div>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setInviteOpen(true)}>
            <UserPlus size={14} aria-hidden="true" />
            <span>Invite Member</span>
          </button>
        )}
      </div>

      {actionError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: '#FEF2F2',
            color: 'var(--status-error)',
            border: '1px solid #FECACA',
            fontSize: '12.5px',
            marginBottom: '14px',
          }}
        >
          <AlertCircle size={14} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Members table */}
      <div className="surface-card" style={{ marginBottom: '24px' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Loading members...
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No members found.
          </div>
        ) : (
          <table className="data-table-clean">
            <thead>
              <tr>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Name
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Email
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Role
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Joined
                </th>
                <th style={{ padding: '10px 20px', width: '48px' }} />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === myUserId;
                const isOwnerRow = m.role === 'owner';
                const canRemoveRow = canManage && !isSelf && !isOwnerRow;
                return (
                  <tr key={m.id}>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="upcoming-avatar" style={{ backgroundColor: '#3B82F6' }}>
                          {memberLabel(m)[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {memberLabel(m)}
                          {isSelf && (
                            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                              {' '}· you
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {m.email || '—'}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      {canChangeRoles && !isOwnerRow ? (
                        <select
                          className="form-input"
                          style={{ padding: '4px 8px', fontSize: '12px', width: '110px' }}
                          value={m.role}
                          onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                          aria-label={`Role for ${memberLabel(m)}`}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className={`library-tag-pill ${ROLE_PILL[m.role] || 'tag-gray'}`}>
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span className={`library-tag-pill ${STATUS_PILL[m.status] || 'tag-gray'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }} className="tabular-nums">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', position: 'relative' }}>
                      {canRemoveRow && (
                        <>
                          <button
                            type="button"
                            className="detail-icon-btn"
                            onClick={() =>
                              setRowMenuOpen(rowMenuOpen === m.id ? null : m.id)
                            }
                            aria-label="Member actions"
                            title="Member actions"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                          {rowMenuOpen === m.id && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                right: '12px',
                                zIndex: 40,
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                                minWidth: '160px',
                                padding: '4px',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleRemove(m.user_id, memberLabel(m))}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  width: '100%',
                                  padding: '8px 10px',
                                  fontSize: '12.5px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: 'transparent',
                                  color: 'var(--status-error)',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                              >
                                <Trash2 size={13} aria-hidden="true" />
                                <span>Remove member</span>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invitations */}
      <div className="surface-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Invitations
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {visibleInvitations.length} total
          </span>
        </div>

        {visibleInvitations.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
            {canManage
              ? 'No invitations yet. Invite a teammate to get started.'
              : 'No invitations for you.'}
          </div>
        ) : (
          <table className="data-table-clean">
            <thead>
              <tr>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Email
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Role
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: '10px 20px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Expires
                </th>
                <th style={{ padding: '10px 20px', width: '120px' }} />
              </tr>
            </thead>
            <tbody>
              {visibleInvitations.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-primary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Mail size={13} color="#94A3B8" aria-hidden="true" />
                      {inv.email}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span className={`library-tag-pill ${ROLE_PILL[inv.role] || 'tag-gray'}`}>
                      {inv.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span className={`library-tag-pill ${INVITE_PILL[inv.status] || 'tag-gray'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }} className="tabular-nums">
                    {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    {canManage && inv.status === 'pending' && (
                      <button
                        type="button"
                        className="btn-danger-subtle"
                        onClick={() => handleRevoke(inv.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="modal-overlay" onClick={() => setInviteOpen(false)}>
          <div
            className="modal-content"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Invite Member
              </h2>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                style={{ color: 'var(--text-secondary)', padding: '2px', borderRadius: '4px' }}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {inviteError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#FEF2F2',
                  color: 'var(--status-error)',
                  border: '1px solid #FECACA',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                }}
              >
                <AlertCircle size={14} aria-hidden="true" />
                <span>{inviteError}</span>
              </div>
            )}
            {inviteSuccess && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#F0FDF4',
                  color: 'var(--status-success, #16A34A)',
                  border: '1px solid #BBF7D0',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                }}
              >
                <Mail size={14} aria-hidden="true" />
                <span>{inviteSuccess}</span>
              </div>
            )}

            <form onSubmit={handleInvite}>
              <div className="form-group">
                <label className="form-label" htmlFor="invite-email">
                  Email Address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  className="form-input"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="invite-role">
                  Role
                </label>
                <select
                  id="invite-role"
                  className="form-input"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option value="member">Member — access shared meetings</option>
                  <option value="admin">Admin — manage members and meetings</option>
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '20px',
                }}
              >
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setInviteOpen(false)}
                  disabled={inviteBusy}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={inviteBusy}>
                  {inviteBusy ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </OrganisationPage>
  );
}
