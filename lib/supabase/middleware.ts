import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { withTimeout, SUPABASE_AUTH_TIMEOUT_MS } from "@/lib/utils/with-timeout";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables");
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              sameSite: "none",
              secure: true,
            })
          );
        },
      },
    }
  );

  // Refresh session if expired.
  //
  // Bounded: when Supabase is unreachable this call hangs indefinitely, which
  // used to take the middleware past Vercel's limit and 504 EVERY route —
  // including /login, so nobody could even see an explanation. On timeout we
  // fail OPEN: the session simply isn't refreshed and the request continues.
  // The destination page still does its own auth check, so an unauthenticated
  // visitor is redirected to /login as normal; a signed-in visitor keeps the
  // cookie they arrived with until Supabase answers again.
  const refreshed = await withTimeout(
    supabase.auth.getUser(),
    SUPABASE_AUTH_TIMEOUT_MS
  );
  if (!refreshed.ok) {
    console.error(
      `[middleware] Supabase auth.getUser did not respond within ${SUPABASE_AUTH_TIMEOUT_MS}ms; continuing without session refresh (${request.nextUrl.pathname})`
    );
  }

  // Allow framing from GoHighLevel
  supabaseResponse.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://*.hexonasystems.com https://*.gohighlevel.com https://*.highlevel.com"
  );
  supabaseResponse.headers.delete("X-Frame-Options");

  return supabaseResponse;
}
