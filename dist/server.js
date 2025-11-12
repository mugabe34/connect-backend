"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_1 = __importDefault(require("./routes/auth"));
const products_1 = __importDefault(require("./routes/products"));
const admin_1 = __importDefault(require("./routes/admin"));
const seedAdmin_1 = require("./utils/seedAdmin");
const User_1 = __importDefault(require("./models/User"));
const Product_1 = __importDefault(require("./models/Product"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const clientUrl = process.env.CLIENT_URL;
if (!clientUrl) {
    console.warn("CLIENT_URL environment variable not set. CORS may not work as expected.");
}
// Using a specific origin is required when credentials: true
app.use((0, cors_1.default)({ origin: clientUrl, credentials: true }));
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
app.use((0, morgan_1.default)("dev"));
app.use("/api/auth", auth_1.default);
app.use("/api/products", products_1.default);
app.use("/api/admin", admin_1.default);
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "connect-backend" });
});
app.get("/api/stats", async (_req, res) => {
    const [totalUsers, totalProducts] = await Promise.all([
        User_1.default.countDocuments({}),
        Product_1.default.countDocuments({ approved: true }),
    ]);
    res.json({ totalUsers, totalProducts });
});
app.get("/api/contact-info", (_req, res) => {
    res.json({
        email: "mugabeherve7@gmail.com",
        phone: "+250 781 908 314",
        location: "Kigali, Rwanda",
    });
});
async function start() {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("FATAL ERROR: JWT_SECRET is not defined.");
        }
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/connect";
        await mongoose_1.default.connect(mongoUri);
        console.log("MongoDB connected successfully.");
        await (0, seedAdmin_1.seedAdmin)().catch((e) => console.error("Admin seed error", e));
        const port = Number(process.env.PORT) || 5000;
        app.listen(port, () => console.log(`API running on :${port}`));
    }
    catch (err) {
        console.error("Failed to start server", err);
        process.exit(1);
    }
}
start();
