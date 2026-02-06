"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const auth_1 = require("../middleware/auth");
const google_auth_library_1 = require("google-auth-library");
const router = (0, express_1.Router)();
const signToken = (id, role) => jsonwebtoken_1.default.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
});
router.post("/register", [
    (0, express_validator_1.body)("name").notEmpty(),
    (0, express_validator_1.body)("email").isEmail(),
    (0, express_validator_1.body)("password").isLength({ min: 6 }),
    (0, express_validator_1.body)("role").optional().isIn(["buyer", "seller"]), // prevent self-creating admin
    (0, express_validator_1.body)("phone").optional().isString(),
    (0, express_validator_1.body)("location").optional().isString()
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { name, email, password, role, phone, location } = req.body;
    // sellers must provide a location/district
    if (role === "seller" && (!location || String(location).trim() === "")) {
        return res.status(400).json({ message: "Seller registration requires a location/district" });
    }
    const exists = await User_1.default.findOne({ email });
    if (exists)
        return res.status(409).json({ message: "Email already in use" });
    const user = await User_1.default.create({ name, email, password, role: role || "buyer", phone, location });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.status(201).json({ user });
});
// Google OAuth: Accept an ID token from client, verify and create/find user
router.post('/google', async (req, res) => {
    const { idToken, role, location } = req.body;
    if (!idToken)
        return res.status(400).json({ message: 'idToken is required' });
    try {
        const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        if (!payload || !payload.email)
            return res.status(400).json({ message: 'Invalid Google token payload' });
        const email = payload.email.toLowerCase();
        let user = await User_1.default.findOne({ email });
        // If user exists, just sign in
        if (!user) {
            // If role is seller, require location
            if (role === 'seller' && (!location || String(location).trim() === '')) {
                return res.status(400).json({ message: 'Seller registration requires a location/district' });
            }
            const randomPassword = Math.random().toString(36).slice(-10) + 'A1!';
            user = await User_1.default.create({
                name: payload.name || email.split('@')[0],
                email,
                password: randomPassword,
                role: role || 'buyer',
                phone: undefined,
                location: location || undefined
            });
        }
        if (!user.isActive)
            return res.status(403).json({ message: 'Account deactivated' });
        const token = signToken(user.id, user.role);
        res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
        return res.json({ user });
    }
    catch (err) {
        console.error('Google auth error', err);
        return res.status(400).json({ message: 'Failed to verify Google token' });
    }
});
// Simple endpoint to serve a lightweight HTML page to obtain ID token in browser
router.get('/google', (_req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId)
        return res.status(500).send('GOOGLE_CLIENT_ID not configured');
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
router.post("/login", [(0, express_validator_1.body)("email").isEmail(), (0, express_validator_1.body)("password").isString()], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const user = await User_1.default.findOne({ email }).select("+password");
    if (!user)
        return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok)
        return res.status(401).json({ message: "Invalid credentials" });
    if (!user.isActive)
        return res.status(403).json({ message: "Account deactivated" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user });
});
router.post("/logout", (_req, res) => {
    res.clearCookie("token");
    return res.json({ message: "Logged out" });
});
router.get("/me", auth_1.requireAuth, async (req, res) => {
    const user = await User_1.default.findById(req.user.id);
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }
    res.json({ user });
});
exports.default = router;
