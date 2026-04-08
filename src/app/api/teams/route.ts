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

  // Query from users_teams joining teams + team_limits
  const { data, error } = await supabaseAdmin
    .from('users_teams')
    .select(`
      is_default,
      teams (
        id, name, slug, email, tier,
        is_banned, is_blocked, blocked_reason, profile_picture_url,
        team_limits ( max_length_hours, concurrent_sandboxes,
          concurrent_template_builds, max_vcpu, max_ram_mb, disk_mb )
      )
    `)
    .eq('user_id', user.id)

  if (error) {
    l.error({ key: 'api_teams:db_error', error: error.message, code: error.code }, 'failed to fetch teams')
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 })
  }

  const teams = (data ?? [])
    .map((row) => {
      const t = row.teams as Record<string, unknown> | null
      if (!t) return null
      const tl = Array.isArray(t.team_limits) ? t.team_limits[0] : t.team_limits
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
        isDefault: row.is_default ?? false,
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
    .filter(Boolean)

  return NextResponse.json({ teams })
}
