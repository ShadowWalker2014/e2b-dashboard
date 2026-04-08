/**
 * Dedicated proxy for GET /templates/defaults.
 *
 * The generic catch-all proxy loses the X-Supabase-Token header when
 * Next.js internally routes server-to-server fetches. This dedicated route
 * explicitly extracts and forwards the token directly to the infra API.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { SUPABASE_TOKEN_HEADER, SUPABASE_TEAM_HEADER } from '@/configs/api'
import { CACHE_TAGS } from '@/configs/cache'

const INFRA_BASE =
  process.env.NEXT_PUBLIC_INFRA_API_URL ||
  `https://api.${process.env.NEXT_PUBLIC_E2B_DOMAIN}`

export async function GET(request: NextRequest) {
  const token = request.headers.get(SUPABASE_TOKEN_HEADER)
  const team = request.headers.get(SUPABASE_TEAM_HEADER)

  const headers: Record<string, string> = {}

  if (token) headers[SUPABASE_TOKEN_HEADER] = token
  if (team) headers[SUPABASE_TEAM_HEADER] = team

  const res = await fetch(`${INFRA_BASE}/templates/defaults`, {
    headers,
    next: { tags: [CACHE_TAGS.DEFAULT_TEMPLATES] },
  })

  const body = await res.text()
  const ct = res.headers.get('content-type') ?? 'application/json'
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': ct },
  })
}
