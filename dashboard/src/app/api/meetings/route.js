import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fallback owner ID for individual meetings when user auth is anonymous/guest
const DEFAULT_OWNER_ID = 'b5884cfe-8091-4512-b236-1a7bfa060e2e'; // Harsh Vardhan Tripathi

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      title,
      meet_link,
      scheduled_start,
      expected_duration_minutes = 30,
      status = 'scheduled',
      workspace_type = 'individual',
      organisation_id = null,
      visibility = 'organisation',
      user_id = null,
    } = body;

    if (!title || !meet_link) {
      return NextResponse.json(
        { error: 'Meeting title and meet_link are required.' },
        { status: 400 }
      );
    }

    // Determine client to use: service role key bypasses RLS safely from server
    const clientKey = serviceRoleKey || anonKey;
    const adminSupabase = createClient(supabaseUrl, clientKey, {
      auth: { persistSession: false },
    });

    const targetOwner = user_id || (workspace_type === 'individual' ? DEFAULT_OWNER_ID : null);

    const payload = {
      title: title.trim(),
      meet_link: meet_link.trim(),
      scheduled_start: scheduled_start || new Date().toISOString(),
      expected_duration_minutes: parseInt(expected_duration_minutes, 10) || 30,
      status: status || 'scheduled',
      workspace_type: organisation_id ? 'organisation' : 'individual',
      organisation_id: organisation_id || null,
      owner_id: targetOwner,
      user_id: targetOwner,
    };

    if (organisation_id) {
      payload.visibility = visibility;
    }

    const { data, error } = await adminSupabase
      .from('meetings')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('API /api/meetings insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meeting: data }, { status: 201 });
  } catch (err) {
    console.error('API /api/meetings server error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
