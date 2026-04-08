import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

type Params = { params: Promise<{ teamSlug: string }> }

/** PATCH /api/teams/[teamSlug] — update name or profile picture (teamSlug is the team UUID here) */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { teamSlug: teamId } = await params
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)

  if (!token) {
    return NextResponse.json({ code: 401, message: 'missing token' }, { status: 401 })
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ code: 401, message: 'invalid token' }, { status: 401 })
  }

  const { data: membership } = await supabaseAdmin
    .from('users_teams')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .single()

  if (!membership) {
    return NextResponse.json({ code: 403, message: 'not a team member' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim()
  }
  if ('profilePictureUrl' in body) {
    updates.profile_picture_url = body.profilePictureUrl ?? null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ code: 400, message: 'no valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .update(updates)
    .eq('id', teamId)
    .select('id, name, profile_picture_url')
    .single()

  if (error || !data) {
    l.error({ key: 'api_team:update_error', error: error?.message }, 'failed to update team')
    return NextResponse.json({ code: 500, message: error?.message ?? 'update failed' }, { status: 500 })
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    profilePictureUrl: data.profile_picture_url ?? null,
  })
}
