import { queryOptions } from "@tanstack/react-query"
import { getEmailPreferences } from "@/api/emailPreferences"

export const accountKeys = {
  all: ["account"] as const,
  emailPreferences: () => ["account", "email-preferences"] as const,
}

export const emailPreferencesQuery = () => queryOptions({ queryKey: accountKeys.emailPreferences(), queryFn: getEmailPreferences })
