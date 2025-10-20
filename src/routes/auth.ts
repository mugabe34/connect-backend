import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import User from "../models/User";

const router = Router();

const signToken = (id: string, role: string) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "7d"
  } as jwt.SignOptions);

router.post(
  "/register",
  [
    body("name").notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("role").optional().isIn(["buyer", "seller"]) // prevent self-creating admin
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, email, password, role } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email already in use" });
    const user = await User.create({ name, email, password, role: role || "buyer" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }
);

router.post(
  "/login",
  [body("email").isEmail(), body("password").isString()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ message: "Account deactivated" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }
);

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  return res.json({ message: "Logged out" });
});

export default router;


