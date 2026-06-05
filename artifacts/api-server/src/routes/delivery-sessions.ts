import { Router } from "express";
import { db } from "@workspace/db";
import { deliverySessionsTable, stopsTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import {
  CreateDeliverySessionBody,
  GetDeliverySessionParams,
  DeleteDeliverySessionParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/delivery-sessions", async (req, res) => {
  const sessions = await db
    .select({
      id: deliverySessionsTable.id,
      name: deliverySessionsTable.name,
      date: deliverySessionsTable.date,
      status: deliverySessionsTable.status,
      startAddress: deliverySessionsTable.startAddress,
      estimatedDurationMinutes: deliverySessionsTable.estimatedDurationMinutes,
      createdAt: deliverySessionsTable.createdAt,
    })
    .from(deliverySessionsTable)
    .orderBy(desc(deliverySessionsTable.createdAt));

  const result = await Promise.all(
    sessions.map(async (s) => {
      const stopStats = await db
        .select({
          totalStops: count(),
          completedStops: sql<number>`cast(count(*) filter (where status = 'delivered') as int)`,
        })
        .from(stopsTable)
        .where(eq(stopsTable.sessionId, s.id));

      return {
        ...s,
        createdAt: s.createdAt.toISOString(),
        totalStops: Number(stopStats[0]?.totalStops ?? 0),
        completedStops: Number(stopStats[0]?.completedStops ?? 0),
      };
    })
  );

  res.json(result);
});

router.post("/delivery-sessions", async (req, res) => {
  const body = CreateDeliverySessionBody.parse(req.body);
  const [session] = await db
    .insert(deliverySessionsTable)
    .values({
      name: body.name,
      date: body.date,
      startAddress: body.startAddress ?? null,
    })
    .returning();

  res.status(201).json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    totalStops: 0,
    completedStops: 0,
  });
});

router.get("/delivery-sessions/:id", async (req, res) => {
  const { id } = GetDeliverySessionParams.parse({ id: Number(req.params.id) });
  const [session] = await db
    .select()
    .from(deliverySessionsTable)
    .where(eq(deliverySessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const stops = await db
    .select()
    .from(stopsTable)
    .where(eq(stopsTable.sessionId, id))
    .orderBy(stopsTable.orderIndex);

  res.json({
    ...session,
    createdAt: session.createdAt.toISOString(),
    stops: stops.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
  });
});

router.delete("/delivery-sessions/:id", async (req, res) => {
  const { id } = DeleteDeliverySessionParams.parse({ id: Number(req.params.id) });
  await db.delete(deliverySessionsTable).where(eq(deliverySessionsTable.id, id));
  res.status(204).send();
});

export default router;
