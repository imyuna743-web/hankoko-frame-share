"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Download, Flag, Heart, ImagePlus, LoaderCircle, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

type SortKey = "recommended" | "newest" | "liked";
type ShapeTag = "원형" | "둥근 사각형" | "사각형";
type Frame = {
  id: string;
  nickname: string;
  shapeTag: ShapeTag;
  tags: string[];
  likesCount: number;
  reportsCount: number;
  createdAt: number;
  imageUrl: string;
  liked: boolean;
};
type ImageMeta = { width: number; height: number; baseWidth: number; baseHeight: number };

const BOOKMARK_KEY = "hankoko-frame-bookmarks";
const HANKOKO_URL = "https://hankoko-log-backup-draft.ighdd678.chatgpt.site";

function readStoredSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try { return new Set<string>(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set<string>(); }
}

function displayDate(seconds: number) {
  const days = Math.floor(Math.max(0, Date.now() - seconds * 1000) / 86400000);
  if (days === 0) return "오늘";
  if (days < 30) return `${days}일 전`;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(seconds * 1000));
}

export default function FrameGallery() {
  const [sort, setSort] = useState<SortKey>("recommended");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, zoom: 1 });
  const [nickname, setNickname] = useState("");
  const [shapeTag, setShapeTag] = useState<ShapeTag>("원형");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(null);

  const loadFrames = useCallback(async (nextSort: SortKey) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/frames?sort=${nextSort}`);
      const payload = await response.json() as { frames?: Frame[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "프레임을 불러오지 못했습니다.");
      setFrames(payload.frames || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "프레임을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setBookmarks(readStoredSet(BOOKMARK_KEY)));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadFrames(sort));
    return () => cancelAnimationFrame(frame);
  }, [loadFrames, sort]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const visibleFrames = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return frames.filter((frame) => {
      if (showBookmarks && !bookmarks.has(frame.id)) return false;
      if (!normalized) return true;
      return [frame.nickname, frame.shapeTag, ...frame.tags]
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized));
    });
  }, [bookmarks, frames, query, showBookmarks]);

  const cropLimit = useCallback((zoom: number, meta = imageMeta) => {
    if (!meta) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (meta.baseWidth * zoom - 360) / 2),
      y: Math.max(0, (meta.baseHeight * zoom - 360) / 2),
    };
  }, [imageMeta]);

  const chooseFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("PNG·JPG·WEBP 이미지 파일을 선택해 주세요.");
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      if (probe.naturalWidth < 512 || probe.naturalHeight < 512) {
        URL.revokeObjectURL(url);
        setUploadError("이미지가 너무 작습니다. 가로와 세로 모두 512px 이상인 이미지만 업로드할 수 있습니다.");
        return;
      }
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      const ratio = probe.naturalWidth / probe.naturalHeight;
      setImageUrl(url);
      setImageMeta({
        width: probe.naturalWidth,
        height: probe.naturalHeight,
        baseWidth: ratio >= 1 ? 360 * ratio : 360,
        baseHeight: ratio >= 1 ? 360 : 360 / ratio,
      });
      setCrop({ x: 0, y: 0, zoom: 1 });
      setUploadError("");
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setUploadError("이미지를 읽을 수 없습니다."); };
    probe.src = url;
  };

  const updateZoom = (zoom: number) => {
    const limit = cropLimit(zoom);
    setCrop((current) => ({ x: Math.max(-limit.x, Math.min(limit.x, current.x)), y: Math.max(-limit.y, Math.min(limit.y, current.y)), zoom }));
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageMeta) return;
    drag.current = { x: event.clientX, y: event.clientY, cropX: crop.x, cropY: crop.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !imageMeta) return;
    const limit = cropLimit(crop.zoom);
    const x = drag.current.cropX + event.clientX - drag.current.x;
    const y = drag.current.cropY + event.clientY - drag.current.y;
    setCrop((current) => ({ ...current, x: Math.max(-limit.x, Math.min(limit.x, x)), y: Math.max(-limit.y, Math.min(limit.y, y)) }));
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const addTag = () => {
    const next = tagDraft.trim().replace(/^#/, "");
    if (!next) return;
    if ([...next].length > 15) return setUploadError("태그는 15자 이하로 입력해 주세요.");
    if (tags.length >= 4) return setUploadError("기본 모양 태그를 포함해 태그는 최대 5개까지 사용할 수 있습니다.");
    if (!tags.includes(next)) setTags((current) => [...current, next]);
    setTagDraft("");
    setUploadError("");
  };

  const makeCroppedPng = () => new Promise<Blob>((resolve, reject) => {
    if (!image.current || !imageMeta) return reject(new Error("이미지를 선택해 주세요."));
    const minSide = Math.min(imageMeta.width, imageMeta.height);
    const sourceSide = minSide / crop.zoom;
    const scaleX = (imageMeta.baseWidth * crop.zoom) / imageMeta.width;
    const scaleY = (imageMeta.baseHeight * crop.zoom) / imageMeta.height;
    const centerX = imageMeta.width / 2 - crop.x / scaleX;
    const centerY = imageMeta.height / 2 - crop.y / scaleY;
    const sourceX = Math.max(0, Math.min(imageMeta.width - sourceSide, centerX - sourceSide / 2));
    const sourceY = Math.max(0, Math.min(imageMeta.height - sourceSide, centerY - sourceSide / 2));
    const outputSize = Math.max(512, Math.min(1024, Math.floor(minSide)));
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) return reject(new Error("이미지를 처리할 수 없습니다."));
    context.drawImage(image.current, sourceX, sourceY, sourceSide, sourceSide, 0, 0, outputSize, outputSize);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다.")), "image/png");
  });

  const uploadFrame = async () => {
    if (!imageMeta) return setUploadError("업로드할 이미지를 먼저 선택해 주세요.");
    setUploading(true);
    setUploadError("");
    try {
      const blob = await makeCroppedPng();
      const body = new FormData();
      body.append("image", blob, "frame.png");
      body.append("nickname", nickname.trim());
      body.append("shapeTag", shapeTag);
      body.append("tags", JSON.stringify(tags));
      const response = await fetch("/api/frames", { method: "POST", body });
      const payload = await response.json() as { frame?: Frame; error?: string };
      if (!response.ok || !payload.frame) throw new Error(payload.error || "업로드하지 못했습니다.");
      setFrames((current) => [payload.frame!, ...current]);
      setUploadOpen(false);
      setImageUrl("");
      setImageMeta(null);
      setNickname("");
      setTags([]);
      toast.success("프레임을 업로드했습니다.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "업로드하지 못했습니다.");
    } finally { setUploading(false); }
  };

  const toggleBookmark = (id: string) => {
    const next = new Set(bookmarks);
    if (next.has(id)) next.delete(id); else next.add(id);
    setBookmarks(next);
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...next]));
  };

  const toggleLike = async (frame: Frame) => {
    try {
      const response = await fetch(`/api/frames/${frame.id}/like`, { method: "POST" });
      const payload = await response.json() as { liked?: boolean; likesCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "좋아요를 반영하지 못했습니다.");
      setFrames((current) => current.map((item) => item.id === frame.id ? { ...item, liked: Boolean(payload.liked), likesCount: payload.likesCount ?? item.likesCount } : item));
    } catch (error) { toast.error(error instanceof Error ? error.message : "좋아요를 반영하지 못했습니다."); }
  };

  const reportFrame = async (frame: Frame) => {
    if (!confirm("이 프레임을 불쾌하거나 부적절한 이미지로 신고할까요?")) return;
    try {
      const response = await fetch(`/api/frames/${frame.id}/report`, { method: "POST" });
      const payload = await response.json() as { removed?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "신고를 접수하지 못했습니다.");
      if (payload.removed) setFrames((current) => current.filter((item) => item.id !== frame.id));
      toast.success(payload.removed ? "신고 누적으로 프레임이 삭제되었습니다." : "신고가 접수되었습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "신고를 접수하지 못했습니다."); }
  };

  const importToHankoko = (frame: Frame) => {
    const absoluteImage = new URL(frame.imageUrl, window.location.origin).toString();
    window.open(`${HANKOKO_URL}/?import_frame=${encodeURIComponent(absoluteImage)}&frame_shape=${encodeURIComponent(frame.shapeTag)}`, "_blank", "noopener,noreferrer");
  };

  return <main className="frame-site">
    <Toaster position="top-center" richColors />
    <header className="site-header">
      <a className="brand" href="#top" aria-label="한코코 프레임 공유소 홈"><strong>HANKOKO</strong><span>FRAME SHARE</span></a>
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogTrigger asChild><button className="upload-button"><Upload size={18} />프레임 올리기</button></DialogTrigger>
        <DialogContent className="upload-dialog" showCloseButton={!uploading}>
          <DialogHeader>
            <DialogTitle>프레임 업로드</DialogTitle>
            <DialogDescription>가로·세로 모두 512px 이상인 이미지만 등록할 수 있습니다. 업로드 전 자동 안전 검사를 진행합니다.</DialogDescription>
          </DialogHeader>
          <div className="upload-grid">
            <section className="crop-panel">
              {!imageUrl ? <button className="file-drop" type="button" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}>
                <ImagePlus size={34} /><b>이미지 선택</b><span>PNG · JPG · WEBP</span><small>최소 512×512</small>
              </button> : <>
                <div className={`crop-stage shape-${shapeTag === "원형" ? "circle" : shapeTag === "둥근 사각형" ? "rounded" : "square"}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
                  <div className="crop-image-wrap" style={{ marginLeft: crop.x, marginTop: crop.y }}>
                    <img ref={image} src={imageUrl} alt="크롭할 이미지" draggable={false} style={{ width: imageMeta?.baseWidth, height: imageMeta?.baseHeight, transform: `scale(${crop.zoom})` }} />
                  </div>
                  <span className="crop-guide" />
                </div>
                <label className="zoom-control"><span>확대</span><input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(event) => updateZoom(Number(event.target.value))} /><b>{Math.round(crop.zoom * 100)}%</b></label>
                <button className="replace-image" type="button" onClick={() => fileInput.current?.click()}>다른 이미지 선택</button>
              </>}
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />
            </section>
            <section className="meta-panel">
              <label><span>닉네임 <small>선택</small></span><input maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="미입력 시 한코코 · IP 식별번호" /></label>
              <p className="ip-note">같은 IP에서는 닉네임 뒤에 같은 4자리 번호가 붙습니다. 원본 IP는 저장하지 않습니다.</p>
              <label><span>기본 모양 태그 <b>필수</b></span>
                <Select value={shapeTag} onValueChange={(value) => setShapeTag(value as ShapeTag)}>
                  <SelectTrigger className="shape-select"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="원형">원형</SelectItem><SelectItem value="둥근 사각형">둥근 사각형</SelectItem><SelectItem value="사각형">사각형</SelectItem></SelectContent>
                </Select>
              </label>
              <div className="tag-maker"><span>추가 태그 <small>{tags.length + 1}/5</small></span><div><input maxLength={15} value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} placeholder="15자 이하" /><button type="button" onClick={addTag} aria-label="태그 추가"><Plus size={18} /></button></div></div>
              <div className="draft-tags"><span>#{shapeTag}</span>{tags.map((tag) => <button type="button" key={tag} onClick={() => setTags((current) => current.filter((item) => item !== tag))}>#{tag}<X size={13} /></button>)}</div>
              <p className="moderation-note"><Sparkles size={16} />유해하거나 타인에게 불쾌감을 줄 수 있는 이미지는 자동 검사에서 차단됩니다.</p>
            </section>
          </div>
          {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
          <DialogFooter className="upload-footer">
            <button type="button" className="cancel-button" disabled={uploading} onClick={() => setUploadOpen(false)}>취소</button>
            <button type="button" className="submit-button" disabled={uploading || !imageMeta} onClick={() => void uploadFrame()}>{uploading ? <><LoaderCircle className="spin" size={18} />검사 중</> : <><Upload size={18} />검사 후 업로드</>}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>

    <section className="gallery-shell" id="top">
      <div className="gallery-toolbar">
        <label className="frame-search"><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="닉네임·태그 검색" aria-label="프레임 검색" />{query && <button type="button" onClick={() => setQuery("")} aria-label="검색어 지우기"><X size={16} /></button>}</label>
        <Tabs value={sort} onValueChange={(value) => setSort(value as SortKey)}><TabsList className="sort-tabs"><TabsTrigger value="recommended">추천순</TabsTrigger><TabsTrigger value="newest">최신순</TabsTrigger><TabsTrigger value="liked">좋아요순</TabsTrigger></TabsList></Tabs>
        <button className={showBookmarks ? "bookmark-filter active" : "bookmark-filter"} type="button" onClick={() => setShowBookmarks((current) => !current)}><Bookmark size={17} fill={showBookmarks ? "currentColor" : "none"} />북마크 {bookmarks.size}</button>
      </div>

      {loading ? <div className="gallery-state"><LoaderCircle className="spin" /><span>프레임을 불러오는 중</span></div> : visibleFrames.length ? <div className="frame-grid">{visibleFrames.map((frame) => <article className="frame-card" key={frame.id}>
        <div className="frame-image"><img src={frame.imageUrl} alt={`${frame.nickname}의 프로필 프레임`} /><button className={bookmarks.has(frame.id) ? "bookmark-card active" : "bookmark-card"} type="button" onClick={() => toggleBookmark(frame.id)} aria-label="북마크"><Bookmark size={19} fill={bookmarks.has(frame.id) ? "currentColor" : "none"} /></button></div>
        <div className="frame-info"><div><b>{frame.nickname}</b><small>{displayDate(frame.createdAt)}</small></div><div className="frame-tags">{frame.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
        <div className="frame-actions"><button className={frame.liked ? "like active" : "like"} type="button" onClick={() => void toggleLike(frame)}><Heart size={17} fill={frame.liked ? "currentColor" : "none"} />{frame.likesCount}</button><button className="import" type="button" onClick={() => importToHankoko(frame)}><Download size={17} />한코코로 불러오기</button><button className="report" type="button" onClick={() => void reportFrame(frame)} aria-label="신고"><Flag size={16} /></button></div>
      </article>)}</div> : <div className="empty-gallery"><div>{query ? <Search size={36} /> : <ImagePlus size={36} />}</div><h2>{query ? "검색 결과가 없습니다" : showBookmarks ? "저장한 프레임이 없습니다" : "첫 프레임을 기다리고 있어요"}</h2><p>{query ? "다른 닉네임이나 태그로 다시 검색해 보세요." : showBookmarks ? "마음에 드는 프레임의 북마크 버튼을 눌러 보관하세요." : "512×512 이상의 프레임 이미지를 가장 먼저 공유해 보세요."}</p>{!query && !showBookmarks && <button type="button" onClick={() => setUploadOpen(true)}><Upload size={17} />프레임 올리기</button>}</div>}
    </section>
    <footer className="site-footer"><span>HANKOKO FRAME SHARE</span></footer>
  </main>;
}
