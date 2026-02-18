import { updatePassword } from '@/lib/actions/auth'
import { SubmitButton } from '@/components/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

type FormAction = (formData: FormData) => void

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <p className="text-sm text-green-600">{message}</p>
          )}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <form action={updatePassword as FormAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={6} />
            </div>
            <SubmitButton className="w-full" pendingText="Updating...">
              Update Password
            </SubmitButton>
          </form>

          <p className="text-center text-sm">
            <Link href="/login" className="underline">Back to Sign In</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
