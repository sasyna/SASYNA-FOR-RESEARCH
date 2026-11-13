import { Router, type IRouter } from "express";
import { getMigrationSQL } from "../lib/migrations.js";

const router: IRouter = Router();

router.get("/setup/sql", async (req, res) => {
  const userRole = req.headers["x-user-role"] as string;
  if (userRole !== "superadmin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  res.setHeader("Content-Type", "text/plain");
  res.send(getMigrationSQL());
});

export default router;
