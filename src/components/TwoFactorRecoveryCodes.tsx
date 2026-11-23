"use client"

import { Eye, EyeOff, LockKeyhole } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { PasswordInput } from "@/components/PasswordInput"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

type TwoFactorRecoveryCodesProps = { codes: string[]; processing: boolean; onRegenerate: (password: string) => void }

export function TwoFactorRecoveryCodes({ codes, processing, onRegenerate }: TwoFactorRecoveryCodesProps) {
  const [visible, setVisible] = useState(false)
  const [password, setPassword] = useState("")
  const section = useRef<HTMLDivElement>(null)
  const ToggleIcon = visible ? EyeOff : Eye

  useEffect(() => {
    if (visible) section.current?.scrollIntoView({ behavior: "smooth" })
  }, [visible])

  const regenerate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!password) return
    onRegenerate(password)
    setPassword("")
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex gap-3">
          <LockKeyhole className="size-4" aria-hidden="true" />
          Códigos de recuperación 2FA
        </CardTitle>
        <CardDescription>Permiten recuperar el acceso si pierde el dispositivo 2FA. Guárdelos en un gestor de contraseñas seguro</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button className="w-fit" onClick={() => setVisible((value) => !value)}>
          <ToggleIcon className="size-4" aria-hidden="true" />
          {visible ? "Ocultar" : "Ver"} códigos
        </Button>
        {visible ? (
          <div ref={section} className="flex flex-col gap-4">
            <div className="grid gap-1 rounded-md bg-muted p-4 font-mono text-sm">
              {codes.length === 0 ? <div className="text-muted-foreground">Genere códigos nuevos para mostrarlos aquí</div> : codes.map((code) => <div key={code}>{code}</div>)}
            </div>
            <form className="grid gap-3" onSubmit={regenerate}>
              <Label htmlFor="recovery-current-password" required>
                Contraseña actual
              </Label>
              <PasswordInput id="recovery-current-password" value={password} onValueChange={setPassword} autoComplete="current-password" aria-required="true" />
              <Button className="w-fit" type="submit" variant="secondary" disabled={processing || !password}>
                Regenerar códigos
              </Button>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
