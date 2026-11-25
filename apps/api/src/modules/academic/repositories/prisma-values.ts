import type { Prisma } from "../../../generated/prisma/client"

export function plainDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function decimalText(value: Prisma.Decimal | null, scale = 2): string | null {
  return value === null ? null : value.toFixed(scale)
}

export function epochDate(seconds: number): Date {
  return new Date(seconds * 1000)
}
