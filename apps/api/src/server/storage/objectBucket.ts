import { Readable } from "node:stream"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { S3Settings } from "./storageConfig"

export type ObjectHead = { size: number; modifiedAt: Date; etag: string | null }

export type ByteRange = { start: number; end: number }

export interface ObjectBucket {
  name: string
  put(key: string, body: Buffer): Promise<void>
  get(key: string): Promise<Buffer | null>
  stream(key: string, range?: ByteRange): Promise<Readable | null>
  head(key: string): Promise<ObjectHead | null>
  list(prefix: string, limit?: number): Promise<string[]>
  delete(keys: string[]): Promise<void>
}

export type S3Sender = Pick<S3Client, "send">

const DELETE_BATCH = 1000

export function missingObject(error: unknown): boolean {
  const failure = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null
  return failure?.name === "NotFound" || failure?.name === "NoSuchKey" || failure?.Code === "NoSuchKey" || failure?.$metadata?.httpStatusCode === 404
}

export function plainEtag(etag: string | undefined): string | null {
  return etag === undefined || etag === "" ? null : etag.replace(/^W\//, "").replace(/"/g, "")
}

export function s3Client(settings: S3Settings): S3Client {
  return new S3Client({
    ...(settings.endpoint === undefined ? {} : { endpoint: settings.endpoint }),
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  })
}

function bodyStream(body: unknown): Readable {
  if (body instanceof Readable) return body
  const web = body as { transformToWebStream?: () => ReadableStream<Uint8Array> } | undefined
  if (web?.transformToWebStream !== undefined) return Readable.fromWeb(web.transformToWebStream() as NodeReadableStream<Uint8Array>)
  return Readable.from([])
}

export function s3Bucket(client: S3Sender, bucket: string): ObjectBucket {
  const fetch = async (key: string, range?: ByteRange) => {
    try {
      return await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(range === undefined ? {} : { Range: `bytes=${range.start}-${range.end}` }) }))
    } catch (error) {
      if (missingObject(error)) return null
      throw error
    }
  }
  return {
    name: bucket,
    async put(key, body) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: body.length }))
    },
    async get(key) {
      const output = await fetch(key)
      if (output === null) return null
      if (output.Body === undefined) return Buffer.alloc(0)
      return Buffer.from(await output.Body.transformToByteArray())
    },
    async stream(key, range) {
      const output = await fetch(key, range)
      return output === null ? null : bodyStream(output.Body)
    },
    async head(key) {
      try {
        const output = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return { size: output.ContentLength ?? 0, modifiedAt: output.LastModified ?? new Date(0), etag: plainEtag(output.ETag) }
      } catch (error) {
        if (missingObject(error)) return null
        throw error
      }
    },
    async list(prefix, limit) {
      const keys: string[] = []
      let token: string | undefined
      do {
        const output = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token, ...(limit === undefined ? {} : { MaxKeys: limit }) }),
        )
        for (const item of output.Contents ?? []) if (item.Key !== undefined) keys.push(item.Key)
        token = output.IsTruncated ? output.NextContinuationToken : undefined
      } while (token !== undefined && (limit === undefined || keys.length < limit))
      return limit === undefined ? keys : keys.slice(0, limit)
    },
    async delete(keys) {
      for (let start = 0; start < keys.length; start += DELETE_BATCH) {
        const batch = keys.slice(start, start + DELETE_BATCH)
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }))
      }
    },
  }
}
