import type { ReactNode } from "react"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"

export function AuthLayout({ title = "", description = "", children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <AuthSplitLayout title={title} description={description}>
      {children}
    </AuthSplitLayout>
  )
}
