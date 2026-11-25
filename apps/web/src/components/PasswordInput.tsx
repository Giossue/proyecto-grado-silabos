"use client"

import { Eye, EyeOff } from "lucide-react"
import { useState, type ComponentProps } from "react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
}

export function PasswordInput({ className, value, onValueChange, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)
  const label = showPassword ? "Ocultar contraseña" : "Mostrar contraseña"

  return (
    <div className="relative">
      <Input
        {...props}
        value={value}
        type={showPassword ? "text" : "password"}
        className={cn("pr-10", className)}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <IconTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute inset-y-px right-px h-auto rounded-l-none rounded-r-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground"
          aria-label={label}
          onClick={() => setShowPassword((current) => !current)}
        >
          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </IconTooltip>
    </div>
  )
}
