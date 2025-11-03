import { Router, Request, Response } from "express";
import multer from "multer";
import Product from "../models/Product";
import cloudinary from "../utils/cloudinary";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public: list approved products with search/filter
router.get("/", async (req: Request, res: Response) => {
  const { q, category, tag, featured } = req.query as Record<string, string | undefined>;
  const filter: any = { approved: true };
  if (q) filter.title = { $regex: q, $options: "i" };
  if (category) filter.category = category;
  if (tag) filter.tags = tag;
  if (featured) filter.featured = featured === 'true';
  const products = await Product.find(filter).sort({ createdAt: -1 }).limit(50).populate("seller", "name email");
  res.json(products);
});

router.get("/seller/:id", async (req: Request, res: Response) => {
  const products = await Product.find({ seller: req.params.id }).sort({ createdAt: -1 });
  res.json(products);
});

// Seller: create product with Cloudinary upload
router.post(
  "/",
  requireAuth,
  requireRole("seller", "admin"),
  upload.array("images", 6),
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ message: "At least one image is required" });
    const uploads = await Promise.all(
      files.map((f) => {
        return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({ folder: "connect/products" }, (err, result) => {
            if (err || !result) return reject(err);
            resolve({ url: result.secure_url, publicId: result.public_id });
          });
          stream.end(f.buffer);
        });
      })
    );

    const {
      title,
      description,
      price,
      category,
      tags,
      contactEmail,
      contactPhone
    } = req.body as Record<string, string>;
    const product = await Product.create({
      title,
      description,
      price: Number(price),
      category,
      tags: typeof tags === "string" ? tags.split(",").map((t: string) => t.trim()) : tags,
      images: uploads,
      seller: req.user!.id,
      contact: { email: contactEmail, phone: contactPhone },
      approved: req.user!.role === "admin" // auto-approve if admin creates
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
      newUploads = await Promise.all(
        files.map(
          (f) =>
            new Promise<{ url: string; publicId: string }>((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream({ folder: "connect/products" }, (err, result) => {
                if (err || !result) return reject(err);
                resolve({ url: result.secure_url, publicId: result.public_id });
              });
              stream.end(f.buffer);
            })
        )
      );
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
        await cloudinary.uploader.destroy(id);
      }
      product.images = product.images.filter((img) => !toRemove.includes(img.publicId));
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
      await cloudinary.uploader.destroy(img.publicId);
    }
    await product.deleteOne();
    res.json({ message: "Deleted" });
  }
);

export default router;