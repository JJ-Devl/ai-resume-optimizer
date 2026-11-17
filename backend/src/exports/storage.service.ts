import { Injectable, HttpException } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
export const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;
export type DocumentFormat = keyof typeof MIME;
@Injectable()
export class StorageService {
  private configuration() {
    try {
      const file = resolve(__dirname, "../../../.env.storage");
      const local =
        !process.env.S3_BUCKET && existsSync(file)
          ? parseEnv(readFileSync(file, "utf8"))
          : {};
      const bucket = process.env.S3_BUCKET || local.GARAGE_DEFAULT_BUCKET;
      const accessKeyId =
        process.env.S3_ACCESS_KEY_ID || local.GARAGE_DEFAULT_ACCESS_KEY;
      const secretAccessKey =
        process.env.S3_SECRET_ACCESS_KEY || local.GARAGE_DEFAULT_SECRET_KEY;
      const endpoint =
        process.env.S3_ENDPOINT ||
        (local.GARAGE_DEFAULT_BUCKET ? "http://127.0.0.1:3900" : undefined);
      const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || endpoint;
      if (!bucket || Boolean(accessKeyId) !== Boolean(secretAccessKey))
        throw new Error("Invalid storage configuration");
      for (const value of [endpoint, publicEndpoint])
        if (value) {
          const url = new URL(value);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
          )
            throw new Error("Invalid endpoint");
        }
      return {
        bucket,
        endpoint,
        publicEndpoint,
        region:
          process.env.S3_REGION ||
          process.env.AWS_REGION ||
          (local.GARAGE_DEFAULT_BUCKET ? "garage" : "us-east-1"),
        credentials:
          accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined,
      };
    } catch {
      throw new HttpException(
        {
          code: "STORAGE_NOT_CONFIGURED",
          message:
            "Document storage is not configured. Run storage:setup locally or configure the backend S3 settings.",
        },
        503,
      );
    }
  }
  assertConfigured() {
    this.configuration();
  }
  private client(publicUrl = false) {
    const config = this.configuration();
    return {
      bucket: config.bucket,
      client: new S3Client({
        endpoint: publicUrl ? config.publicEndpoint : config.endpoint,
        region: config.region,
        credentials: config.credentials,
        forcePathStyle: Boolean(config.endpoint),
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
      }),
    };
  }
  async upload(key: string, body: Buffer, format: DocumentFormat) {
    const { client, bucket } = this.client();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: MIME[format],
          CacheControl: "private, no-store",
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
    } finally {
      client.destroy();
    }
  }
  async remove(key: string) {
    const { client, bucket } = this.client();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(15000),
      });
    } finally {
      client.destroy();
    }
  }
  async download(key: string, format: DocumentFormat) {
    const { client, bucket } = this.client();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(15000),
      });
    } finally {
      client.destroy();
    }
    const signed = this.client(true);
    try {
      const expiresIn = 300;
      const url = await getSignedUrl(
        signed.client,
        new GetObjectCommand({
          Bucket: signed.bucket,
          Key: key,
          ResponseContentType: MIME[format],
          ResponseContentDisposition:
            'attachment; filename="resume.' + format + '"',
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn },
      );
      return {
        url,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      };
    } finally {
      signed.client.destroy();
    }
  }
}
