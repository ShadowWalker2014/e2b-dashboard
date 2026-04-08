/**
 * GET /api/builds/statuses — get status for specific build IDs
 * Uses separate queries (no PostgREST joins) because env_builds has no FK constraints.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER, SUPABASE_TEAM_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

export async function GET(request: NextRequest) {
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)
  const teamId = request.headers.get(SUPABASE_TEAM_HEADER)

  if (!token || !teamId) {
    return NextResponse.json({ code: 401, message: 'missing auth headers' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
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

  const sp = request.nextUrl.searchParams
  const buildIds = sp.getAll('build_ids').flatMap((s) => s.split(','))

  if (buildIds.length === 0) {
    return NextResponse.json({ buildStatuses: [] })
  }

  // Get builds by ID
  const { data: builds, error } = await supabaseAdmin
    .from('env_builds')
    .select('id, env_id, status, finished_at, reason')
    .in('id', buildIds)

  if (error) {
    l.error({ key: 'api_builds_statuses:db_error', error: error.message }, 'failed to fetch build statuses')
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 })
  }

  // Verify all returned builds belong to this team
  const envIds = [...new Set((builds ?? []).map((b) => b.env_id))]
  const { data: teamEnvs } = await supabaseAdmin
    .from('envs')
    .select('id')
    .eq('team_id', teamId)
    .in('id', envIds)

  const teamEnvSet = new Set((teamEnvs ?? []).map((e) => e.id))

  const buildStatuses = (builds ?? [])
    .filter((b) => teamEnvSet.has(b.env_id))
    .map((row) => ({
      id: row.id,
      status: row.status as 'building' | 'failed' | 'success',
      finishedAt: row.finished_at ?? null,
      statusMessage: extractStatusMessage(row.reason),
    }))

  return NextResponse.json({ buildStatuses })
}

function extractStatusMessage(reason: unknown): string | null {
  if (!reason) return null
  if (typeof reason === 'string') return reason
  if (typeof reason === 'object' && reason !== null) {
    const r = reason as Record<string, unknown>
    if (typeof r.message === 'string') return r.message
    if (typeof r.error === 'string') return r.error
  }
  return null
}
