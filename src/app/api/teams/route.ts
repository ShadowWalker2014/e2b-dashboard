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

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select(`
      id, name, slug, email, tier,
      is_banned, is_blocked, blocked_reason, profile_picture_url,
      users_teams!inner ( is_default ),
      team_limits!inner (
        max_length_hours, concurrent_sandboxes, concurrent_template_builds,
        max_vcpu, max_ram_mb, disk_mb
      )
    `)
    .eq('users_teams.user_id', user.id)

  if (error) {
    l.error({ key: 'api_teams:db_error', error: error.message }, 'failed to fetch teams')
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 })
  }

  const teams = (data ?? []).map((row) => {
    const ut = Array.isArray(row.users_teams) ? row.users_teams[0] : row.users_teams
    const tl = Array.isArray(row.team_limits) ? row.team_limits[0] : row.team_limits
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      tier: row.tier,
      email: row.email,
      profilePictureUrl: row.profile_picture_url,
      isBlocked: row.is_blocked,
      isBanned: row.is_banned,
      blockedReason: row.blocked_reason,
      isDefault: ut?.is_default ?? false,
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

  return NextResponse.json({ teams })
}
