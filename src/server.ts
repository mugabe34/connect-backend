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

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
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

async function start() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/connect";
  await mongoose.connect(mongoUri);
  await seedAdmin().catch((e) => console.error("Admin seed error", e));
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => console.log(`API running on :${port}`));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", err);
  process.exit(1);
});





