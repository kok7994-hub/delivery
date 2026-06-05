import { Router } from "express";
import { db } from "@workspace/db";
import { stopsTable, deliverySessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { OptimizeRouteParams, OptimizeRouteBody } from "@workspace/api-zod";

const router = Router();

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest neighbor TSP heuristic
function nearestNeighborTSP(
  stops: { id: number; lat: number; lng: number }[],
  startLat: number,
  startLng: number
): number[] {
  const unvisited = new Set(stops.map((_, i) => i));
  const order: number[] = [];
  let curLat = startLat;
  let curLng = startLng;

  while (unvisited.size > 0) {
    let nearest = -1;
    let nearestDist = Infinity;
    for (const idx of unvisited) {
      const d = haversine(curLat, curLng, stops[idx].lat, stops[idx].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = idx;
      }
    }
    order.push(nearest);
    unvisited.delete(nearest);
    curLat = stops[nearest].lat;
    curLng = stops[nearest].lng;
  }
  return order;
}

router.post("/delivery-sessions/:id/optimize", async (req, res) => {
  const { id } = OptimizeRouteParams.parse({ id: Number(req.params.id) });
  const body = OptimizeRouteBody.parse(req.body);

  const stops = await db
    .select()
    .from(stopsTable)
    .where(eq(stopsTable.sessionId, id));

  const geocodedStops = stops.filter((s) => s.lat !== null && s.lng !== null) as (typeof stops[0] & { lat: number; lng: number })[];

  if (geocodedStops.length === 0) {
    res.status(400).json({ error: "No geocoded stops to optimize" });
    return;
  }

  const startLat = body.startLat ?? geocodedStops[0].lat;
  const startLng = body.startLng ?? geocodedStops[0].lng;

  const order = nearestNeighborTSP(
    geocodedStops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })),
    startLat,
    startLng
  );

  // Update orderIndex for each stop
  const orderedStops = await Promise.all(
    order.map(async (idx, newOrder) => {
      const stop = geocodedStops[idx];
      const [updated] = await db
        .update(stopsTable)
        .set({ orderIndex: newOrder })
        .where(eq(stopsTable.id, stop.id))
        .returning();
      return updated;
    })
  );

  // Calculate total distance
  let totalDistanceKm = haversine(startLat, startLng, geocodedStops[order[0]].lat, geocodedStops[order[0]].lng);
  for (let i = 0; i < order.length - 1; i++) {
    totalDistanceKm += haversine(
      geocodedStops[order[i]].lat,
      geocodedStops[order[i]].lng,
      geocodedStops[order[i + 1]].lat,
      geocodedStops[order[i + 1]].lng
    );
  }

  // Estimate time: 30 km/h average + 3 min per stop
  const estimatedDurationMinutes = Math.round((totalDistanceKm / 30) * 60 + orderedStops.length * 3);

  // Save estimated duration to session
  await db
    .update(deliverySessionsTable)
    .set({ estimatedDurationMinutes, status: "in_progress" })
    .where(eq(deliverySessionsTable.id, id));

  const waypoints = [
    { lat: startLat, lng: startLng },
    ...orderedStops
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => ({ lat: s.lat!, lng: s.lng! })),
  ];

  res.json({
    orderedStops: orderedStops.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    estimatedDurationMinutes,
    waypoints,
  });
});

export default router;
