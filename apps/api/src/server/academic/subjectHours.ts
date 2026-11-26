import { Prisma } from "../../generated/prisma/client"

export type SubjectHours = Prisma.Decimal | string | number | null

export function subjectTotalHours(...hours: SubjectHours[]): number {
  return hours
    .reduce<Prisma.Decimal>((total, value) => (value === null || value === "" ? total : total.plus(new Prisma.Decimal(value))), new Prisma.Decimal(0))
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber()
}
