"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = __importDefault(require("../models/Product"));
const Notification_1 = __importDefault(require("../models/Notification"));
const auth_1 = require("../middleware/auth");
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
// Set up multer for local storage
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = (0, multer_1.default)({ storage });
// Public: list approved products with search/filter and location prioritization
router.get("/", async (req, res) => {
    const { q, category, tag, featured, location, limit, seller } = req.query;
    const filter = { approved: true };
    if (seller)
        filter.seller = seller;
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
    const products = await Product_1.default.find(filter)
        .sort({ createdAt: -1 })
        .limit(lim)
        .populate("seller", "name email phone location");
    res.json(products);
});
router.get("/seller/:id/summary", auth_1.requireAuth, async (req, res) => {
    const sellerId = req.params.id;
    if (!mongoose_1.default.Types.ObjectId.isValid(sellerId)) {
        return res.status(400).json({ message: "Invalid seller id" });
    }
    if (req.user.role !== "admin" && req.user.id !== sellerId) {
        return res.status(403).json({ message: "Forbidden" });
    }
    const seller = await User_1.default.findById(sellerId).select("name email role phone location createdAt");
    if (!seller)
        return res.status(404).json({ message: "Seller not found" });
    const sellerObjectId = new mongoose_1.default.Types.ObjectId(sellerId);
    const [topLiked, recentUploads, aggregates] = await Promise.all([
        Product_1.default.find({ seller: sellerObjectId }).sort({ likes: -1, createdAt: -1 }).limit(5),
        Product_1.default.find({ seller: sellerObjectId }).sort({ createdAt: -1 }).limit(5),
        Product_1.default.aggregate([
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
});
router.get("/seller/:id/profile", async (req, res) => {
    const sellerId = req.params.id;
    if (!mongoose_1.default.Types.ObjectId.isValid(sellerId)) {
        return res.status(400).json({ message: "Invalid seller id" });
    }
    const seller = await User_1.default.findById(sellerId).select("name email role phone location createdAt");
    if (!seller)
        return res.status(404).json({ message: "Seller not found" });
    const analytics = await Product_1.default.aggregate([
        { $match: { seller: new mongoose_1.default.Types.ObjectId(sellerId), approved: true } },
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
router.get("/seller/:id", async (req, res) => {
    const products = await Product_1.default.find({ seller: req.params.id }).sort({ createdAt: -1 });
    res.json(products);
});
// Seller: create product with local image upload
router.post("/", auth_1.requireAuth, (0, auth_1.requireRole)("seller", "admin"), upload.array("images", 6), async (req, res) => {
    const files = req.files || [];
    if (files.length === 0)
        return res.status(400).json({ message: "At least one image is required" });
    const hostBase = `${req.protocol}://${req.get("host")}`;
    const uploads = files.map((f) => ({
        url: `${hostBase}/uploads/${f.filename}`,
        publicId: f.filename
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
        // Auto-approve products on upload; no admin approval required.
        approved: true,
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
    const hostBase = `${req.protocol}://${req.get("host")}`;
    let newUploads = [];
    if (files.length) {
        newUploads = files.map((f) => ({
            url: `${hostBase}/uploads/${f.filename}`,
            publicId: f.filename
        }));
    }
    const { title, description, price, category, tags, removePublicIds } = req.body;
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
        const filePath = path_1.default.join(uploadDir, img.publicId);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
    await product.deleteOne();
    res.json({ message: "Deleted" });
});
router.post("/:id/like", auth_1.requireAuth, async (req, res) => {
    const product = await Product_1.default.findById(req.params.id);
    if (!product)
        return res.status(404).json({ message: "Product not found" });
    if (!product.approved && req.user.role !== "admin" && String(product.seller) !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
    }
    if (!product.likedBy) {
        product.likedBy = [];
    }
    const userId = req.user.id;
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const existingIndex = product.likedBy.findIndex((id) => String(id) === userId);
    let liked;
    if (existingIndex > -1) {
        product.likedBy.splice(existingIndex, 1);
        liked = false;
    }
    else {
        product.likedBy.push(userObjectId);
        liked = true;
        // Create notification for the seller when their product is liked
        try {
            await Notification_1.default.create({
                recipient: product.seller,
                sender: userObjectId,
                product: product._id,
                type: 'like',
                message: `Someone liked your product: ${product.title}`,
                read: false
            });
        }
        catch (err) {
            console.error('Error creating notification:', err);
        }
    }
    product.likes = product.likedBy.length;
    await product.save();
    res.json({ product, liked });
});
router.get("/liked/me", auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user id" });
    }
    const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
    const products = await Product_1.default.find({
        likedBy: userObjectId,
        approved: true
    })
        .sort({ createdAt: -1 })
        .populate("seller", "name email phone location");
    res.json(products);
});
exports.default = router;
