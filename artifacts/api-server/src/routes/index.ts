import { Router, type IRouter } from "express";
import healthRouter from "./health";
import f9Services from "./f9-services";

const router: IRouter = Router();

router.use(healthRouter);
router.use(f9Services);

export default router;
