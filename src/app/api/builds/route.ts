/**
 * GET /api/builds — list team builds with pagination
 * Uses separate queries (no PostgREST joins) because env_builds has no FK constraints.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER, SUPABASE_TEAM_HEADER } from '@/configs/api'
import { supabaseAdmin } from '@/core/shared/clients/supabase/admin'
import { l } from '@/core/shared/clients/logger/logger'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

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
  const rawStatuses = sp.getAll('statuses').flatMap((s) => s.split(','))
  const statuses = rawStatuses.length > 0 ? rawStatuses : ['building', 'failed', 'success']
  const limit = Math.min(Math.max(1, Number(sp.get('limit') ?? DEFAULT_LIMIT)), MAX_LIMIT)
  const cursor = sp.get('cursor') ?? null
  const buildIdOrTemplate = sp.get('build_id_or_template') ?? null

  // Step 1: get all env_ids belonging to this team
  const { data: teamEnvs, error: envsError } = await supabaseAdmin
    .from('envs')
    .select('id')
    .eq('team_id', teamId)

  if (envsError) {
    l.error({ key: 'api_builds:envs_error', error: envsError.message }, 'failed to fetch team envs')
    return NextResponse.json({ code: 500, message: envsError.message }, { status: 500 })
  }

  if (!teamEnvs || teamEnvs.length === 0) {
    return NextResponse.json({ data: [], nextCursor: null })
  }

  const envIds = teamEnvs.map((e) => e.id)

  // Step 2: query builds for those envs
  let query = supabaseAdmin
    .from('env_builds')
    .select('id, env_id, status, reason, created_at, finished_at')
    .in('env_id', envIds)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  // Cursor-based pagination: "created_at|build_id"
  if (cursor) {
    const parts = cursor.split('|')
    if (parts.length === 2 && parts[0] && parts[1]) {
      query = query.or(
        `created_at.lt.${parts[0]},and(created_at.eq.${parts[0]},id.lt.${parts[1]})`
      )
    }
  }

  // Optional filter by build ID or template (env) ID
  if (buildIdOrTemplate) {
    const term = buildIdOrTemplate.trim()
    query = query.or(`id.eq.${term},env_id.eq.${term}`)
  }

  const { data: builds, error: buildsError } = await query

  if (buildsError) {
    l.error({ key: 'api_builds:builds_error', error: buildsError.message }, 'failed to fetch builds')
    return NextResponse.json({ code: 500, message: buildsError.message }, { status: 500 })
  }

  const rows = builds ?? []
  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows

  if (pageRows.length === 0) {
    return NextResponse.json({ data: [], nextCursor: null })
  }

  // Step 3: get aliases for the env_ids that appear in this page
  const pageEnvIds = [...new Set(pageRows.map((r) => r.env_id))]
  const { data: aliases } = await supabaseAdmin
    .from('env_aliases')
    .select('env_id, alias')
    .in('env_id', pageEnvIds)

  const aliasMap: Record<string, string> = {}
  for (const a of aliases ?? []) {
    if (!aliasMap[a.env_id]) aliasMap[a.env_id] = a.alias
  }

  const data = pageRows.map((row) => ({
    id: row.id,
    template: aliasMap[row.env_id] ?? row.env_id,
    templateId: row.env_id,
    status: row.status as 'building' | 'failed' | 'success',
    statusMessage: extractStatusMessage(row.reason),
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? null,
  }))

  const last = pageRows.at(-1)
  const nextCursor = hasNextPage && last ? `${last.created_at}|${last.id}` : null

  return NextResponse.json({ data, nextCursor })
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
