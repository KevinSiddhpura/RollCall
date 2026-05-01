const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  parent_id: { type: String, default: '', index: true },
  node_type: { type: String, enum: ['container', 'leaf'], required: true },
  created_at: { type: Date, default: Date.now },
  user_id: { type: String, required: true, index: true },
});

// Compound index for the most common query: find by user + parent
GroupSchema.index({ user_id: 1, parent_id: 1 });

module.exports = mongoose.model('Group', GroupSchema);
