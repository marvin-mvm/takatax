/** Reads uploaded files from the private Cloudflare R2 bucket (S3 API, signed requests). */

import { AwsClient } from "aws4fetch";

import { env } from "./env";

export async function getObject(key: string): Promise<Uint8Array> {
  const client = new AwsClient({
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
  const url = `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${env("R2_BUCKET")}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const response = await client.fetch(url);
  if (!response.ok) throw new Error(`R2 ${response.status} for ${key}`);
  return new Uint8Array(await response.arrayBuffer());
}
