const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  group_id: { type: String, required: true, index: true },
  field_values: { type: Map, of: String, default: {} },
  created_at: { type: Date, default: Date.now },
  user_id: { type: String, required: true, index: true },
});

MemberSchema.index({ user_id: 1, group_id: 1 });

module.exports = mongoose.model('Member', MemberSchema);
