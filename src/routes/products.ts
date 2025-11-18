import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import Product from "../models/Product";
import { requireAuth, requireRole } from "../middleware/auth";
import User from "../models/User";

const router = Router();

// Set up multer for local storage
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
 fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
 destination: function (req, file, cb) {
 cb(null, uploadDir);
 },
 filename: function (req, file, cb) {
 const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() *1E9);
 cb(null, uniqueSuffix + '-' + file.originalname);
 }
});
const upload = multer({ storage });

// Public: list approved products with search/filter and location prioritization
router.get("/", async (req: Request, res: Response) => {
  const { q, category, tag, featured, location, limit, seller } = req.query as Record<string, string | undefined>;
  const filter: any = { approved: true };
  if (seller) filter.seller = seller;
  if (q) filter.title = { $regex: q, $options: "i" };
  if (category) filter.category = category;
  if (tag) filter.tags = tag;
  if (featured) filter.featured = featured === "true";
  if (location) filter.location = location; // optional filter
  const lim = Number(limit) || 50;
  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(lim)
    .populate("seller", "name email phone location");
  res.json(products);
});

router.get(
  "/seller/:id/summary",
  requireAuth,
  async (req: Request, res: Response) => {
    const sellerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ message: "Invalid seller id" });
    }
    if (req.user!.role !== "admin" && req.user!.id !== sellerId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const seller = await User.findById(sellerId).select("name email role phone location createdAt");
    if (!seller) return res.status(404).json({ message: "Seller not found" });
    const sellerObjectId = new mongoose.Types.ObjectId(sellerId);
    const [topLiked, recentUploads, aggregates] = await Promise.all([
      Product.find({ seller: sellerObjectId }).sort({ likes: -1, createdAt: -1 }).limit(5),
      Product.find({ seller: sellerObjectId }).sort({ createdAt: -1 }).limit(5),
      Product.aggregate([
        { $match: { seller: sellerObjectId } },
        {
          $group: {
            _id: "$seller",
            totalProducts: { $sum: 1 },
            totalLikes: { $sum: "$likes" },
            approvedProducts: { $sum: { $cond: ["$approved", 1, 0] } }
          }
        }
      ])
    ]);
    const statsAgg = aggregates[0] ?? { totalProducts: 0, totalLikes: 0, approvedProducts: 0 };
    const stats = {
      totalProducts: statsAgg.totalProducts,
      totalLikes: statsAgg.totalLikes,
      approvedProducts: statsAgg.approvedProducts,
      pendingProducts: Math.max(0, statsAgg.totalProducts - statsAgg.approvedProducts)
    };
    res.json({ seller, topLiked, recentUploads, stats });
  }
);

router.get("/seller/:id/profile", async (req: Request, res: Response) => {
  const sellerId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    return res.status(400).json({ message: "Invalid seller id" });
  }
  const seller = await User.findById(sellerId).select("name email role phone location createdAt");
  if (!seller) return res.status(404).json({ message: "Seller not found" });
  const analytics = await Product.aggregate([
    { $match: { seller: new mongoose.Types.ObjectId(sellerId), approved: true } },
    {
      $group: {
        _id: "$seller",
        approvedProducts: { $sum: 1 },
        totalLikes: { $sum: "$likes" }
      }
    }
  ]);
  const stats = analytics[0] ?? { approvedProducts: 0, totalLikes: 0 };
  res.json({
    seller,
    stats: {
      approvedProducts: stats.approvedProducts,
      totalLikes: stats.totalLikes
    }
  });
});

router.get("/seller/:id", async (req: Request, res: Response) => {
 const products = await Product.find({ seller: req.params.id }).sort({ createdAt: -1 });
 res.json(products);
});

// Seller: create product with local image upload
router.post(
 "/",
 requireAuth,
 requireRole("seller", "admin"),
 upload.array("images",6),
 async (req: Request, res: Response) => {
 const files = (req.files as Express.Multer.File[]) || [];
 if (files.length ===0) return res.status(400).json({ message: "At least one image is required" });
 const uploads = files.map((f) => ({
 url: `/uploads/${f.filename}`,
 publicId: f.filename
 }));

 const {
 title,
 description,
 price,
 category,
 tags,
 contactEmail,
 contactPhone
 } = req.body as Record<string, string>;

 // fetch seller location to cache on product
 const seller = await User.findById(req.user!.id);
 const product = await Product.create({
 title,
 description,
 price: Number(price),
 category,
 tags: typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()) : tags,
 images: uploads,
 seller: req.user!.id,
 contact: { email: contactEmail, phone: contactPhone },
 approved: req.user!.role === "admin",
 location: seller?.location
 });
 res.status(201).json(product);
 }
);

// Seller: update own product
router.put(
  "/:id",
  requireAuth,
  requireRole("seller", "admin"),
  upload.array("newImages", 6),
  async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Not found" });
    if (req.user!.role !== "admin" && String(product.seller) !== req.user!.id)
      return res.status(403).json({ message: "Forbidden" });

    const files = (req.files as Express.Multer.File[]) || [];
    let newUploads: { url: string; publicId: string }[] = [];
    if (files.length) {
      newUploads = files.map((f) => ({
        url: `/uploads/${f.filename}`,
        publicId: f.filename
      }));
    }

    const {
      title,
      description,
      price,
      category,
      tags,
      removePublicIds
    } = req.body as Record<string, string | string[]>;
    if (removePublicIds) {
      const toRemove = Array.isArray(removePublicIds) ? removePublicIds : String(removePublicIds).split(",");
      for (const id of toRemove) {
        product.images = product.images.filter((img) => img.publicId !== id);
      }
    }

    product.title = (Array.isArray(title) ? title[0] : title) ?? product.title;
    product.description = (Array.isArray(description) ? description[0] : description) ?? product.description;
    product.price = price ? Number(Array.isArray(price) ? price[0] : price) : product.price;
    product.category = (Array.isArray(category) ? category[0] : category) ?? product.category;
    if (tags) product.tags = typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()) : tags;
    if (newUploads.length) product.images.push(...newUploads);
    const saved = await product.save();
    res.json(saved);
  }
);

// Seller/Admin: delete product
router.delete(
  "/:id",
  requireAuth,
  requireRole("seller", "admin"),
  async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Not found" });
    if (req.user!.role !== "admin" && String(product.seller) !== req.user!.id)
      return res.status(403).json({ message: "Forbidden" });
    for (const img of product.images) {
      const filePath = path.join(uploadDir, img.publicId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    await product.deleteOne();
    res.json({ message: "Deleted" });
  }
);

router.post(
  "/:id/like",
  requireAuth,
  async (req: Request, res: Response) => {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (!product.approved && req.user!.role !== "admin" && String(product.seller) !== req.user!.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!product.likedBy) {
      product.likedBy = [];
    }
    const userId = req.user!.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const existingIndex = product.likedBy.findIndex((id) => String(id) === userId);
    let liked: boolean;
    if (existingIndex > -1) {
      product.likedBy.splice(existingIndex, 1);
      liked = false;
    } else {
      product.likedBy.push(userObjectId);
      liked = true;
    }
    product.likes = product.likedBy.length;
    await product.save();
    res.json({ product, liked });
  }
);

export default router;