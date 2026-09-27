'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Building2,
  LogIn,
  LogOut,
  Mail,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const inviteParam = searchParams.get('invite') || searchParams.get('token') || searchParams.get('id');
  const orgParam = searchParams.get('org') || searchParams.get('org_id');
  const roleParam = searchParams.get('role') || 'member';

  const [session, setSession] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Invitation info
  const [inviteDetails, setInviteDetails] = useState(null);
  const [orgDetails, setOrgDetails] = useState(null);
  const [isAlreadyMember, setIsAlreadyMember] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      setErrorMsg('');

      // 1. Get current session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentSession = sessionData?.session || null;
      if (mounted) {
        setSession(currentSession);
        setCurrentUserEmail(currentSession?.user?.email || '');
      }

      // 2. Validate parameters
      if (!inviteParam && !orgParam) {
        if (mounted) {
          setErrorMsg('Invalid join link. No invitation token or organisation was specified.');
          setLoading(false);
        }
        return;
      }

      // 3. Flow A: Invitation by ID/token
      if (inviteParam) {
        try {
          const { data: invData, error: invErr } = await supabase.rpc('get_invitation_details', {
            p_invitation_id: inviteParam,
          });

          if (invErr) {
            throw invErr;
          }

          if (!invData || !invData.valid) {
            if (mounted) {
              setErrorMsg(invData?.error || 'This invitation is invalid or has expired.');
              setLoading(false);
            }
            return;
          }

          if (mounted) {
            setInviteDetails(invData);
          }

          // Check if current user is already an active member of this org
          if (currentSession?.user?.id) {
            const { data: memberData } = await supabase
              .table('organisation_members')
              .select('id, role')
              .eq('organisation_id', invData.organisation_id)
              .eq('user_id', currentSession.user.id)
              .maybeSingle();

            if (memberData && mounted) {
              setIsAlreadyMember(true);
            }
          }
        } catch (err) {
          if (mounted) {
            setErrorMsg(err.message || 'Could not verify invitation.');
          }
        } finally {
          if (mounted) setLoading(false);
        }
        return;
      }

      // 4. Flow B: Direct organisation link
      if (orgParam) {
        try {
          const { data: orgData, error: orgErr } = await supabase
            .table('organisations')
            .select('id, name')
            .eq('id', orgParam)
            .maybeSingle();

          if (orgErr || !orgData) {
            if (mounted) {
              setErrorMsg('Organisation not found. The workspace link may be invalid or deleted.');
              setLoading(false);
            }
            return;
          }

          if (mounted) {
            setOrgDetails(orgData);
          }

          if (currentSession?.user?.id) {
            const { data: memberData } = await supabase
              .table('organisation_members')
              .select('id, role')
              .eq('organisation_id', orgParam)
              .eq('user_id', currentSession.user.id)
              .maybeSingle();

            if (memberData && mounted) {
              setIsAlreadyMember(true);
            }
          }
        } catch (err) {
          if (mounted) {
            setErrorMsg(err.message || 'Could not verify workspace link.');
          }
        } finally {
          if (mounted) setLoading(false);
        }
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [inviteParam, orgParam]);

  // Handle accepting invitation
  const handleAcceptInvite = async () => {
    if (!session) {
      const redirectUrl = `/join?invite=${encodeURIComponent(inviteParam)}`;
      router.push(`/login?redirectTo=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.rpc('accept_invitation', {
        p_invitation_id: inviteParam,
      });

      if (error) throw error;

      setSuccessMsg(`Welcome to ${inviteDetails?.organisation_name || 'the workspace'}!`);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle direct join link
  const handleDirectJoin = async () => {
    if (!session) {
      const redirectUrl = `/join?org=${encodeURIComponent(orgParam)}&role=${encodeURIComponent(roleParam)}`;
      router.push(`/login?redirectTo=${encodeURIComponent(redirectUrl)}`);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.rpc('join_organisation_by_link', {
        p_organisation_id: orgParam,
        p_role: roleParam,
      });

      if (error) throw error;

      setSuccessMsg(`You have joined ${orgDetails?.name || 'the workspace'}!`);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to join organisation.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPathWithParams = typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : `/join?${inviteParam ? `invite=${inviteParam}` : `org=${orgParam}`}`;

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-3">
            <Users className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Join Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">Recap Meet Recorder Collaborative Hub</p>
        </div>

        {/* Card */}
        <div className="bg-[#0F1420] border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-xl">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-400">Verifying link details...</p>
            </div>
          ) : errorMsg ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-red-300">Unable to Join</h3>
                  <p className="text-xs text-red-200/80 mt-1 leading-relaxed">{errorMsg}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/dashboard"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium text-center transition-colors"
                >
                  Return to Dashboard
                </Link>
                <Link
                  href="/login"
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 text-sm font-medium text-center transition-colors"
                >
                  Sign in with another account
                </Link>
              </div>
            </div>
          ) : successMsg ? (
            <div className="space-y-5 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Success!</h3>
                <p className="text-sm text-slate-300 mt-1">{successMsg}</p>
                <p className="text-xs text-slate-500 mt-2">Redirecting to workspace dashboard...</p>
              </div>
            </div>
          ) : isAlreadyMember ? (
            <div className="space-y-5 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Already a Member</h3>
                <p className="text-sm text-slate-300 mt-1">
                  You are already a member of{' '}
                  <span className="font-semibold text-white">
                    {inviteDetails?.organisation_name || orgDetails?.name || 'this workspace'}
                  </span>
                  .
                </p>
              </div>
              <Link
                href="/dashboard"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : inviteDetails ? (
            /* Invitation Flow View */
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-3">
                  <Building2 className="w-3.5 h-3.5" />
                  Invitation to Join
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {inviteDetails.organisation_name}
                </h2>
                <p className="text-xs text-slate-400 mt-1.5">
                  Role:{' '}
                  <span className="capitalize font-medium text-slate-200">
                    {inviteDetails.role}
                  </span>
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Invitation Sent To:</span>
                  <span className="font-mono text-slate-200">{inviteDetails.email}</span>
                </div>
                {session ? (
                  <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800/60">
                    <span>Signed In As:</span>
                    <span className="font-mono text-slate-200">{currentUserEmail}</span>
                  </div>
                ) : null}
              </div>

              {session &&
              currentUserEmail.toLowerCase() !== inviteDetails.email.toLowerCase() ? (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200/90 leading-relaxed">
                  Notice: This invitation was addressed to{' '}
                  <strong className="text-amber-100">{inviteDetails.email}</strong>. You are currently
                  signed in as <strong className="text-amber-100">{currentUserEmail}</strong>.
                </div>
              ) : null}

              <div className="space-y-2.5">
                {session ? (
                  <button
                    type="button"
                    onClick={handleAcceptInvite}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Accept & Join Workspace
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    href={`/login?redirectTo=${encodeURIComponent(currentPathWithParams)}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign In to Accept Invitation
                  </Link>
                )}

                {session ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      window.location.reload();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out / Switch Account
                  </button>
                ) : null}
              </div>
            </div>
          ) : orgDetails ? (
            /* Direct Link Flow View */
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
                  <Building2 className="w-3.5 h-3.5" />
                  Workspace Invite Link
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">{orgDetails.name}</h2>
                <p className="text-xs text-slate-400 mt-1.5">
                  You are invited to collaborate as{' '}
                  <span className="capitalize font-medium text-slate-200">{roleParam}</span>.
                </p>
              </div>

              {session ? (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Signed In As:</span>
                    <span className="font-mono text-slate-200">{currentUserEmail}</span>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2.5">
                {session ? (
                  <button
                    type="button"
                    onClick={handleDirectJoin}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Join {orgDetails.name}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                ) : (
                  <Link
                    href={`/login?redirectTo=${encodeURIComponent(currentPathWithParams)}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign In to Join
                  </Link>
                )}

                {session ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      window.location.reload();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out / Switch Account
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07090E] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
