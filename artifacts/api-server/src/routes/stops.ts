import { Router } from "express";
import { db } from "@workspace/db";
import { stopsTable, deliverySessionsTable } from "@workspace/db";
import { eq, max } from "drizzle-orm";
import {
  CreateStopParams,
  CreateStopBody,
  BatchCreateStopsParams,
  BatchCreateStopsBody,
  UpdateStopParams,
  UpdateStopBody,
  DeleteStopParams,
  ListStopsParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/delivery-sessions/:id/stops", async (req, res) => {
  const { id } = ListStopsParams.parse({ id: Number(req.params.id) });
  const stops = await db
    .select()
    .from(stopsTable)
    .where(eq(stopsTable.sessionId, id))
    .orderBy(stopsTable.orderIndex);

  res.json(stops.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.post("/delivery-sessions/:id/stops", async (req, res) => {
  const { id } = CreateStopParams.parse({ id: Number(req.params.id) });
  const body = CreateStopBody.parse(req.body);

  const [maxResult] = await db
    .select({ maxIdx: max(stopsTable.orderIndex) })
    .from(stopsTable)
    .where(eq(stopsTable.sessionId, id));

  const nextIndex = (maxResult?.maxIdx ?? -1) + 1;

  const [stop] = await db
    .insert(stopsTable)
    .values({
      sessionId: id,
      address: body.address,
      recipientName: body.recipientName ?? null,
      items: body.items ?? null,
      notes: body.notes ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      orderIndex: nextIndex,
    })
    .returning();

  res.status(201).json({ ...stop, createdAt: stop.createdAt.toISOString() });
});

router.post("/delivery-sessions/:id/stops/batch", async (req, res) => {
  const { id } = BatchCreateStopsParams.parse({ id: Number(req.params.id) });
  const body = BatchCreateStopsBody.parse(req.body);

  const [maxResult] = await db
    .select({ maxIdx: max(stopsTable.orderIndex) })
    .from(stopsTable)
    .where(eq(stopsTable.sessionId, id));

  const startIndex = (maxResult?.maxIdx ?? -1) + 1;

  const rows = body.stops.map((s, i) => ({
    sessionId: id,
    address: s.address,
    recipientName: s.recipientName ?? null,
    items: s.items ?? null,
    notes: s.notes ?? null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    orderIndex: startIndex + i,
  }));

  const inserted = await db.insert(stopsTable).values(rows).returning();
  res.status(201).json(inserted.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.patch("/stops/:stopId", async (req, res) => {
  const { stopId } = UpdateStopParams.parse({ stopId: Number(req.params.stopId) });
  const body = UpdateStopBody.parse(req.body);

  const updateData: Record<string, unknown> = {};
  if (body.address !== undefined) updateData.address = body.address;
  if (body.recipientName !== undefined) updateData.recipientName = body.recipientName;
  if (body.items !== undefined) updateData.items = body.items;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.orderIndex !== undefined) updateData.orderIndex = body.orderIndex;

  const [stop] = await db
    .update(stopsTable)
    .set(updateData)
    .where(eq(stopsTable.id, stopId))
    .returning();

  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }

  // Update session status based on stops
  const allStops = await db
    .select()
    .from(stopsTable)
    .where(eq(stopsTable.sessionId, stop.sessionId));

  const hasInProgress = allStops.some((s) => s.status === "delivered" || s.status === "failed");
  const allDone = allStops.every((s) => s.status !== "pending");

  if (allDone && allStops.length > 0) {
    await db
      .update(deliverySessionsTable)
      .set({ status: "completed" })
      .where(eq(deliverySessionsTable.id, stop.sessionId));
  } else if (hasInProgress) {
    await db
      .update(deliverySessionsTable)
      .set({ status: "in_progress" })
      .where(eq(deliverySessionsTable.id, stop.sessionId));
  }

  res.json({ ...stop, createdAt: stop.createdAt.toISOString() });
});

router.delete("/stops/:stopId", async (req, res) => {
  const { stopId } = DeleteStopParams.parse({ stopId: Number(req.params.stopId) });
  await db.delete(stopsTable).where(eq(stopsTable.id, stopId));
  res.status(204).send();
});

export default router;
