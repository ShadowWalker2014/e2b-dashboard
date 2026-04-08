import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

export async function GET(request: NextRequest) {
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)

  if (!token) {
    return NextResponse.json({ code: 401, message: 'missing token' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !user) {
    l.warn({ key: 'api_teams:auth_error', error: authError?.message }, 'invalid token')
    return NextResponse.json({ code: 401, message: 'invalid token' }, { status: 401 })
  }

  // Step 1: get team memberships for user
  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from('users_teams')
    .select('team_id, is_default')
    .eq('user_id', user.id)

  if (membershipsError) {
    l.error({ key: 'api_teams:memberships_error', error: membershipsError.message }, 'failed to fetch memberships')
    return NextResponse.json({ code: 500, message: membershipsError.message }, { status: 500 })
  }

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ teams: [] })
  }

  const teamIds = memberships.map((m) => m.team_id)

  // Steps 2 & 3 in parallel — teams and limits are independent queries
  const [teamsResult, limitsResult] = await Promise.all([
    supabaseAdmin
      .from('teams')
      .select('id, name, slug, email, tier, is_banned, is_blocked, blocked_reason, profile_picture_url')
      .in('id', teamIds),
    supabaseAdmin
      .from('team_limits')
      .select('id, max_length_hours, concurrent_sandboxes, concurrent_template_builds, max_vcpu, max_ram_mb, disk_mb')
      .in('id', teamIds),
  ])

  if (teamsResult.error) {
    l.error({ key: 'api_teams:teams_error', error: teamsResult.error.message }, 'failed to fetch teams')
    return NextResponse.json({ code: 500, message: teamsResult.error.message }, { status: 500 })
  }

  if (limitsResult.error) {
    l.error({ key: 'api_teams:limits_error', error: limitsResult.error.message }, 'failed to fetch limits')
    return NextResponse.json({ code: 500, message: limitsResult.error.message }, { status: 500 })
  }

  const teams = teamsResult.data
  const limits = limitsResult.data

  const limitsMap = Object.fromEntries((limits ?? []).map((tl) => [tl.id, tl]))
  const membershipMap = Object.fromEntries(memberships.map((m) => [m.team_id, m.is_default]))

  const result = (teams ?? []).map((t) => {
    const tl = limitsMap[t.id]
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      tier: t.tier,
      email: t.email,
      profilePictureUrl: t.profile_picture_url ?? null,
      isBlocked: t.is_blocked ?? false,
      isBanned: t.is_banned ?? false,
      blockedReason: t.blocked_reason ?? null,
      isDefault: membershipMap[t.id] ?? false,
      limits: {
        maxLengthHours: Number(tl?.max_length_hours ?? 0),
        concurrentSandboxes: Number(tl?.concurrent_sandboxes ?? 0),
        concurrentTemplateBuilds: Number(tl?.concurrent_template_builds ?? 0),
        maxVcpu: Number(tl?.max_vcpu ?? 0),
        maxRamMb: Number(tl?.max_ram_mb ?? 0),
        diskMb: Number(tl?.disk_mb ?? 0),
      },
    }
  })

  return NextResponse.json({ teams: result })
}
