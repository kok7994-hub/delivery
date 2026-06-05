import { pgTable, text, serial, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionStatusEnum = pgEnum("session_status", ["pending", "in_progress", "completed"]);
export const stopStatusEnum = pgEnum("stop_status", ["pending", "delivered", "failed", "skipped"]);

export const deliverySessionsTable = pgTable("delivery_sessions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  status: sessionStatusEnum("status").notNull().default("pending"),
  startAddress: text("start_address"),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stopsTable = pgTable("stops", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => deliverySessionsTable.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  recipientName: text("recipient_name"),
  items: text("items"),
  notes: text("notes"),
  lat: real("lat"),
  lng: real("lng"),
  orderIndex: integer("order_index").notNull().default(0),
  status: stopStatusEnum("status").notNull().default("pending"),
  estimatedArrival: text("estimated_arrival"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDeliverySessionSchema = createInsertSchema(deliverySessionsTable).omit({ id: true, createdAt: true });
export const insertStopSchema = createInsertSchema(stopsTable).omit({ id: true, createdAt: true });

export type DeliverySession = typeof deliverySessionsTable.$inferSelect;
export type InsertDeliverySession = z.infer<typeof insertDeliverySessionSchema>;
export type Stop = typeof stopsTable.$inferSelect;
export type InsertStop = z.infer<typeof insertStopSchema>;
