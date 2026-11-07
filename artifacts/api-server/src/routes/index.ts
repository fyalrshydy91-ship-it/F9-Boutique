import { Router, type IRouter } from "express";
import healthRouter from "./health";
import f9Services from "./f9-services";
import catalog from "./catalog";

const router: IRouter = Router();

router.use(healthRouter);
router.use(f9Services);
router.use(catalog);

export default router;
