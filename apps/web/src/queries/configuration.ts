import { getSystemSettings } from "@/api/systemSettings"

export const configurationKeys = {
  all: ["configuration"] as const,
  systemSettings: () => ["configuration", "system-settings"] as const,
}

export const systemSettingsQuery = () => ({ queryKey: configurationKeys.systemSettings(), queryFn: getSystemSettings })
