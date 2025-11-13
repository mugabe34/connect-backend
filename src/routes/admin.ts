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
  const { q, role } = req.query as { q?: string; role?: string };
  const filter: any = {};
  if (q) filter.$or = [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];
  if (role) filter.role = role;
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json(users);
});

router.get("/users/:id", guard, async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Do NOT return the hashed password to the client. Return user details only.
  const safeUser = user.toObject();
  delete (safeUser as any).password;
  res.json(safeUser);
});

router.patch("/users/:id", guard, async (req: Request, res: Response) => {
  const { name, role, isActive, email } = req.body as { name?: string; role?: string; isActive?: boolean; email?: string };
  const update: any = {};
  if (name !== undefined) update.name = name;
  if (role !== undefined) update.role = role;
  if (isActive !== undefined) update.isActive = isActive;
  if (email !== undefined) update.email = email;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true }
  ).select('+password');
  if (!user) return res.status(404).json({ message: "User not found" });
  const safeUser = user.toObject();
  delete (safeUser as any).password;
  res.json(safeUser);
});

// Admin can reset a user's password (securely set a new password)
router.patch('/users/:id/password', guard, async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password || password.length <6) return res.status(400).json({ message: 'Password must be at least6 characters' });
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.password = password as any; // will be hashed by pre-save hook
  await user.save();
  const safeUser = user.toObject();
  delete (safeUser as any).password;
  res.json({ message: 'Password updated', user: safeUser });
});

router.delete("/users/:id", guard, async (req: Request, res: Response) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.status(200).json({ message: "User deleted" });
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
  const { q, approved } = req.query as { q?: string; approved?: string };
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
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.status(200).json({ message: "Product deleted" });
});

export default router;
