import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { requireAuth } from "../middleware/auth";
import { OAuth2Client } from 'google-auth-library';

const router = Router();

const signToken = (id: string, role: string) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "7d"
  });

router.post(
  "/register",
  [
    body("name").notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("role").optional().isIn(["buyer", "seller"]), // prevent self-creating admin
    body("phone").optional().isString(),
    body("location").optional().isString()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, email, password, role, phone, location } = req.body;
    // sellers must provide a location/district
    if (role === "seller" && (!location || String(location).trim() === "")) {
      return res.status(400).json({ message: "Seller registration requires a location/district" });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email already in use" });
    const user = await User.create({ name, email, password, role: role || "buyer", phone, location });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.status(201).json({ user });
  }
);

// Google OAuth: Accept an ID token from client, verify and create/find user
router.post('/google', async (req: Request, res: Response) => {
  const { idToken, role, location } = req.body as { idToken?: string; role?: string; location?: string };
  if (!idToken) return res.status(400).json({ message: 'idToken is required' });
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return res.status(400).json({ message: 'Invalid Google token payload' });
    const email = payload.email.toLowerCase();
    let user = await User.findOne({ email });
    // If user exists, just sign in
    if (!user) {
      // If role is seller, require location
      if (role === 'seller' && (!location || String(location).trim() === '')) {
        return res.status(400).json({ message: 'Seller registration requires a location/district' });
      }
      const randomPassword = Math.random().toString(36).slice(-10) + 'A1!';
      user = await User.create({
        name: payload.name || email.split('@')[0],
        email,
        password: randomPassword,
        role: role || 'buyer',
        phone: undefined,
        location: location || undefined
      });
    }
    if (!user.isActive) return res.status(403).json({ message: 'Account deactivated' });
    const token = signToken(user.id, user.role);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    return res.json({ user });
  } catch (err) {
    console.error('Google auth error', err);
    return res.status(400).json({ message: 'Failed to verify Google token' });
  }
});

// Simple endpoint to serve a lightweight HTML page to obtain ID token in browser
router.get('/google', (_req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).send('GOOGLE_CLIENT_ID not configured');
  const html = `<!doctype html>
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <div id="g_id_onload"
    data-client_id="${clientId}"
    data-login_uri="/api/auth/google-callback"
    data-auto_prompt="false">
  </div>
  <script>
    // Use token client to fetch ID token and POST to /api/auth/google
    function postToken(idToken){
      fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ idToken }) })
      .then(r=>r.json()).then(j=>{
        // inform user and close window
        localStorage.setItem('google_auth_result', JSON.stringify(j));
        document.body.innerText = 'Authentication complete. You can close this window.';
      }).catch(e=>{ document.body.innerText = 'Authentication failed'; console.error(e); });
    }
    window.onload = function(){
      /* eslint-disable */
      const client = google.accounts.id;
      google.accounts.id.initialize({ client_id: '${clientId}', callback: function(response){ postToken(response.credential); } });
      google.accounts.id.prompt();
    }
  </script>
  </body></html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

router.post(
  "/login",
  [body("email").isEmail(), body("password").isString()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ message: "Account deactivated" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user });
  }
);

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  return res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json({ user });
});

export default router;
