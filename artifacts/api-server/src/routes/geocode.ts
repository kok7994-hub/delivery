import { Router } from "express";
import { GeocodeAddressQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/geocode", async (req, res) => {
  const { address } = GeocodeAddressQueryParams.parse(req.query);

  const encoded = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&accept-language=ko`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "DeliveryRouteOptimizer/1.0",
    },
  });

  if (!response.ok) {
    res.status(502).json({ error: "Geocoding service unavailable" });
    return;
  }

  const data = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!data || data.length === 0) {
    res.status(404).json({ error: "Address not found" });
    return;
  }

  const result = data[0];
  res.json({
    address,
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name,
  });
});

export default router;
