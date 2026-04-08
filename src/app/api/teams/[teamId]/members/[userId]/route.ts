import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

type Params = { params: Promise<{ teamId: string; userId: string }> }

/** DELETE /api/teams/[teamId]/members/[userId] */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { teamId, userId } = await params
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)

  if (!token) {
    return NextResponse.json({ code: 401, message: 'missing token' }, { status: 401 })
  }

  const {
    data: { user: requestingUser },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token)

  if (authError || !requestingUser) {
    return NextResponse.json({ code: 401, message: 'invalid token' }, { status: 401 })
  }

  // Requesting user must be a member of the team
  const { data: membership } = await supabaseAdmin
    .from('users_teams')
    .select('team_id')
    .eq('user_id', requestingUser.id)
    .eq('team_id', teamId)
    .single()

  if (!membership) {
    return NextResponse.json({ code: 403, message: 'not a team member' }, { status: 403 })
  }

  // Prevent removing the only member / self if they're the sole member
  const { count } = await supabaseAdmin
    .from('users_teams')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)

  if ((count ?? 0) <= 1) {
    return NextResponse.json({ code: 400, message: 'cannot remove the last team member' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('users_teams')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) {
    l.error({ key: 'api_team_members:delete_error', error: error.message }, 'failed to remove member')
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
