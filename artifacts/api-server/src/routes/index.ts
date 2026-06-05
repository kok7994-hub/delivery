import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deliverySessionsRouter from "./delivery-sessions";
import stopsRouter from "./stops";
import routeOptimizeRouter from "./route-optimize";
import extractRouter from "./extract";
import geocodeRouter from "./geocode";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deliverySessionsRouter);
router.use(stopsRouter);
router.use(routeOptimizeRouter);
router.use(extractRouter);
router.use(geocodeRouter);

export default router;
