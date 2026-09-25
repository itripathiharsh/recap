'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Loader2, Plus, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';

export default function WorkspaceSwitcher() {
  const { session, workspaces, activeWorkspace, isOrganisation, switchWorkspace, refreshWorkspaces } =
    useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [invitations, setInvitations] = useState([]);
  const [acceptingId, setAcceptingId] = useState(null);
  const [acceptError, setAcceptError] = useState('');
  const containerRef = useRef(null);
  const modalRef = useRef(null);

  const myEmail = session?.user?.email || '';

  const loadInvitations = React.useCallback(async () => {
    if (!myEmail) {
      setInvitations([]);
      return;
    }
    try {
      const { data, error: invErr } = await supabase
        .from('organisation_invitations')
        .select('id, organisation_id, role, email, expires_at, organisations ( name )')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      if (invErr) throw invErr;
      const wanted = myEmail.toLowerCase();
      setInvitations(
        (data || []).filter((inv) => (inv.email || '').toLowerCase() === wanted)
      );
    } catch (err) {
      console.error('Invitation load error:', err);
    }
  }, [myEmail]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  useEffect(() => {
    function handleOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        setCreateOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleSelect = (id) => {
    switchWorkspace(id);
    setOpen(false);
  };

  const handleAccept = async (invitationId) => {
    setAcceptError('');
    setAcceptingId(invitationId);
    try {
      const { error: acceptErr } = await supabase.rpc('accept_invitation', {
        p_invitation_id: invitationId,
      });
      if (acceptErr) throw acceptErr;
      await loadInvitations();
      await refreshWorkspaces();
    } catch (err) {
      console.error('Accept invitation error:', err);
      setAcceptError(err.message || 'Could not accept invitation.');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setError('');
    if (!orgName.trim()) {
      setError('Organisation name is required.');
      return;
    }
    setCreating(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('create_organisation', {
        p_name: orgName.trim(),
      });
      if (rpcError) throw rpcError;
      setOrgName('');
      setCreateOpen(false);
      await refreshWorkspaces();
      const created = Array.isArray(data) ? data[0] : data;
      if (created?.id) switchWorkspace(created.id);
    } catch (err) {
      console.error('Create organisation error:', err);
      setError(err.message || 'Could not create organisation.');
    } finally {
      setCreating(false);
    }
  };

  const initials = (activeWorkspace.name || 'W')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="workspace-switcher" ref={containerRef}>
      <button
        type="button"
        className="workspace-switcher-btn"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) loadInvitations();
            return next;
          });
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch workspace"
      >
        <span className={`workspace-switcher-avatar ${isOrganisation ? 'org' : ''}`} aria-hidden="true">
          {isOrganisation ? <Building2 size={14} strokeWidth={2} /> : initials}
        </span>
        <span className="workspace-switcher-label">
          <span className="workspace-switcher-name">{activeWorkspace.name}</span>
          <span className="workspace-switcher-type">
            {isOrganisation ? 'Organisation' : 'Individual'}
          </span>
        </span>
        <ChevronDown
          size={14}
          color="#94A3B8"
          aria-hidden="true"
          className={open ? 'workspace-switcher-chevron open' : 'workspace-switcher-chevron'}
        />
      </button>

      {open && (
        <div className="workspace-menu" role="menu">
          <div className="workspace-menu-label">Workspaces</div>
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspace.id;
            const Icon = ws.type === 'organisation' ? Building2 : User;
            return (
              <button
                key={ws.id}
                type="button"
                role="menuitem"
                className="workspace-menu-item"
                onClick={() => handleSelect(ws.id)}
              >
                <Icon size={14} color={isActive ? '#0066FF' : '#64748B'} aria-hidden="true" />
                <span className="workspace-menu-item-name">{ws.name}</span>
                {ws.type === 'organisation' && ws.role && (
                  <span className="workspace-menu-item-role">{ws.role}</span>
                )}
                {isActive && <Check size={14} color="#0066FF" aria-hidden="true" />}
              </button>
            );
          })}
          <div className="workspace-menu-divider" />
          {invitations.length > 0 && (
            <>
              <div className="workspace-menu-label">Invitations</div>
              {invitations.map((inv) => {
                const orgNameLabel = Array.isArray(inv.organisations)
                  ? inv.organisations[0]?.name
                  : inv.organisations?.name;
                return (
                  <div key={inv.id} className="workspace-menu-invite">
                    <div className="workspace-menu-invite-info">
                      <span className="workspace-menu-item-name">
                        {orgNameLabel || 'Organisation'}
                      </span>
                      <span className="workspace-menu-item-role">as {inv.role}</span>
                    </div>
                    <button
                      type="button"
                      className="workspace-menu-invite-accept"
                      onClick={() => handleAccept(inv.id)}
                      disabled={acceptingId === inv.id}
                    >
                      {acceptingId === inv.id ? 'Joining...' : 'Accept'}
                    </button>
                  </div>
                );
              })}
              {acceptError && (
                <div className="workspace-menu-invite-error">{acceptError}</div>
              )}
              <div className="workspace-menu-divider" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="workspace-menu-item workspace-menu-create"
            onClick={() => {
              setOpen(false);
              setError('');
              setCreateOpen(true);
            }}
          >
            <Plus size={14} aria-hidden="true" />
            <span className="workspace-menu-item-name">Create Organisation</span>
          </button>
        </div>
      )}

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div
            className="modal-content"
            ref={modalRef}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Create Organisation
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              You will become the owner and can invite members afterwards.
            </p>

            {error && (
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
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label" htmlFor="org-name">
                  Organisation Name
                </label>
                <input
                  id="org-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Sentio Mind"
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Loader2 size={14} style={{ animation: 'workspace-spin 1s linear infinite' }} />
                      Creating...
                    </span>
                  ) : (
                    'Create Organisation'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
