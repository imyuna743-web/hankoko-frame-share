import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const frames = sqliteTable("frames", {
  id: text("id").primaryKey(),
  imageKey: text("image_key").notNull(),
  imageType: text("image_type").notNull(),
  nickname: text("nickname").notNull(),
  shapeTag: text("shape_tag").notNull(),
  tags: text("tags").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  likesCount: integer("likes_count").notNull().default(0),
  reportsCount: integer("reports_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const frameLikes = sqliteTable("frame_likes", {
  frameId: text("frame_id").notNull().references(() => frames.id),
  visitorId: text("visitor_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.frameId, table.visitorId] })]);

export const frameReports = sqliteTable("frame_reports", {
  frameId: text("frame_id").notNull().references(() => frames.id),
  visitorId: text("visitor_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.frameId, table.visitorId] })]);
