// Signed links to Cloudflare R2 (S3-compatible), so browsers upload and the reader downloads
// directly, without R2 keys ever leaving the server.
//
// MISSING: create the R2 bucket and an API token with read and write access to it, then set
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET as edge function secrets.
// The bucket also needs a CORS rule allowing PUT from the site's domain.
import { AwsClient } from "npm:aws4fetch@1.0.20";

import { requireEnv } from "./http.ts";

const LINK_SECONDS = 600;

function r2() {
  const env = requireEnv("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET");
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;
  return { client, base };
}

/** Throws NotConfiguredError when any R2 secret is missing. Call before creating rows. */
export function assertStorageConfigured(): void {
  r2();
}

async function signedUrl(method: "PUT" | "GET", key: string): Promise<string> {
  const { client, base } = r2();
  const url = new URL(`${base}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(LINK_SECONDS));
  const signed = await client.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

export const signedUploadUrl = (key: string) => signedUrl("PUT", key);
export const signedDownloadUrl = (key: string) => signedUrl("GET", key);

/** True when the object is in the bucket (a signed HEAD request). */
export async function objectExists(key: string): Promise<boolean> {
  const { client, base } = r2();
  const response = await client.fetch(`${base}/${key}`, { method: "HEAD" });
  return response.ok;
}

/** Downloads an object (used by the Supabase reader, read-step). */
export async function getObject(key: string): Promise<Uint8Array> {
  const { client, base } = r2();
  const path = key.split("/").map(encodeURIComponent).join("/");
  const response = await client.fetch(`${base}/${path}`);
  if (!response.ok) throw new Error(`R2 ${response.status} for ${key}`);
  return new Uint8Array(await response.arrayBuffer());
}
