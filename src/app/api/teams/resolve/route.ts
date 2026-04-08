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

  // Check user is a member of this team
  const { data, error } = await supabaseAdmin
    .from('users_teams')
    .select('teams ( id, slug )')
    .eq('user_id', user.id)
    .eq('teams.slug', slug)
    .single()

  if (error || !data?.teams) {
    l.warn({ key: 'api_teams_resolve:not_found', slug, user_id: user.id, error: error?.message }, 'team not found')
    return NextResponse.json({ code: 404, message: 'team not found' }, { status: 404 })
  }

  const team = Array.isArray(data.teams) ? data.teams[0] : data.teams

  return NextResponse.json({ id: team.id, slug: team.slug })
}
