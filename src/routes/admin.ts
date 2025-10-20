import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import User from "../models/User";
import Product from "../models/Product";

const router = Router();
const guard = [requireAuth, requireRole("admin")];

router.get("/dashboard", guard, async (_req: Request, res: Response) => {
  const [totalUsers, totalProducts, totalOrders, pendingApprovals] = await Promise.all([
    User.countDocuments({}),
    Product.countDocuments({}),
    Promise.resolve(0), // orders placeholder, to be implemented later
    Product.countDocuments({ approved: false })
  ]);
  res.json({ totalUsers, totalProducts, totalOrders, pendingApprovals });
});

// Users
router.get("/users", guard, async (req: Request, res: Response) => {
  const { q, role } = req.query as any;
  const filter: any = {};
  if (q) filter.$or = [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];
  if (role) filter.role = role;
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(users);
});

router.patch("/users/:id", guard, async (req: Request, res: Response) => {
  const { name, role, isActive } = req.body as any;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { name, role, isActive } },
    { new: true }
  );
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

router.delete("/users/:id", guard, async (req: Request, res: Response) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
});

// Sellers
router.post("/sellers/:id/approve", guard, async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate(req.params.id, { role: "seller", isActive: true }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

router.post("/sellers/:id/suspend", guard, async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

// Products
router.get("/products", guard, async (req: Request, res: Response) => {
  const { q, approved } = req.query as any;
  const filter: any = {};
  if (q) filter.title = new RegExp(q, "i");
  if (approved !== undefined) filter.approved = approved === "true";
  const items = await Product.find(filter).populate("seller", "name email").sort({ createdAt: -1 });
  res.json(items);
});

router.post("/products/:id/approve", guard, async (req: Request, res: Response) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json(product);
});

router.post("/products/:id/feature", guard, async (req: Request, res: Response) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { featured: true }, { new: true });
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json(product);
});

router.delete("/products/:id", guard, async (req: Request, res: Response) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: "Product deleted" });
});

export default router;


