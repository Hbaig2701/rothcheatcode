import { login, signInWithGoogle, signInWithMagicLink } from '@/lib/actions/auth'
import { SubmitButton } from '@/components/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

// Server actions return error objects but form action types expect void
// This is safe - Next.js handles the return value for useActionState patterns
type FormAction = (formData: FormData) => void

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const { message, error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <p className="text-sm text-green-600">{message}</p>
          )}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <form action={login as FormAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <SubmitButton className="w-full" pendingText="Signing in...">
              Sign In
            </SubmitButton>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <form action={signInWithGoogle as unknown as FormAction}>
            <SubmitButton variant="outline" className="w-full" pendingText="Connecting...">
              Continue with Google
            </SubmitButton>
          </form>

          <form action={signInWithMagicLink as FormAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magic-email">Magic Link</Label>
              <Input id="magic-email" name="email" type="email" placeholder="Enter email for magic link" />
            </div>
            <SubmitButton variant="secondary" className="w-full" pendingText="Sending...">
              Send Magic Link
            </SubmitButton>
          </form>

          <p className="text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
