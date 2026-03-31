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
import { LayoutDashboard, Users, Settings, FileText, Video, Mic, Bell } from 'lucide-react'

const navItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Clients', href: '/clients', icon: Users },
  { title: 'Sales Calls', href: '/sales-calls', icon: Mic },
  { title: 'Report History', href: '/reports', icon: FileText },
  { title: 'Training', href: '/training', icon: Video },
  { title: 'Updates', href: '/updates', icon: Bell },
]

export function AppSidebar({ user, displayName, userRole }: { user: User; displayName: string; userRole: string | null }) {

  return (
    <Sidebar collapsible="none" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="px-4 py-7">
        <img src="/logo.png" alt="Retirement Expert" className="h-8 w-auto dark:brightness-100 brightness-0" />
      </SidebarHeader>

      <SidebarContent className="px-4 pt-6">
        <SidebarMenu className="gap-0.5">
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={<a href={item.href} />}
                className="h-11 gap-2.5 rounded-[10px] px-3.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground data-active:bg-accent data-active:text-accent-foreground data-active:border data-active:border-gold-border data-active:font-medium"
              >
                <item.icon className="size-4 opacity-80" />
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
