import { describe, expect, it } from "vitest"
import type { PrismaService } from "./prisma.service"
import { inTransaction, inTransactionAfterCommit, TRANSACTION_OPTIONS } from "./db"

function fakePrisma() {
  const log: string[] = []
  const options: unknown[] = []
  const prisma = {
    async $transaction<T>(work: (tx: unknown) => Promise<T>, given: unknown): Promise<T> {
      options.push(given)
      log.push("begin")
      try {
        const result = await work({ tx: true })
        log.push("commit")
        return result
      } catch (error) {
        log.push("rollback")
        throw error
      }
    },
  }
  return { log, options, prisma: prisma as unknown as PrismaService }
}

describe("transactions", () => {
  it("share one set of options", () => {
    expect(TRANSACTION_OPTIONS).toEqual({ maxWait: 60_000, timeout: 600_000 })
  })

  it("run the work in a transaction with those options", async () => {
    const { log, options, prisma } = fakePrisma()
    expect(await inTransaction(prisma, async (tx) => tx)).toEqual({ tx: true })
    expect(log).toEqual(["begin", "commit"])
    expect(options).toEqual([TRANSACTION_OPTIONS])
  })

  it("run the after-commit callbacks in order once the transaction commits", async () => {
    const { log, options, prisma } = fakePrisma()
    const result = await inTransactionAfterCommit(prisma, async (tx, afterCommit) => {
      afterCommit(() => log.push("first"))
      afterCommit(async () => void log.push("second"))
      log.push("work")
      return tx
    })
    expect(result).toEqual({ tx: true })
    expect(log).toEqual(["begin", "work", "commit", "first", "second"])
    expect(options).toEqual([TRANSACTION_OPTIONS])
  })

  it("drop the after-commit callbacks when the transaction rolls back", async () => {
    const { log, prisma } = fakePrisma()
    await expect(
      inTransactionAfterCommit(prisma, async (_tx, afterCommit) => {
        afterCommit(() => log.push("callback"))
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(log).toEqual(["begin", "rollback"])
  })
})
