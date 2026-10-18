import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User no longer exists.' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token.' }); }
}
export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to perform this action.' });
}
