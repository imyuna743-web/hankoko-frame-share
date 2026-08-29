import { env } from "cloudflare:workers";

type SiteEnv = {
  DB: D1Database;
  BUCKET: R2Bucket;
  OPENAI_API_KEY?: string;
  IP_HASH_SECRET?: string;
};

export type FrameRecord = {
  id: string;
  nickname: string;
  shapeTag: "원형" | "둥근 사각형" | "사각형";
  tags: string[];
  likesCount: number;
  reportsCount: number;
  createdAt: number;
  imageUrl: string;
  liked: boolean;
};

export function siteEnv() {
  return env as unknown as SiteEnv;
}

export function frameFromRow(row: Record<string, unknown>): FrameRecord {
  return {
    id: String(row.id),
    nickname: String(row.nickname),
    shapeTag: String(row.shape_tag) as FrameRecord["shapeTag"],
    tags: JSON.parse(String(row.tags || "[]")) as string[],
    likesCount: Number(row.likes_count || 0),
    reportsCount: Number(row.reports_count || 0),
    createdAt: Number(row.created_at),
    imageUrl: `/api/frames/${String(row.id)}/image`,
    liked: Number(row.liked || 0) === 1,
  };
}

export async function ipIdentity(request: Request) {
  const { IP_HASH_SECRET } = siteEnv();
  if (!IP_HASH_SECRET) throw new Error("IP_HASH_SECRET is not configured");
  const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(IP_HASH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(forwarded)));
  const visitorKey = [...digest.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const suffix = String(new DataView(digest.buffer).getUint32(0) % 10000).padStart(4, "0");
  return { visitorKey, suffix };
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const allowed =
    origin.endsWith(".chatgpt.site") ||
    origin === "https://imyuna743-web.github.io";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export function optionsResponse(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function json(request: Request, data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...corsHeaders(request), ...(init.headers || {}) },
  });
}

export function readPngSize(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function toBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + size));
  }
  return btoa(binary);
}
