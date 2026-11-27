import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { range } from "./range"

export type SettingsSection = "profile" | "system" | "email"

type SettingsLoadingSkeletonProps = {
  section?: SettingsSection
  rows?: number
}

export function SettingsLoadingSkeleton({ section = "profile", rows = 4 }: SettingsLoadingSkeletonProps) {
  if (section === "system") {
    return (
      <div className="-mt-2 flex min-w-0 flex-col" data-settings-section="system">
        {range(4).map((item) => (
          <div key={item} data-skeleton="settings-accordion-item" className="border-b last:border-b-0">
            <div className="flex items-start justify-between gap-4 py-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Skeleton className="size-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex h-5 items-center">
                    <Skeleton className={cn("h-4 max-w-full", item === 3 ? "w-36" : "w-28")} />
                  </div>
                  <div className="flex h-5 items-center">
                    <Skeleton className={cn("h-4 max-w-full", item === 1 ? "w-80" : "w-96")} />
                  </div>
                </div>
              </div>
              <Skeleton className="size-4 shrink-0 translate-y-0.5" />
            </div>
            {item === 1 ? (
              <div data-skeleton="settings-accordion-content" className="flex min-w-0 flex-col gap-6 px-1 pt-2 pb-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-9 rounded-full" />
                  <Skeleton className="h-4 w-40 max-w-full" />
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-9 w-32" />
                </div>
                <Skeleton className="h-9 w-25" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  if (section === "email") {
    return (
      <div className="flex min-w-0 flex-col gap-6" data-settings-section="email">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Skeleton className="h-6 w-36 max-w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-1/3" />
        </div>
        {range(rows).map((row) => (
          <div key={row} data-skeleton="settings-email-option" className="flex min-w-0 items-start gap-3">
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
        <Skeleton className="h-9 w-25" data-skeleton="settings-save" />
      </div>
    )
  }

  return (
    <div className="-mt-2 flex min-w-0 flex-col" data-settings-section={section}>
      <div className="flex min-w-0 items-center gap-3 py-4" data-skeleton="settings-profile-header">
        <Skeleton className="size-4 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex h-5 items-center">
            <Skeleton className="h-4 w-32 max-w-full" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-4 w-52 max-w-full" />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6 px-1 pt-2 pb-2">
        {range(2).map((field) => (
          <div key={field} className="flex min-w-0 flex-col gap-2" data-skeleton="settings-field">
            <Skeleton className="h-3.5 w-36 max-w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}

        <div className="flex min-w-0 flex-col gap-1" data-skeleton="settings-identity-help">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3 sm:hidden" />
        </div>
      </div>
    </div>
  )
}
