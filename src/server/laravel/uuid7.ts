import { randomBytes } from "node:crypto"

const RANDOM_BITS = BigInt(74)
const RANDOM_MASK = (BigInt(1) << RANDOM_BITS) - BigInt(1)

function randomTail(): bigint {
  return BigInt(`0x${randomBytes(10).toString("hex")}`) & (RANDOM_MASK >> BigInt(1))
}

function format(milliseconds: number, tail: bigint): string {
  const hex = (value: bigint, length: number) => value.toString(16).padStart(length, "0")
  const time = hex(BigInt(milliseconds), 12)
  const randA = (tail >> BigInt(62)) & BigInt(0xfff)
  const randB = tail & ((BigInt(1) << BigInt(62)) - BigInt(1))
  const variant = (BigInt(0b10) << BigInt(62)) | randB
  const low = hex(variant, 16)
  return `${time.slice(0, 8)}-${time.slice(8)}-7${hex(randA, 3)}-${low.slice(0, 4)}-${low.slice(4)}`
}

export function createUuid7Generator(clock: () => number = Date.now): () => string {
  let lastTime = -1
  let lastTail = BigInt(0)
  return () => {
    const now = clock()
    if (now > lastTime) {
      lastTime = now
      lastTail = randomTail()
    } else {
      lastTail += BigInt(1) + (BigInt(`0x${randomBytes(2).toString("hex")}`) & BigInt(0xff))
      if (lastTail > RANDOM_MASK) {
        lastTime += 1
        lastTail = randomTail()
      }
    }
    return format(lastTime, lastTail)
  }
}

export const uuid7 = createUuid7Generator()
