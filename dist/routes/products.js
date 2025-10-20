"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const Product_1 = __importDefault(require("../models/Product"));
const cloudinary_1 = __importDefault(require("../utils/cloudinary"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Public: list approved products with search/filter
router.get("/", async (req, res) => {
    const { q, category, tag } = req.query;
    const filter = { approved: true };
    if (q)
        filter.title = { $regex: q, $options: "i" };
    if (category)
        filter.category = category;
    if (tag)
        filter.tags = tag;
    const products = await Product_1.default.find(filter).sort({ createdAt: -1 }).limit(50).populate("seller", "name email");
    res.json(products);
});
// Seller: create product with Cloudinary upload
router.post("/", auth_1.requireAuth, (0, auth_1.requireRole)("seller", "admin"), upload.array("images", 6), async (req, res) => {
    const files = req.files || [];
    if (files.length === 0)
        return res.status(400).json({ message: "At least one image is required" });
    const uploads = await Promise.all(files.map(async (f) => {
        const uploaded = await cloudinary_1.default.uploader.upload_stream({ folder: "connect/products" }, () => { });
        return new Promise((resolve, reject) => {
            const stream = cloudinary_1.default.uploader.upload_stream({ folder: "connect/products" }, (err, result) => {
                if (err || !result)
                    return reject(err);
                resolve({ url: result.secure_url, publicId: result.public_id });
            });
            stream.end(f.buffer);
        });
    }));
    const { title, description, price, category, tags, contactEmail, contactPhone } = req.body;
    const product = await Product_1.default.create({
        title,
        description,
        price: Number(price),
        category,
        tags: typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : tags,
        images: uploads,
        seller: req.user.id,
        contact: { email: contactEmail, phone: contactPhone },
        approved: req.user.role === "admin" // auto-approve if admin creates
    });
    res.status(201).json(product);
});
// Seller: update own product
router.put("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("seller", "admin"), upload.array("newImages", 6), async (req, res) => {
    const product = await Product_1.default.findById(req.params.id);
    if (!product)
        return res.status(404).json({ message: "Not found" });
    if (req.user.role !== "admin" && String(product.seller) !== req.user.id)
        return res.status(403).json({ message: "Forbidden" });
    const files = req.files || [];
    let newUploads = [];
    if (files.length) {
        newUploads = await Promise.all(files.map((f) => new Promise((resolve, reject) => {
            const stream = cloudinary_1.default.uploader.upload_stream({ folder: "connect/products" }, (err, result) => {
                if (err || !result)
                    return reject(err);
                resolve({ url: result.secure_url, publicId: result.public_id });
            });
            stream.end(f.buffer);
        })));
    }
    const { title, description, price, category, tags, removePublicIds } = req.body;
    if (removePublicIds) {
        const toRemove = Array.isArray(removePublicIds) ? removePublicIds : String(removePublicIds).split(",");
        for (const id of toRemove) {
            await cloudinary_1.default.uploader.destroy(id);
        }
        product.images = product.images.filter((img) => !toRemove.includes(img.publicId));
    }
    product.title = title ?? product.title;
    product.description = description ?? product.description;
    product.price = price ? Number(price) : product.price;
    product.category = category ?? product.category;
    if (tags)
        product.tags = typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : tags;
    if (newUploads.length)
        product.images.push(...newUploads);
    const saved = await product.save();
    res.json(saved);
});
// Seller/Admin: delete product
router.delete("/:id", auth_1.requireAuth, (0, auth_1.requireRole)("seller", "admin"), async (req, res) => {
    const product = await Product_1.default.findById(req.params.id);
    if (!product)
        return res.status(404).json({ message: "Not found" });
    if (req.user.role !== "admin" && String(product.seller) !== req.user.id)
        return res.status(403).json({ message: "Forbidden" });
    for (const img of product.images) {
        await cloudinary_1.default.uploader.destroy(img.publicId);
    }
    await product.deleteOne();
    res.json({ message: "Deleted" });
});
exports.default = router;
