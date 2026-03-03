import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors, { CorsOptions } from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import adminRoutes from "./routes/admin";
import messageRoutes from "./routes/messages";
import uploadRoutes from "./routes/uploads";
import notificationRoutes from "./routes/notifications";
import { seedAdmin } from "./utils/seedAdmin";
import User from "./models/User";
import Product from "./models/Product";

dotenv.config();

const app = express();

// Enable secure cookies behind proxies (Render, Railway, Nginrok, etc.)
app.set("trust proxy", 1);

const configuredOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins);
allowedOrigins.add("https://connectrw.vercel.app");
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:5173");
}

if (!configuredOrigins.length) {
  console.warn(
    "CLIENT_URL/CLIENT_URLS not set. Using built-in CORS defaults only."
  );
}

const corsOptions: CorsOptions = {
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  origin: (origin, callback) => {
    // Allow non-browser clients/curl (no Origin header)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

// Serve static files from uploads folder
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/notifications", notificationRoutes);

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
    email: "mugabeherve7@gmail.com && hirwajules2000@gmail.comc",
    phone: "+250 781 908 314",
    location: "Kigali, Rwanda",
  });
});

// 404 handler for API routes
app.use((_req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
});

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
});

async function start() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("FATAL ERROR: JWT_SECRET is not defined.");
    }
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      const isProd = process.env.NODE_ENV === "production";
      if (isProd) {
        throw new Error(
          "FATAL ERROR: MONGO_URI/MONGODB_URI is not set. Configure it in your hosting provider."
        );
      }
      throw new Error(
        "FATAL ERROR: MONGO_URI/MONGODB_URI is not set. Add it to your .env for local dev."
      );
    }
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
