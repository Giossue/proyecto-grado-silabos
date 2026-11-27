"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useCurrentUrl } from "@/composables/useCurrentUrl"
import { toUrl } from "@/lib/utils"
import type { NavItem } from "@/types"

export function NavMain({ items }: { items: NavItem[] }) {
  const { isCurrentUrl, isCurrentOrParentUrl } = useCurrentUrl()
  const router = useRouter()
  const { state, isMobile } = useSidebar()
  const showsFlyout = state === "collapsed" && !isMobile
  const isItemActive = (item: NavItem): boolean =>
    item.isActive === true ||
    [item.href, ...(item.activeUrls ?? [])].some((url) => isCurrentOrParentUrl(url)) ||
    (item.items?.some((child) => isCurrentOrParentUrl(child.href)) ?? false)

  return (
    <SidebarGroup className="px-2 py-0">
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            {!item.items?.length ? (
              <>
                <SidebarMenuButton asChild isActive={isItemActive(item)} tooltip={item.title}>
                  <Link href={toUrl(item.href)} aria-current={isCurrentUrl(item.href) ? "page" : undefined}>
                    {item.icon ? <item.icon /> : null}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge ? <SidebarMenuBadge>{item.badge > 99 ? "99+" : item.badge}</SidebarMenuBadge> : null}
              </>
            ) : showsFlyout ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton isActive={isItemActive(item)} tooltip={item.title}>
                    {item.icon ? <item.icon /> : null}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-56">
                  <DropdownMenuGroup>
                    {item.items.map((child) => (
                      <DropdownMenuItem key={child.title} onSelect={() => router.push(toUrl(child.href))}>
                        {child.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Collapsible className="group/collapsible" defaultOpen={isItemActive(item)}>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton isActive={isItemActive(item)}>
                    {item.icon ? <item.icon /> : null}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden="true" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((child) => (
                      <SidebarMenuSubItem key={child.title}>
                        <SidebarMenuSubButton asChild isActive={isCurrentOrParentUrl(child.href)}>
                          <Link href={toUrl(child.href)} aria-current={isCurrentUrl(child.href) ? "page" : undefined}><span>{child.title}</span></Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            )}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
