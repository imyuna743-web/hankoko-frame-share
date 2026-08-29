import { corsHeaders, siteEnv } from "@/lib/frame-store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { DB, BUCKET } = siteEnv();
  const row = await DB.prepare("SELECT image_key, image_type FROM frames WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{ image_key: string; image_type: string }>();
  if (!row) return new Response("Not found", { status: 404, headers: corsHeaders(request) });
  const object = await BUCKET.get(row.image_key);
  if (!object) return new Response("Not found", { status: 404, headers: corsHeaders(request) });
  return new Response(object.body, {
    headers: {
      ...corsHeaders(request),
      "Content-Type": row.image_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "ETag": object.httpEtag,
    },
  });
}
