'use client'

import { logout } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost">
        Sign Out
      </Button>
    </form>
  )
}
