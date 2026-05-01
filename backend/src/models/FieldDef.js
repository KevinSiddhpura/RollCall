const mongoose = require('mongoose');

const FieldDefSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  group_id: { type: String, required: true, index: true },
  name: { type: String, required: true },
  is_unique: { type: Boolean, default: false },
  is_display: { type: Boolean, default: false },
  display_order: { type: Number, default: 0 },
  user_id: { type: String, required: true, index: true },
});

FieldDefSchema.index({ user_id: 1, group_id: 1 });

module.exports = mongoose.model('FieldDef', FieldDefSchema);
