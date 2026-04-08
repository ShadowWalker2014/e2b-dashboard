# Dashboard fork

## Git remotes
- **upstream**: `e2b-dev/dashboard` (upstream).
- **origin**: `ShadowWalker2014/e2b-dashboard` (fork).

## Auth
- **OAuth / signup `redirectTo`**: `getRequestOrigin()` (`src/lib/utils/request-origin.ts`) — `Origin` is often absent in Server Actions; fall back to `x-forwarded-*`, `VERCEL_URL`, or `NEXT_PUBLIC_SITE_URL`.
- **Password reset**: `resetPasswordForEmail` passes `redirectTo` so `/api/auth/confirm` gets a valid `next`. Confirm route normalizes relative `next` and defaults recovery when `next` is empty.

## Supabase
- Allow-list `{origin}/api/auth/callback` and password-reset redirect URLs.
