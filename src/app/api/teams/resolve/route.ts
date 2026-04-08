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

  // Find team by slug
  const { data: team, error: teamError } = await supabaseAdmin
    .from('teams')
    .select('id, slug')
    .eq('slug', slug)
    .single()

  if (teamError || !team) {
    l.warn({ key: 'api_teams_resolve:team_not_found', slug }, 'team not found')
    return NextResponse.json({ code: 404, message: 'team not found' }, { status: 404 })
  }

  // Verify user is a member
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('users_teams')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_id', team.id)
    .single()

  if (membershipError || !membership) {
    l.warn({ key: 'api_teams_resolve:not_member', slug, user_id: user.id }, 'user not member of team')
    return NextResponse.json({ code: 404, message: 'team not found' }, { status: 404 })
  }

  return NextResponse.json({ id: team.id, slug: team.slug })
}
