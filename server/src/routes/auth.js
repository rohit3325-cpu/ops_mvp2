import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email(), password: z.string().min(8).max(100), team: z.string().trim().min(2).max(80).optional() });
router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists.' });
    // Public registration always creates a member; role elevation is never client-controlled.
    const user = await User.create({ name: input.name, email, passwordHash: await bcrypt.hash(input.password, 12), team: input.team || 'Operations', role: 'member' });
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(201).json({ token, user });
  } catch (e) { next(e); }
});
router.post('/login', async (req, res, next) => {
  try {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const input = schema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
export default router;
