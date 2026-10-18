import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import workItemRoutes from './routes/workItems.js';
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }), authRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'opsflow-api' }));
app.use('/api/work-items', workItemRoutes);
app.use((err, _req, res, _next) => {
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation failed.', details: err.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
  if (err?.code === 11000) return res.status(409).json({ error: 'A record with this value already exists.' });
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});
const port = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Copy server/.env.example to server/.env and set it.');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/opsflow');
  app.listen(port, () => console.log(`OpsFlow API listening on http://localhost:${port}`));
}
export default app;
