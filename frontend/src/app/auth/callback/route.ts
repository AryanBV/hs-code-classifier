import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase magic-link / OAuth callback.
 *
 * Reads `code` from the request URL, exchanges it for a session when Supabase
 * is configured, then redirects to the `next` param (or `/`). When Supabase is
 * unconfigured (the current state), it simply redirects to `/` and never throws.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  // Only allow same-origin relative redirects.
  const redirectTo =
    nextParam && nextParam.startsWith("/") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      try {
        await supabase.auth.exchangeCodeForSession(code);
      } catch {
        // Bad/expired code: fall through to a calm redirect home.
        return NextResponse.redirect(`${origin}/`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
