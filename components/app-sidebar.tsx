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
import { LayoutDashboard, Users, Settings } from 'lucide-react'

const navItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/clients', icon: Users },
]

export function AppSidebar({ user }: { user: User }) {
  // Extract display name from user metadata or email
  const displayName = user.user_metadata?.full_name
    ?? user.email?.split('@')[0]
    ?? 'User'

  return (
    <Sidebar collapsible="none" className="border-r border-[rgba(255,255,255,0.07)] bg-[rgba(0,0,0,0.3)]">
      <SidebarHeader className="px-4 py-7">
        <span className="font-display text-2xl font-semibold tracking-wide text-gold">
          Roth Formula
        </span>
      </SidebarHeader>

      <SidebarContent className="px-4 pt-6">
        <SidebarMenu className="gap-0.5">
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={<a href={item.href} />}
                className="h-11 gap-2.5 rounded-[10px] px-3.5 text-sm font-normal text-[rgba(255,255,255,0.5)] transition-all hover:bg-[rgba(212,175,55,0.08)] hover:text-gold data-active:bg-[rgba(212,175,55,0.08)] data-active:text-gold data-active:border data-active:border-[rgba(212,175,55,0.2)] data-active:font-medium"
              >
                <item.icon className="size-4 opacity-70" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-4 pb-6 mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href="/settings" />}
              className="h-11 gap-2.5 rounded-[10px] px-3.5 text-sm font-normal text-[rgba(255,255,255,0.5)] transition-all hover:bg-[rgba(212,175,55,0.08)] hover:text-gold data-active:bg-[rgba(212,175,55,0.08)] data-active:text-gold data-active:border data-active:border-[rgba(212,175,55,0.2)] data-active:font-medium"
            >
              <Settings className="size-4 opacity-70" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-3 bg-[rgba(255,255,255,0.07)]" />

        <div className="px-3.5 space-y-1">
          <p className="text-[13px] text-[rgba(255,255,255,0.5)] truncate">
            {displayName}
          </p>
          <p className="text-[11px] text-[rgba(255,255,255,0.25)] truncate">
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
