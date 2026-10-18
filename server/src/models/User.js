import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'lead', 'member'], default: 'member' },
  team: { type: String, default: 'Operations', trim: true }
}, { timestamps: true });
userSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.passwordHash; delete ret.__v; return ret; } });
export default mongoose.model('User', userSchema);
