import { ipIdentity, json, optionsResponse, siteEnv } from "@/lib/frame-store";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const identity = await ipIdentity(request);
  const { DB } = siteEnv();
  const exists = await DB.prepare("SELECT 1 AS found FROM frame_likes WHERE frame_id = ? AND visitor_id = ?")
    .bind(id, identity.visitorKey)
    .first();
  const now = Math.floor(Date.now() / 1000);
  if (exists) {
    await DB.batch([
      DB.prepare("DELETE FROM frame_likes WHERE frame_id = ? AND visitor_id = ?").bind(id, identity.visitorKey),
      DB.prepare("UPDATE frames SET likes_count = MAX(0, likes_count - 1) WHERE id = ? AND deleted_at IS NULL").bind(id),
    ]);
  } else {
    await DB.batch([
      DB.prepare("INSERT OR IGNORE INTO frame_likes (frame_id, visitor_id, created_at) VALUES (?, ?, ?)").bind(id, identity.visitorKey, now),
      DB.prepare("UPDATE frames SET likes_count = likes_count + 1 WHERE id = ? AND deleted_at IS NULL").bind(id),
    ]);
  }
  const frame = await DB.prepare("SELECT likes_count FROM frames WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ likes_count: number }>();
  if (!frame) return json(request, { error: "삭제되었거나 존재하지 않는 프레임입니다." }, { status: 404 });
  return json(request, { liked: !exists, likesCount: frame.likes_count });
}
