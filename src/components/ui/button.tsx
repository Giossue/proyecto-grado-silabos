"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"


const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-hidden focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 aria-invalid:ring-destructive/30 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-button-primary text-button-primary-foreground hover:bg-button-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30",
        success:
          "bg-success text-success-foreground hover:bg-success/90 focus-visible:ring-success/30",
        outline:
          "border border-border bg-field shadow-control hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-readable underline-offset-4 hover:underline",
        document: "bg-transparent text-inherit hover:bg-accent/50",
        dropzone:
          "border-2 border-dashed border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40 data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/5 aria-invalid:border-destructive/60 aria-invalid:bg-destructive/5",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        row: "h-auto w-full items-start justify-start whitespace-normal px-2 py-2.5 text-left font-normal",
        inline:
          "h-auto max-w-full min-w-0 px-0 py-0 font-[inherit] text-[inherit]",
        dropzone: "h-auto min-h-32 w-full whitespace-normal p-4 font-normal",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonVariants = VariantProps<typeof buttonVariants>

function Button({
  className,
  variant,
  size,
  asChild = false,
  disabled,
  ref,
  ...props
}: React.ComponentProps<"button"> &
  ButtonVariants & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant ?? undefined}
      data-size={size ?? undefined}
      disabled={disabled || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants, type ButtonVariants }
