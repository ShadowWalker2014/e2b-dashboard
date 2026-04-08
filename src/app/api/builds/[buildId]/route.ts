/**
 * GET /api/builds/[buildId] — get build details
 * Uses separate queries (no PostgREST joins) because env_builds has no FK constraints.
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

  // Get the build
  const { data: build, error } = await supabaseAdmin
    .from('env_builds')
    .select('id, env_id, status, reason, created_at, finished_at')
    .eq('id', buildId)
    .single()

  if (error || !build) {
    return NextResponse.json({ code: 404, message: 'build not found' }, { status: 404 })
  }

  // Verify build belongs to this team
  const { data: env } = await supabaseAdmin
    .from('envs')
    .select('id')
    .eq('id', build.env_id)
    .eq('team_id', teamId)
    .single()

  if (!env) {
    return NextResponse.json({ code: 404, message: 'build not found' }, { status: 404 })
  }

  // Get template aliases
  const { data: aliases } = await supabaseAdmin
    .from('env_aliases')
    .select('alias')
    .eq('env_id', build.env_id)

  const names = (aliases ?? []).map((a) => a.alias)

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
