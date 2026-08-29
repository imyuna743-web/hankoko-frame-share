import { ipIdentity, json, optionsResponse, siteEnv } from "@/lib/frame-store";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const identity = await ipIdentity(request);
  const { DB, BUCKET } = siteEnv();
  const now = Math.floor(Date.now() / 1000);
  const inserted = await DB.prepare("INSERT OR IGNORE INTO frame_reports (frame_id, visitor_id, created_at) VALUES (?, ?, ?)")
    .bind(id, identity.visitorKey, now)
    .run();
  if (!inserted.meta.changes) {
    return json(request, { error: "이미 신고한 프레임입니다." }, { status: 409 });
  }
  await DB.prepare("UPDATE frames SET reports_count = reports_count + 1 WHERE id = ? AND deleted_at IS NULL").bind(id).run();
  const frame = await DB.prepare("SELECT image_key, reports_count FROM frames WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{ image_key: string; reports_count: number }>();
  if (!frame) return json(request, { error: "삭제되었거나 존재하지 않는 프레임입니다." }, { status: 404 });
  if (frame.reports_count >= 10) {
    await DB.prepare("UPDATE frames SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").bind(now, id).run();
    await BUCKET.delete(frame.image_key);
    return json(request, { removed: true, reportsCount: frame.reports_count });
  }
  return json(request, { removed: false, reportsCount: frame.reports_count });
}
