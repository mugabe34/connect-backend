"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAdmin = seedAdmin;
const User_1 = __importDefault(require("../models/User"));
async function seedAdmin() {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!name || !email || !password)
        return;
    const exists = await User_1.default.findOne({ email });
    if (exists)
        return;
    await User_1.default.create({ name, email, password, role: "admin" });
}
