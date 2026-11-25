import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { cn, toUrl } from "@/lib/utils"
import type { NavItem } from "@/types"

export function NavFooter({ items, className }: { items: NavItem[]; className?: string }) {
  return (
    <SidebarGroup className={cn("group-data-[collapsible=icon]:p-0", className)}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton className="text-muted-foreground hover:text-foreground" asChild>
                <a href={toUrl(item.href)} target="_blank" rel="noopener noreferrer">
                  {item.icon ? <item.icon /> : null}
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
