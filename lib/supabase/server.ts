import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  // DEV HACK: Use Service Role Key if available to bypass RLS and Auth requirements
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    apiKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  );

  // DEV HACK: Monkey-patch auth.getUser to always return our demo user
  // This tricks the app into thinking we are logged in.
  const originalGetUser = supabase.auth.getUser;
  supabase.auth.getUser = async () => {
    // Return the hardcoded demo user
    return {
      data: {
        user: {
          id: 'f91a3b0a-2d96-4be7-8e77-a493d2111113', // The ID we created earlier
          aud: 'authenticated',
          role: 'authenticated',
          email: 'demo@rothc.app',
          email_confirmed_at: new Date().toISOString(),
          phone: '',
          confirmed_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          app_metadata: {
            provider: 'email',
            providers: ['email'],
          },
          user_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_anonymous: false
        }
      },
      error: null
    } as any;
  };

  return supabase;
}
