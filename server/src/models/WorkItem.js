import mongoose from 'mongoose';
const workItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 5000 },
  type: { type: String, enum: ['Customer issue', 'Engineering', 'Payment', 'Incident', 'Compliance', 'Operations'], default: 'Operations' },
  status: { type: String, enum: ['Open', 'In Progress', 'Awaiting Approval', 'Blocked', 'Resolved'], default: 'Open', index: true },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium', index: true },
  team: { type: String, default: 'Operations', index: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dueDate: { type: Date, default: null },
  version: { type: Number, default: 1 },
  comments: [{ author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, body: { type: String, required: true, maxlength: 2000 }, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });
workItemSchema.index({ team: 1, status: 1, priority: 1, updatedAt: -1 });
workItemSchema.index({ title: 'text', description: 'text' });
export default mongoose.model('WorkItem', workItemSchema);
