import { User } from '@supabase/supabase-js'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { LogoutButton } from '@/components/logout-button'
import { LayoutDashboard, Users, Settings, FileText, Video, Mic, Bell, LifeBuoy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

const navItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/clients', icon: Users },
  { title: 'Sales Calls', href: '/sales-calls', icon: Mic },
  { title: 'Report History', href: '/reports', icon: FileText },
  { title: 'Training', href: '/training', icon: Video },
  { title: 'Support', href: '/support', icon: LifeBuoy },
  { title: 'Updates', href: '/updates', icon: Bell },
] as const

export async function AppSidebar({ user, displayName, userRole: _userRole }: { user: User; displayName: string; userRole: string | null }) {
  // Count unread support-related notifications so the Support nav row can
  // surface a "you have something new in here" indicator. The bell still
  // shows the per-notification list — this is the at-a-glance dot for an
  // advisor who hasn't opened the bell.
  const supabase = await createClient()
  const { count: supportUnread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
    .in('type', ['support_ticket_reply', 'support_ticket_status_change'])

  return (
    <Sidebar collapsible="none" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="px-4 py-7">
        <img src="/logo.png" alt="Retirement Expert" className="h-8 w-auto hidden dark:block" />
        <img src="/logo-light.png" alt="Retirement Expert" className="h-8 w-auto dark:hidden" />
      </SidebarHeader>

      <SidebarContent className="px-4 pt-6">
        <SidebarMenu className="gap-0.5">
          {navItems.map((item) => {
            const showSupportBadge = item.title === 'Support' && (supportUnread ?? 0) > 0
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  render={<a href={item.href} />}
                  className="h-11 gap-2.5 rounded-[10px] px-3.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground data-active:bg-accent data-active:text-accent-foreground data-active:border data-active:border-gold-border data-active:font-medium"
                >
                  <item.icon className="size-4 opacity-80" />
                  <span>{item.title}</span>
                  {showSupportBadge && (
                    <span
                      className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-bg-base"
                      aria-label={`${supportUnread} unread support update${(supportUnread ?? 0) === 1 ? '' : 's'}`}
                    >
                      {(supportUnread ?? 0) > 9 ? '9+' : supportUnread}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}

        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-4 pb-6 mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href="/settings" />}
              className="h-11 gap-2.5 rounded-[10px] px-3.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground data-active:bg-accent data-active:text-accent-foreground data-active:border data-active:border-gold-border data-active:font-medium"
            >
              <Settings className="size-4 opacity-80" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-3 bg-border" />

        <div className="px-3.5 space-y-1">
          <p className="text-sm text-text-muted truncate">
            {displayName}
          </p>
          <p className="text-xs text-text-dim truncate">
            {user.email}
          </p>
        </div>

        <div className="mt-3 px-1">
          <LogoutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
