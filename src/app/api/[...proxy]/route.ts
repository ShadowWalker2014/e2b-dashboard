/**
 * Catch-all proxy for dashboard API calls that forward to the infra API.
 *
 * The dashboard-api Go service (dashboard-api.{domain}) is not running,
 * so the Next.js api client defaults to hitting this app's /api/* routes.
 * Specific routes (/api/teams, /api/teams/resolve) are handled directly via DB.
 * Everything else is proxied to the infra API (api.{domain}).
 */

import { type NextRequest, NextResponse } from 'next/server'

const INFRA_BASE =
  process.env.NEXT_PUBLIC_INFRA_API_URL ||
  `https://api.${process.env.NEXT_PUBLIC_E2B_DOMAIN}`

// Headers that should NOT be forwarded to the upstream service
const BLOCKED_HEADERS = new Set([
  'host',
  'connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'keep-alive',
  // Never forward cookies to a third-party API — auth is via X-Supabase-Token
  'cookie',
  'set-cookie',
  // Never forward proxy auth headers upstream
  'proxy-authorization',
  'proxy-authenticate',
])

async function proxy(request: NextRequest, path: string): Promise<NextResponse> {
  const url = new URL(path, INFRA_BASE)
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  // Forward ALL incoming headers except blocked ones
  const headers = new Headers()
  request.headers.forEach((val, key) => {
    if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
      headers.set(key, val)
    }
  })

  const init: RequestInit = {
    method: request.method,
    headers,
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    const body = await request.text()
    if (body) init.body = body
  }

  const res = await fetch(url.toString(), init)
  const responseHeaders = new Headers()
  const ct = res.headers.get('content-type')
  if (ct) responseHeaders.set('content-type', ct)

  const responseBody = await res.text()
  return new NextResponse(responseBody, {
    status: res.status,
    headers: responseHeaders,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy: segments } = await params
  return proxy(request, `/${segments.join('/')}`)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy: segments } = await params
  return proxy(request, `/${segments.join('/')}`)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy: segments } = await params
  return proxy(request, `/${segments.join('/')}`)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy: segments } = await params
  return proxy(request, `/${segments.join('/')}`)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ proxy: string[] }> }
) {
  const { proxy: segments } = await params
  return proxy(request, `/${segments.join('/')}`)
}
