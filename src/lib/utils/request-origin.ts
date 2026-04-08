import { headers } from 'next/headers'

function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, '')
}

/**
 * Public origin (scheme + host) for Supabase redirect URLs.
 * Server Actions often have no Origin header; proxies set forwarded headers instead.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers()

  const originHeader = h.get('origin')
  if (originHeader) {
    return stripTrailingSlash(originHeader)
  }

  const forwardedHost =
    h.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    h.get('host')?.trim()
  const forwardedProtoRaw = h.get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()

  if (forwardedHost) {
    const proto =
      forwardedProtoRaw ||
      (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    return stripTrailingSlash(`${proto}://${forwardedHost}`)
  }

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    const base = vercelUrl.startsWith('http')
      ? vercelUrl
      : `https://${vercelUrl}`
    return stripTrailingSlash(base)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    return stripTrailingSlash(siteUrl)
  }

  throw new Error(
    'Could not determine app origin for auth redirects. Set NEXT_PUBLIC_SITE_URL or ensure your host sets Origin or x-forwarded-host.'
  )
}
