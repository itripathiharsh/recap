import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Meeting ID required' }, { status: 400 });
    }

    const ghToken = process.env.GITHUB_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
    const ghRepo = process.env.GITHUB_REPO || 'itripathiharsh/recap';

    if (!ghToken) {
      return NextResponse.json(
        { error: 'GITHUB_DISPATCH_TOKEN is not configured in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://api.github.com/repos/${ghRepo}/actions/workflows/record_meeting.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            meeting_id: id,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `GitHub API error (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    // Immediately reflect joining status in Supabase so UI shows live timer without waiting for runner boot
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const client = createClient(supabaseUrl, supabaseKey);
        await client.from('meetings').update({
          status: 'joining',
          started_at: new Date().toISOString(),
          error_message: null,
        }).eq('id', id);
      }
    } catch (dbErr) {
      console.error('Failed to update meeting status to joining in Supabase:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: `Triggered GitHub Actions runner for meeting ${id}. Bot will spin up in ~15-20 seconds.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
