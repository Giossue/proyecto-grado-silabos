import { queryOptions } from "@tanstack/react-query"
import { getEmailPreferences } from "@/api/emailPreferences"
import { getDeviceSessions } from "@/api/session"

export const accountKeys = {
  all: ["account"] as const,
  emailPreferences: () => ["account", "email-preferences"] as const,
  deviceSessions: () => ["account", "device-sessions"] as const,
}

export const emailPreferencesQuery = () => queryOptions({ queryKey: accountKeys.emailPreferences(), queryFn: getEmailPreferences })

export const deviceSessionsQuery = () => queryOptions({ queryKey: accountKeys.deviceSessions(), queryFn: getDeviceSessions })
