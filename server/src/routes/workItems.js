import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import WorkItem from '../models/WorkItem.js';
import Activity from '../models/Activity.js';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
const fields = z.object({
  title: z.string().trim().min(3).max(160), description: z.string().max(5000).optional(),
  type: z.enum(['Customer issue', 'Engineering', 'Payment', 'Incident', 'Compliance', 'Operations']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  status: z.enum(['Open', 'In Progress', 'Awaiting Approval', 'Blocked', 'Resolved']).optional(),
  team: z.string().trim().min(2).max(80).optional(), assignee: z.string().nullable().optional(), dueDate: z.string().nullable().optional()
});
const canSee = (user, item) => user.role === 'admin' || user.team === item.team;
const allowedTransitions = {
  'Open': ['In Progress', 'Blocked', 'Awaiting Approval'],
  'In Progress': ['Blocked', 'Awaiting Approval', 'Resolved', 'Open'],
  'Blocked': ['In Progress', 'Open'],
  'Awaiting Approval': ['Resolved', 'In Progress'],
  'Resolved': ['Open']
};
async function log(item, actor, action, details, requestId = null) { await Activity.create({ workItem: item._id, actor: actor._id, action, details, requestId }); }
router.get('/assignees', async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { team: req.user.team };
    const users = await User.find(filter).select('name email role team').sort({ name: 1 }).lean();
    res.json({ users });
  } catch (e) { next(e); }
});
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || '10', 10) || 10));
    const filter = {};
    if (req.user.role !== 'admin') filter.team = req.user.team;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.assignee === 'me') filter.assignee = req.user._id;
    if (req.query.q?.trim()) filter.$text = { $search: String(req.query.q).trim() };
    const [items, total] = await Promise.all([
      WorkItem.find(filter).populate('assignee', 'name email role').populate('createdBy', 'name email').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      WorkItem.countDocuments(filter)
    ]);
    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});
router.post('/', async (req, res, next) => {
  try {
    const input = fields.parse(req.body);
    if (input.assignee && !await User.exists({ _id: input.assignee, team: input.team || req.user.team })) return res.status(400).json({ error: 'Assignee must belong to the selected team.' });
    const item = await WorkItem.create({ ...input, team: req.user.role === 'admin' ? (input.team || req.user.team) : req.user.team, createdBy: req.user._id, assignee: input.assignee || null, dueDate: input.dueDate || null });
    await log(item, req.user, 'created', `Created ${item.title}`);
    await item.populate(['assignee', 'createdBy']);
    res.status(201).json({ item });
  } catch (e) { next(e); }
});
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid work item ID.' });
    const item = await WorkItem.findById(req.params.id).populate('assignee', 'name email role').populate('createdBy', 'name email');
    if (!item) return res.status(404).json({ error: 'Work item not found.' });
    if (!canSee(req.user, item)) return res.status(403).json({ error: 'You cannot access this team’s work.' });
    const activities = await Activity.find({ workItem: item._id }).populate('actor', 'name').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ item, activities });
  } catch (e) { next(e); }
});
router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid work item ID.' });
    const parsed = fields.partial().refine(v => Object.keys(v).length > 0, 'Provide at least one field').parse(req.body);
    const expectedVersion = Number(req.header('If-Match') ?? req.body.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(428).json({ error: 'Include the version you last read in the If-Match header.' });
    const current = await WorkItem.findById(req.params.id);
    if (!current) return res.status(404).json({ error: 'Work item not found.' });
    if (!canSee(req.user, current)) return res.status(403).json({ error: 'You cannot access this team’s work.' });
    if (req.user.role === 'member' && !['assignee', 'createdBy'].some(k => String(current[k]) === String(req.user._id))) return res.status(403).json({ error: 'Members can only update work they created or are assigned to.' });
    if (parsed.status && parsed.status !== current.status && !allowedTransitions[current.status]?.includes(parsed.status)) return res.status(409).json({ error: `Invalid workflow transition: ${current.status} → ${parsed.status}.` });
    if (parsed.status === 'Awaiting Approval' && req.user.role === 'member') return res.status(403).json({ error: 'Only a team lead or admin can send work for approval.' });
    if (parsed.status === 'Resolved' && current.status === 'Awaiting Approval' && !['lead', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Only a team lead or admin can resolve work awaiting approval.' });
    if (parsed.team && req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can move work between teams.' });
    if (parsed.assignee && !await User.exists({ _id: parsed.assignee, team: parsed.team || current.team })) return res.status(400).json({ error: 'Assignee must belong to the selected team.' });
    const update = { ...parsed, version: expectedVersion + 1 };
    if (parsed.dueDate !== undefined) update.dueDate = parsed.dueDate || null;
    // Atomic compare-and-swap: only one writer can update the version it read.
    const item = await WorkItem.findOneAndUpdate({ _id: current._id, version: expectedVersion }, { $set: update }, { new: true, runValidators: true }).populate('assignee', 'name email role').populate('createdBy', 'name email');
    if (!item) return res.status(409).json({ error: 'This item changed since you opened it. Refresh and review the latest version before updating.' });
    const changes = Object.keys(parsed).map(k => `${k}: ${String(current[k] ?? '—')} → ${String(parsed[k] ?? '—')}`).join('; ');
    if (Object.hasOwn(parsed, 'assignee')) await log(item, req.user, 'assignment_changed', `Assignee changed to ${item.assignee ? (await User.findById(item.assignee).select('name').lean())?.name || 'selected user' : 'Unassigned'}`);
    await log(item, req.user, 'updated', changes);
    res.json({ item });
  } catch (e) { next(e); }
});
router.post('/:id/comments', async (req, res, next) => {
  try {
    const body = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    const item = await WorkItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Work item not found.' });
    if (!canSee(req.user, item)) return res.status(403).json({ error: 'You cannot access this team’s work.' });
    item.comments.push({ author: req.user._id, body: body.body });
    item.version += 1;
    await item.save();
    await log(item, req.user, 'commented', body.body, req.header('Idempotency-Key') || randomUUID());
    res.status(201).json({ item });
  } catch (e) { next(e); }
});
router.post('/:id/approve', requireRole('lead', 'admin'), async (req, res, next) => {
  try {
    const item = await WorkItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Work item not found.' });
    if (!canSee(req.user, item)) return res.status(403).json({ error: 'You cannot access this team’s work.' });
    const expectedVersion = Number(req.header('If-Match') ?? req.body.version);
    if (!Number.isInteger(expectedVersion)) return res.status(428).json({ error: 'Include the version you last read in the If-Match header.' });
    if (item.status !== 'Awaiting Approval') return res.status(409).json({ error: 'Only items awaiting approval can be approved.' });
    const updated = await WorkItem.findOneAndUpdate({ _id: item._id, version: expectedVersion, status: 'Awaiting Approval' }, { $set: { status: 'Resolved', version: expectedVersion + 1 } }, { new: true });
    if (!updated) return res.status(409).json({ error: 'This item has changed. Refresh before approving.' });
    await log(updated, req.user, 'approved', 'Approved and resolved work item');
    res.json({ item: updated });
  } catch (e) { next(e); }
});
router.get('/:id/activities', async (req, res, next) => {
  try {
    const item = await WorkItem.findById(req.params.id).select('team');
    if (!item) return res.status(404).json({ error: 'Work item not found.' });
    if (!canSee(req.user, item)) return res.status(403).json({ error: 'You cannot access this team’s work.' });
    const activities = await Activity.find({ workItem: item._id }).populate('actor', 'name').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ activities });
  } catch (e) { next(e); }
});
export default router;
