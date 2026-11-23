import { withoutEndPeriod } from "@/lib/text"

type HeadingProps = {
  title: string
  description?: string
  variant?: "default" | "small"
}

export function Heading({ title, description, variant = "default" }: HeadingProps) {
  return (
    <header className={variant === "small" ? "" : "mb-8 flex flex-col gap-0.5"}>
      <h2 className={variant === "small" ? "mb-0.5 text-base font-medium" : "text-xl font-semibold tracking-tight"}>
        {title}
      </h2>
      {description ? <p className="text-sm text-muted-foreground">{withoutEndPeriod(description)}</p> : null}
    </header>
  )
}
