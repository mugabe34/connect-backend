import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import User from "../models/User";
import Product from "../models/Product";
import Message from "../models/Message";

const router = Router();
const guard = [requireAuth, requireRole("admin")];

router.get("/dashboard", guard, async (_req: Request, res: Response) => {
  const [totalUsers, totalProducts, pendingApprovals] = await Promise.all([
    User.countDocuments({}),
    Product.countDocuments({}),
    Product.countDocuments({ approved: false })
  ]);
  res.json({ totalUsers, totalProducts, pendingApprovals });
});

// Users
router.get("/users", guard, async (req: Request, res: Response) => {
  const { q, role } = req.query as { q?: string; role?: string };
  const filter: any = {};
  if (q) filter.$or = [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];
  if (role) filter.role = role;
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
  const ids = users.map((u) => u._id);
  const counts = await Product.aggregate([
    { $match: { seller: { $in: ids } } },
    { $group: { _id: "$seller", totalProducts: { $sum: 1 } } }
  ]);
  const countMap = new Map<string, number>();
  counts.forEach((c) => countMap.set(String(c._id), c.totalProducts));
  const withCounts = users.map((u) => {
    const obj = u.toObject();
    return { ...obj, productCount: countMap.get(String(u._id)) || 0 };
  });
  res.json(withCounts);
});

router.get("/users/:id", guard, async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  // Do NOT return the hashed password to the client. Return user details only.
  const safeUser = user.toObject();
  delete (safeUser as any).password;
  res.json(safeUser);
});

// Create a user (admin only)
router.post("/users", guard, async (req: Request, res: Response) => {
  const { name, email, password, role, phone, location, bio } = req.body as any;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ message: "Email already exists" });
  const user = await User.create({
    name,
    email,
    password,
    role: role || "buyer",
    phone,
    location,
    bio,
  });
  const safeUser = user.toObject();
  delete (safeUser as any).password;
  res.status(201).json(safeUser);
});

router.patch("/users/:id", guard, async (req: Request, res: Response) => {
  const { name, role, isActive, email, phone, location, bio, avatarUrl } = req.body as { name?: string; role?: string; isActive?: boolean; email?: string; phone?: string; location?: string; bio?: string; avatarUrl?: string };
  const update: any = {};
  if (name !== undefined) update.name = name;
  if (role !== undefined) update.role = role;
  if (isActive !== undefined) update.isActive = isActive;
  if (email !== undefined) update.email = email;
  if (phone !== undefined) update.phone = phone;
  if (location !== undefined) update.location = location;
  if (bio !== undefined) update.bio = bio;
  if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
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

// Admin send message to a seller
router.post("/users/:id/message", guard, async (req: Request, res: Response) => {
  const { subject, body } = req.body as { subject?: string; body?: string };
  if (!body || body.trim().length === 0) {
    return res.status(400).json({ message: "Message body is required" });
  }
  const recipient = await User.findById(req.params.id);
  if (!recipient) return res.status(404).json({ message: "User not found" });
  if (recipient.role !== "seller") return res.status(400).json({ message: "Messages can only be sent to sellers" });

  const message = await Message.create({
    sender: req.user!.id,
    recipient: recipient.id,
    subject,
    body,
    fromAdmin: true,
  });

  res.status(201).json({ message: "Message sent", data: message });
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
