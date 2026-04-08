/**
 * GET /api/builds — list team builds with pagination
 *
 * Query params: statuses, limit, cursor, build_id_or_template
 * Auth: X-Supabase-Token + X-Supabase-Team (team membership verified)
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

  // Verify membership
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

  // Cursor format: "created_at|build_id"
  let cursorCreatedAt: string | null = null
  let cursorBuildId: string | null = null
  if (cursor) {
    const parts = cursor.split('|')
    if (parts.length === 2 && parts[0] && parts[1]) {
      cursorCreatedAt = parts[0]
      cursorBuildId = parts[1]
    }
  }

  // Build query: env_builds joined with envs (for team filter) and env_aliases (for name)
  let query = supabaseAdmin
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
    .eq('envs.team_id', teamId)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1) // fetch one extra to detect next page

  // Cursor-based pagination
  if (cursorCreatedAt && cursorBuildId) {
    query = query.or(
      `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorBuildId})`
    )
  }

  // Filter by build ID or template
  if (buildIdOrTemplate) {
    const term = buildIdOrTemplate.trim()
    query = query.or(`id.eq.${term},env_id.eq.${term}`)
  }

  const { data, error } = await query

  if (error) {
    l.error({ key: 'api_builds:db_error', error: error.message }, 'failed to fetch builds')
    return NextResponse.json({ code: 500, message: error.message }, { status: 500 })
  }

  const rows = data ?? []
  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows

  const builds = pageRows.map((row) => {
    const aliases = Array.isArray(row.env_aliases) ? row.env_aliases : []
    const firstAlias = aliases[0]?.alias ?? null
    const statusMessage = extractStatusMessage(row.reason)

    return {
      id: row.id,
      template: firstAlias ?? row.env_id,
      templateId: row.env_id,
      status: row.status as 'building' | 'failed' | 'success',
      statusMessage,
      createdAt: row.created_at,
      finishedAt: row.finished_at ?? null,
    }
  })

  const last = pageRows.at(-1)
  const nextCursor =
    hasNextPage && last
      ? `${last.created_at}|${last.id}`
      : null

  return NextResponse.json({ data: builds, nextCursor })
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
