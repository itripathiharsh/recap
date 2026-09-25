'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from './supabase';
import {
  applyWorkspaceScope,
  filterToMeetings,
  resolveInitialWorkspace,
} from './workspaceScope.mjs';

// Re-export pure helpers so existing imports keep working.
export { applyWorkspaceScope, filterToMeetings, resolveInitialWorkspace };

const WorkspaceContext = createContext(null);
const STORAGE_KEY = 'recap.activeWorkspace';

const PERSONAL = { id: 'personal', name: 'Personal Workspace', type: 'individual', role: null };

export function WorkspaceProvider({ session, children }) {
  const [orgs, setOrgs] = useState([]);
  const [activeId, setActiveId] = useState('personal');
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    if (!session) {
      setOrgs([]);
      setActiveId('personal');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organisation_members')
        .select('organisation_id, role, organisations ( id, name )');
      if (error) throw error;

      const list = (data || [])
        .map((row) => {
          const org = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;
          if (!org) return null;
          return {
            id: row.organisation_id,
            name: org.name,
            type: 'organisation',
            role: row.role,
          };
        })
        .filter(Boolean);
      setOrgs(list);

      let stored = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        stored = null;
      }
      const isValid = stored && (stored === 'personal' || list.some((o) => o.id === stored));
      setActiveId(resolveInitialWorkspace(stored, list));
      if (!isValid && stored) {
        // stored workspace no longer valid — reset silently
        try {
          localStorage.setItem(STORAGE_KEY, 'personal');
        } catch {
          // storage unavailable
        }
      }
    } catch (err) {
      console.error('Workspace load error:', err);
      setOrgs([]);
      setActiveId('personal');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Best-effort profile row creation for the signed-in user (RLS is self-only).
  useEffect(() => {
    if (!session) return;
    const name = session.user?.user_metadata?.name || null;
    supabase
      .rpc('ensure_my_profile', { p_name: name })
      .then(({ error }) => {
        if (error) console.error('ensure_my_profile error:', error);
      })
      .catch((err) => console.error('ensure_my_profile error:', err));
  }, [session]);

  const switchWorkspace = useCallback((id) => {
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage unavailable — session-only switch
    }
  }, []);

  const value = useMemo(() => {
    const activeOrg = activeId === 'personal' ? null : orgs.find((o) => o.id === activeId) || null;
    const activeWorkspace = activeOrg || PERSONAL;
    return {
      session,
      loading,
      workspaces: [PERSONAL, ...orgs],
      activeWorkspace,
      activeWorkspaceId: activeId,
      activeOrgId: activeOrg ? activeOrg.id : null,
      activeOrgRole: activeOrg ? activeOrg.role : null,
      isOrganisation: Boolean(activeOrg),
      switchWorkspace,
      refreshWorkspaces: loadWorkspaces,
    };
  }, [orgs, activeId, loading, switchWorkspace, loadWorkspaces, session]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
