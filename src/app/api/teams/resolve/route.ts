import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

export async function GET(request: NextRequest) {
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)
  const slug = request.nextUrl.searchParams.get('slug')

  if (!token) {
    return NextResponse.json({ code: 401, message: 'missing token' }, { status: 401 })
  }

  if (!slug) {
    return NextResponse.json({ code: 400, message: 'missing slug' }, { status: 400 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    l.warn({ key: 'api_teams_resolve:auth_error', error: authError?.message }, 'invalid token')
    return NextResponse.json({ code: 401, message: 'invalid token' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, slug, users_teams!inner(user_id)')
    .eq('slug', slug)
    .eq('users_teams.user_id', user.id)
    .single()

  if (error || !data) {
    l.warn({ key: 'api_teams_resolve:not_found', slug, user_id: user.id }, 'team not found')
    return NextResponse.json({ code: 404, message: 'team not found' }, { status: 404 })
  }

  return NextResponse.json({ id: data.id, slug: data.slug })
}
