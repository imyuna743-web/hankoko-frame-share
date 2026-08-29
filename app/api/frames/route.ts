import { frameFromRow, ipIdentity, json, optionsResponse, readPngSize, siteEnv, toBase64 } from "@/lib/frame-store";

const SHAPE_TAGS = ["원형", "둥근 사각형", "사각형"] as const;

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") || "recommended";
  const identity = await ipIdentity(request);
  const { DB } = siteEnv();
  const now = Math.floor(Date.now() / 1000);
  const order =
    sort === "newest"
      ? "frames.created_at DESC"
      : sort === "liked"
        ? "frames.likes_count DESC, frames.created_at DESC"
        : "(frames.likes_count * 8 + MAX(0, 168 - ((? - frames.created_at) / 3600))) DESC, frames.created_at DESC";
  const statement = DB.prepare(`
    SELECT frames.id, frames.nickname, frames.shape_tag, frames.tags, frames.likes_count, frames.reports_count, frames.created_at,
      CASE WHEN frame_likes.visitor_id IS NULL THEN 0 ELSE 1 END AS liked
    FROM frames
    LEFT JOIN frame_likes ON frame_likes.frame_id = frames.id AND frame_likes.visitor_id = ?
    WHERE frames.deleted_at IS NULL
    ORDER BY ${order}
    LIMIT 60
  `);
  const result = sort === "recommended" ? await statement.bind(identity.visitorKey, now).all() : await statement.bind(identity.visitorKey).all();
  return json(request, { frames: result.results.map((row) => frameFromRow(row as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  const { DB, BUCKET, OPENAI_API_KEY } = siteEnv();
  if (!OPENAI_API_KEY) {
    return json(request, { error: "유해 이미지 검사 기능이 준비되지 않아 현재 업로드를 받을 수 없습니다." }, { status: 503 });
  }

  const form = await request.formData();
  const file = form.get("image");
  const nicknameInput = String(form.get("nickname") || "").trim();
  const shapeTag = String(form.get("shapeTag") || "");
  let customTags: string[] = [];
  try {
    customTags = JSON.parse(String(form.get("tags") || "[]"));
  } catch {
    return json(request, { error: "태그 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!(file instanceof File) || file.type !== "image/png") {
    return json(request, { error: "크롭된 PNG 이미지만 업로드할 수 있습니다." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return json(request, { error: "이미지 용량은 8MB 이하여야 합니다." }, { status: 400 });
  }
  if (!SHAPE_TAGS.includes(shapeTag as (typeof SHAPE_TAGS)[number])) {
    return json(request, { error: "원형·둥근 사각형·사각형 중 하나를 선택해 주세요." }, { status: 400 });
  }

  customTags = customTags
    .map((tag) => String(tag).trim().replace(/^#/, ""))
    .filter(Boolean);
  const uniqueTags = [...new Set(customTags)];
  if (uniqueTags.length > 4 || uniqueTags.some((tag) => [...tag].length > 15)) {
    return json(request, { error: "직접 만든 태그는 4개까지, 태그당 15자 이하로 입력해 주세요." }, { status: 400 });
  }
  if ([...nicknameInput].length > 20) {
    return json(request, { error: "닉네임은 20자 이하로 입력해 주세요." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = readPngSize(bytes);
  if (!size || size.width !== size.height || size.width < 512) {
    return json(request, { error: "512×512 이상의 1:1 이미지가 필요합니다." }, { status: 400 });
  }

  const moderation = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: [
        { type: "text", text: [nicknameInput, shapeTag, ...uniqueTags].filter(Boolean).join(" ") || "character frame" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${toBase64(bytes)}` } },
      ],
    }),
  });
  if (!moderation.ok) {
    return json(request, { error: "이미지 검사에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
  const moderationResult = await moderation.json() as { results?: Array<{ flagged?: boolean }> };
  if (moderationResult.results?.[0]?.flagged) {
    return json(request, { error: "커뮤니티 기준에 맞지 않는 이미지로 판단되어 업로드할 수 없습니다." }, { status: 422 });
  }

  const id = crypto.randomUUID();
  const imageKey = `frames/${id}.png`;
  const identity = await ipIdentity(request);
  const nickname = `${nicknameInput || "한코코"} · ${identity.suffix}`;
  const now = Math.floor(Date.now() / 1000);
  await BUCKET.put(imageKey, bytes, {
    httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=31536000, immutable" },
  });
  try {
    await DB.prepare(`
      INSERT INTO frames (
        id, image_key, image_type, nickname, shape_tag, tags,
        width, height, likes_count, reports_count, created_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL)
    `).bind(id, imageKey, "image/png", nickname, shapeTag, JSON.stringify([shapeTag, ...uniqueTags]), size.width, size.height, now).run();
  } catch (error) {
    await BUCKET.delete(imageKey);
    throw error;
  }

  return json(request, {
    frame: {
      id,
      nickname,
      shapeTag,
      tags: [shapeTag, ...uniqueTags],
      likesCount: 0,
      reportsCount: 0,
      createdAt: now,
      imageUrl: `/api/frames/${id}/image`,
      liked: false,
    },
  }, { status: 201 });
}
