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
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Public: list approved products with search/filter and location prioritization
router.get("/", async (req, res) => {
    const { q, category, tag, featured, location, limit } = req.query;
    const filter = { approved: true };
    if (q)
        filter.title = { $regex: q, $options: "i" };
    if (category)
        filter.category = category;
    if (tag)
        filter.tags = tag;
    if (featured)
        filter.featured = featured === "true";
    if (location)
        filter.location = location; // optional filter
    const lim = Number(limit) || 50;
    const products = await Product_1.default.find(filter).sort({ createdAt: -1 }).limit(lim).populate("seller", "name email phone location");
    res.json(products);
});
router.get("/seller/:id", async (req, res) => {
    const products = await Product_1.default.find({ seller: req.params.id }).sort({ createdAt: -1 });
    res.json(products);
});
// Seller: create product with Cloudinary upload
router.post("/", auth_1.requireAuth, (0, auth_1.requireRole)("seller", "admin"), upload.array("images", 6), async (req, res) => {
    const files = req.files || [];
    if (files.length === 0)
        return res.status(400).json({ message: "At least one image is required" });
    const uploads = await Promise.all(files.map((f) => {
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
    // fetch seller location to cache on product
    const seller = await User_1.default.findById(req.user.id);
    const product = await Product_1.default.create({
        title,
        description,
        price: Number(price),
        category,
        tags: typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : tags,
        images: uploads,
        seller: req.user.id,
        contact: { email: contactEmail, phone: contactPhone },
        approved: req.user.role === "admin",
        location: seller?.location
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
    product.title = (Array.isArray(title) ? title[0] : title) ?? product.title;
    product.description = (Array.isArray(description) ? description[0] : description) ?? product.description;
    product.price = price ? Number(Array.isArray(price) ? price[0] : price) : product.price;
    product.category = (Array.isArray(category) ? category[0] : category) ?? product.category;
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
