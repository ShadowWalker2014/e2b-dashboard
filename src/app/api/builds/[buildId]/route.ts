/**
 * GET /api/builds/[buildId] — get build details including template names
 */

import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER, SUPABASE_TEAM_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

type Params = { params: Promise<{ buildId: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { buildId } = await params
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

  const { data: build, error } = await supabaseAdmin
    .from('env_builds')
    .select(`
      id,
      env_id,
      status,
      reason,
      created_at,
      finished_at,
      envs!inner ( team_id, id ),
      env_aliases ( alias )
    `)
    .eq('id', buildId)
    .eq('envs.team_id', teamId)
    .single()

  if (error || !build) {
    if (error?.code === 'PGRST116') {
      return NextResponse.json({ code: 404, message: 'build not found' }, { status: 404 })
    }
    l.error({ key: 'api_build:db_error', error: error?.message }, 'failed to fetch build')
    return NextResponse.json({ code: 500, message: error?.message ?? 'not found' }, { status: 500 })
  }

  const aliases = Array.isArray(build.env_aliases) ? build.env_aliases : []
  const names = aliases.map((a: { alias: string }) => a.alias)

  return NextResponse.json({
    names: names.length > 0 ? names : null,
    createdAt: build.created_at,
    finishedAt: build.finished_at ?? null,
    status: build.status as 'building' | 'failed' | 'success',
    statusMessage: extractStatusMessage(build.reason),
  })
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
