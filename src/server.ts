import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import adminRoutes from "./routes/admin";
import { seedAdmin } from "./utils/seedAdmin";
import User from "./models/User";
import Product from "./models/Product";

dotenv.config();

const app = express();

const clientUrl = process.env.CLIENT_URL;
if (!clientUrl) {
  console.warn("CLIENT_URL environment variable not set. CORS may not work as expected.");
}

// Using a specific origin is required when credentials: true
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "connect-backend" });
});

app.get("/api/stats", async (_req, res) => {
  const [totalUsers, totalProducts] = await Promise.all([
    User.countDocuments({}),
    Product.countDocuments({ approved: true }),
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
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected successfully.");
    await seedAdmin().catch((e) => console.error("Admin seed error", e));
    const port = Number(process.env.PORT) || 5000;
    app.listen(port, () => console.log(`API running on :${port}`));
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
}

start();
