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

const FORWARDED_HEADERS = [
  'x-supabase-token',
  'x-supabase-team',
  'content-type',
  'accept',
]

async function proxy(request: NextRequest, path: string): Promise<NextResponse> {
  const url = new URL(path, INFRA_BASE)
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  const headers = new Headers()
  for (const key of FORWARDED_HEADERS) {
    const val = request.headers.get(key)
    if (val) headers.set(key, val)
  }

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

  const body = await res.text()
  return new NextResponse(body, {
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
