import { Readable } from "node:stream"
import { text } from "node:stream/consumers"
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3"
import { describe, expect, it } from "vitest"
import { plainEtag, s3Bucket, type S3Sender } from "./objectBucket"

function notFound(name: string) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } })
}

function sender(handle: (command: unknown) => unknown): S3Sender & { commands: unknown[] } {
  const commands: unknown[] = []
  return {
    commands,
    send: (async (command: unknown) => {
      commands.push(command)
      return handle(command)
    }) as S3Sender["send"],
  }
}

describe("S3 bucket adapter", () => {
  it("answers null for missing objects and rethrows other failures", async () => {
    const bucket = s3Bucket(
      sender((command) => {
        if (command instanceof HeadObjectCommand) throw notFound("NotFound")
        if (command instanceof GetObjectCommand) throw notFound("NoSuchKey")
        throw new Error("boom")
      }),
      "silabos",
    )
    expect(await bucket.head("private/a")).toBeNull()
    expect(await bucket.get("private/a")).toBeNull()
    expect(await bucket.stream("private/a")).toBeNull()
    await expect(bucket.list("private/")).rejects.toThrow("boom")
  })

  it("streams bodies with the requested byte range and reads heads", async () => {
    const client = sender((command) => {
      if (command instanceof GetObjectCommand) return { Body: Readable.from([Buffer.from("PDF")]) }
      if (command instanceof HeadObjectCommand) return { ContentLength: 3, LastModified: new Date(5000), ETag: '"abc"' }
      return {}
    })
    const bucket = s3Bucket(client, "silabos")
    expect(await text((await bucket.stream("private/a", { start: 1, end: 3 })) as Readable)).toBe("PDF")
    expect((client.commands[0] as GetObjectCommand).input).toEqual({ Bucket: "silabos", Key: "private/a", Range: "bytes=1-3" })
    expect(await bucket.head("private/a")).toEqual({ size: 3, modifiedAt: new Date(5000), etag: "abc" })
    await bucket.put("private/b", Buffer.from("xy"))
    expect((client.commands[2] as PutObjectCommand).input).toMatchObject({ Bucket: "silabos", Key: "private/b", ContentLength: 2 })
  })

  it("pages through listings and deletes in batches of 1000", async () => {
    const pages = [
      { Contents: [{ Key: "a" }, { Key: "b" }], IsTruncated: true, NextContinuationToken: "t" },
      { Contents: [{ Key: "c" }], IsTruncated: false },
    ]
    const client = sender((command) => (command instanceof ListObjectsV2Command ? pages.shift() : {}))
    const bucket = s3Bucket(client, "silabos")
    expect(await bucket.list("")).toEqual(["a", "b", "c"])
    expect((client.commands[1] as ListObjectsV2Command).input.ContinuationToken).toBe("t")
    await bucket.delete(Array.from({ length: 1001 }, (_, index) => `k${index}`))
    const deletes = client.commands.filter((command) => command instanceof DeleteObjectsCommand) as DeleteObjectsCommand[]
    expect(deletes.map((command) => command.input.Delete?.Objects?.length)).toEqual([1000, 1])
  })

  it("normalizes quoted and weak etags", () => {
    expect(plainEtag('"abc"')).toBe("abc")
    expect(plainEtag('W/"abc-2"')).toBe("abc-2")
    expect(plainEtag(undefined)).toBeNull()
  })
})
