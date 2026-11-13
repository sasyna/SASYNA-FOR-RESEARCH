import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import ordersRouter from "./orders.js";
import paymentsRouter from "./payments.js";
import revisionsRouter from "./revisions.js";
import adminRouter from "./admin.js";
import superadminRouter from "./superadmin.js";
import withdrawalsRouter from "./withdrawals.js";
import profileRouter from "./profile.js";
import setupRouter from "./setup.js";
import notificationsRouter from "./notifications.js";
import researchRouter from "./research.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(ordersRouter);
router.use(paymentsRouter);
router.use(revisionsRouter);
router.use(adminRouter);
router.use(superadminRouter);
router.use(withdrawalsRouter);
router.use(profileRouter);
router.use(setupRouter);
router.use(notificationsRouter);
router.use(researchRouter);

export default router;
