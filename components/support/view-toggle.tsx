'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ViewToggle({ current }: { current: 'list' | 'kanban' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function go(view: 'list' | 'kanban') {
    const p = new URLSearchParams(searchParams.toString())
    if (view === 'list') p.delete('view')
    else p.set('view', view)
    router.push(`${pathname}?${p.toString()}`, { scroll: false })
  }

  return (
    <div className="inline-flex items-center rounded-md border border-border-default bg-bg-card p-0.5">
      <button
        type="button"
        onClick={() => go('list')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs transition-colors',
          current === 'list' ? 'bg-accent text-foreground' : 'text-text-dim hover:text-foreground'
        )}
      >
        <List className="size-3.5" />
        List
      </button>
      <button
        type="button"
        onClick={() => go('kanban')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs transition-colors',
          current === 'kanban' ? 'bg-accent text-foreground' : 'text-text-dim hover:text-foreground'
        )}
      >
        <LayoutGrid className="size-3.5" />
        Kanban
      </button>
    </div>
  )
}
