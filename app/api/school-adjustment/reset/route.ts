import { NextResponse } from 'next/server';
import { getSupabaseAdmin, hasSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: { schoolId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const schoolId = typeof body.schoolId === 'string' ? body.schoolId.trim() : '';
  if (!schoolId) {
    return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('school_adjustment_submissions')
      .delete()
      .eq('school_id', schoolId);

    if (error) {
      console.error('[school-adjustment/reset] error:', error);
      return NextResponse.json({ error: 'Failed to delete submissions' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[school-adjustment/reset] throw:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
