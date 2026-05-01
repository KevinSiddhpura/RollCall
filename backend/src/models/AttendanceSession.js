const mongoose = require('mongoose');

const AttendanceSessionSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  group_id: { type: String, required: true, index: true },
  date: { type: String, required: true },
  time: { type: String, default: '' },
  notes: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  user_id: { type: String, required: true, index: true },
});

AttendanceSessionSchema.index({ user_id: 1, group_id: 1 });

module.exports = mongoose.model('AttendanceSession', AttendanceSessionSchema);
