const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  session_id: { type: String, required: true, index: true },
  member_id: { type: String, required: true, index: true },
  status: { type: String, required: true },
  reason: { type: String, default: '' },
  user_id: { type: String, required: true, index: true },
});

AttendanceRecordSchema.index({ session_id: 1, member_id: 1 });

module.exports = mongoose.model('AttendanceRecord', AttendanceRecordSchema);
