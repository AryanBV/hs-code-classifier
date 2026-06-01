import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Session-refresh middleware.
 *
 * NOTE (Next 16): the `middleware` convention is deprecated and renamed to
 * `proxy`. This file is kept as `middleware.ts` per the agreed build spec; it
 * still runs in Next 16. A later step can run `npx @next/codemod middleware-to-proxy`.
 *
 * Degrades gracefully: a pure pass-through (`NextResponse.next()`) when the
 * Supabase env vars are absent (the current state). It only refreshes the
 * Supabase session when configured, and never throws when unconfigured.
 */

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No Supabase configured -> do nothing, just pass the request through.
  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Touch the session so Supabase rotates tokens via the cookie callbacks.
    await supabase.auth.getUser();
  } catch {
    // Never let an auth hiccup break a page render. Fall back to pass-through.
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  // Run on everything except Next internals, static assets, images, and favicon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
