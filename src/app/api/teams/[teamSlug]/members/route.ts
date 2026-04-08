import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

type Params = { params: Promise<{ teamSlug: string }> }

async function authorizeTeamMember(token: string, teamId: string) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data } = await supabaseAdmin
    .from('users_teams')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  return data ? user : null
}

/** GET /api/teams/[teamSlug]/members (teamSlug is the team UUID from the API client) */
export async function GET(request: NextRequest, { params }: Params) {
  const { teamSlug: teamId } = await params
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)

  if (!token) {
    return NextResponse.json({ code: 401, message: 'missing token' }, { status: 401 })
  }

  const user = await authorizeTeamMember(token, teamId)
  if (!user) {
    return NextResponse.json({ code: 403, message: 'not a team member' }, { status: 403 })
  }

  // Use the FK constraint name to disambiguate: user_id → users vs added_by → users
  const { data: memberships, error } = await supabaseAdmin
    .from('users_teams')
    .select('user_id, is_default, added_by, created_at, users!users_teams_users_users(email)')
    .eq('team_id', teamId)

  if (error) {
    l.error({ key: 'api_team_members:db_error', error: error.message }, 'failed to fetch members')
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 })
  }

  const members = (memberships ?? []).map((m) => {
    const userRow = Array.isArray(m.users) ? m.users[0] : m.users
    return {
      id: m.user_id,
      email: userRow?.email ?? '',
      isDefault: m.is_default ?? false,
      addedBy: m.added_by ?? null,
      createdAt: m.created_at ?? null,
    }
  })

  return NextResponse.json({ members })
}

/** POST /api/teams/[teamSlug]/members — add member by email */
export async function POST(request: NextRequest, { params }: Params) {
  const { teamSlug: teamId } = await params
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)

  if (!token) {
    return NextResponse.json({ code: 401, message: 'missing token' }, { status: 401 })
  }

  const requestingUser = await authorizeTeamMember(token, teamId)
  if (!requestingUser) {
    return NextResponse.json({ code: 403, message: 'not a team member' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const email = body?.email as string | undefined

  if (!email) {
    return NextResponse.json({ code: 400, message: 'email is required' }, { status: 400 })
  }

  const { data: targetUser, error: lookupError } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .eq('email', email)
    .single()

  if (lookupError || !targetUser) {
    return NextResponse.json({ code: 404, message: 'user not found' }, { status: 404 })
  }

  const { data: existing } = await supabaseAdmin
    .from('users_teams')
    .select('team_id')
    .eq('team_id', teamId)
    .eq('user_id', targetUser.id)
    .single()

  if (existing) {
    return NextResponse.json({ code: 409, message: 'user is already a member' }, { status: 409 })
  }

  const { error: insertError } = await supabaseAdmin.from('users_teams').insert({
    team_id: teamId,
    user_id: targetUser.id,
    added_by: requestingUser.id,
    is_default: false,
  })

  if (insertError) {
    l.error({ key: 'api_team_members:insert_error', error: insertError.message }, 'failed to add member')
    return NextResponse.json({ code: 500, message: insertError.message }, { status: 500 })
  }

  return NextResponse.json({}, { status: 201 })
}
