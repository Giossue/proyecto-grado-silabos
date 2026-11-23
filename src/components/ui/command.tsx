"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { cn } from "cn"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type CommandSearch = { search: string; setSearch: (search: string) => void }

const CommandSearchContext = React.createContext<CommandSearch | null>(null)

function Command({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  const [search, setSearch] = React.useState("")
  const value = React.useMemo(() => ({ search, setSearch }), [search])

  return (
    <CommandSearchContext.Provider value={value}>
      <CommandPrimitive
        data-slot="command"
        className={cn(
          "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
          className
        )}
        {...props}
      >
        {children}
      </CommandPrimitive>
    </CommandSearchContext.Provider>
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
}) {
  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle close={false}>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command>{children}</Command>
        <div className="border-t p-2 text-right">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange?.(false)}
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  value,
  onValueChange,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  const context = React.useContext(CommandSearchContext)

  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        autoFocus
        value={value ?? context?.search}
        onValueChange={(search) => {
          context?.setSearch(search)
          onValueChange?.(search)
        }}
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    >
      <div role="presentation">{children}</div>
    </CommandPrimitive.List>
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground overflow-hidden p-1 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  onSelect,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  const context = React.useContext(CommandSearchContext)

  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      onSelect={(value) => {
        context?.setSearch("")
        onSelect?.(value)
      }}
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
