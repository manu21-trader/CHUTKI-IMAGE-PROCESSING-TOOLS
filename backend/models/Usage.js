import mongoose from 'mongoose';

const usageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  periodKey: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}$/
  },
  usedCount: {
    type: Number,
    min: 0,
    default: 0
  }
}, {
  timestamps: true
});

usageSchema.index({ userId: 1, periodKey: 1 }, { unique: true });

const Usage = mongoose.model('Usage', usageSchema);

export default Usage;
