import User from "../models/User";

export async function seedAdmin() {
  const name = process.env.ADMIN_NAME as string;
  const email = process.env.ADMIN_EMAIL as string;
  const password = process.env.ADMIN_PASSWORD as string;
  if (!name || !email || !password) return;
  const exists = await User.findOne({ email });
  if (exists) return;
  await User.create({ name, email, password, role: "admin" });
}


