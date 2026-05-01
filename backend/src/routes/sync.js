const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const logger = require('../logger');
const Group = require('../models/Group');
const FieldDef = require('../models/FieldDef');
const Member = require('../models/Member');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');

const GROUP_FIELDS = ['_id', 'name', 'parent_id', 'node_type', 'created_at', 'display_order'];
const FIELD_DEF_FIELDS = ['_id', 'group_id', 'name', 'is_unique', 'is_display', 'display_order'];
const MEMBER_FIELDS = ['_id', 'group_id', 'field_values', 'created_at'];
const SESSION_FIELDS = ['_id', 'group_id', 'date', 'time', 'notes', 'created_at'];
const RECORD_FIELDS = ['_id', 'session_id', 'member_id', 'status', 'reason'];

function sanitize(doc, fields) {
  const clean = {};
  for (const f of fields) if (doc[f] !== undefined) clean[f] = doc[f];
  return clean;
}

function bulkUpsert(Model, docs, fields, userId) {
  if (!docs.length) return [];
  return docs.map(doc => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { ...sanitize(doc, fields), user_id: userId } },
      upsert: true,
    },
  }));
}

// POST /sync/push — batch upsert all client data
router.post('/push', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { groups = [], fieldDefs = [], members = [], sessions = [], records = [] } = req.body;

    const ops = [
      Group.bulkWrite(bulkUpsert(Group, groups, GROUP_FIELDS, userId), { ordered: false }),
      FieldDef.bulkWrite(bulkUpsert(FieldDef, fieldDefs, FIELD_DEF_FIELDS, userId), { ordered: false }),
      Member.bulkWrite(bulkUpsert(Member, members, MEMBER_FIELDS, userId), { ordered: false }),
      AttendanceSession.bulkWrite(bulkUpsert(AttendanceSession, sessions, SESSION_FIELDS, userId), { ordered: false }),
      AttendanceRecord.bulkWrite(bulkUpsert(AttendanceRecord, records, RECORD_FIELDS, userId), { ordered: false }),
    ];

    await Promise.all(ops);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Push failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sync/pull — return all user-owned objects with field projection
router.get('/pull', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const select = { __v: 0 };
    const [groups, fieldDefs, members, sessions, records] = await Promise.all([
      Group.find({ user_id: userId }, select).lean(),
      FieldDef.find({ user_id: userId }, select).lean(),
      Member.find({ user_id: userId }, select).lean(),
      AttendanceSession.find({ user_id: userId }, select).lean(),
      AttendanceRecord.find({ user_id: userId }, select).lean(),
    ]);

    const membersOut = members.map(m => ({
      ...m,
      field_values: m.field_values instanceof Map
        ? Object.fromEntries(m.field_values)
        : m.field_values ?? {},
    }));

    res.json({ groups, fieldDefs, members: membersOut, sessions, records });
  } catch (err) {
    logger.error('Pull failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE helpers
async function collectDescendantIds(rootId, userId) {
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const parentId = queue.shift();
    const children = await Group.find({ parent_id: parentId, user_id: userId }).select('_id').lean();
    for (const c of children) {
      const cid = c._id.toString();
      ids.push(cid);
      queue.push(cid);
    }
  }
  return ids;
}

router.delete('/groups/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const rootId = req.params.id;
    if (!rootId) return res.status(400).json({ error: 'Group ID required' });

    const root = await Group.findOne({ _id: rootId, user_id: userId }).select('_id').lean();
    if (!root) return res.status(404).json({ error: 'Group not found' });

    const allIds = await collectDescendantIds(rootId, userId);
    const sessions = await AttendanceSession.find({ group_id: { $in: allIds } }).select('_id').lean();
    const sessionIds = sessions.map(s => s._id.toString());

    await Promise.all([
      Group.deleteMany({ _id: { $in: allIds } }),
      FieldDef.deleteMany({ group_id: { $in: allIds } }),
      Member.deleteMany({ group_id: { $in: allIds } }),
      AttendanceSession.deleteMany({ _id: { $in: sessionIds } }),
      AttendanceRecord.deleteMany({ session_id: { $in: sessionIds } }),
    ]);

    res.json({ ok: true, deleted: allIds.length });
  } catch (err) {
    logger.error('Delete group failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/members/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Member ID required' });
    const member = await Member.findOne({ _id: id, user_id: req.userId }).select('_id').lean();
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await Promise.all([
      Member.deleteOne({ _id: id }),
      AttendanceRecord.deleteMany({ member_id: id }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete member failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Session ID required' });
    const session = await AttendanceSession.findOne({ _id: id, user_id: req.userId }).select('_id').lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    await Promise.all([
      AttendanceSession.deleteOne({ _id: id }),
      AttendanceRecord.deleteMany({ session_id: id }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete session failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/all-data', authMiddleware, async (req, res) => {
  try {
    const uid = req.userId;
    await Promise.all([
      Group.deleteMany({ user_id: uid }),
      FieldDef.deleteMany({ user_id: uid }),
      Member.deleteMany({ user_id: uid }),
      AttendanceSession.deleteMany({ user_id: uid }),
      AttendanceRecord.deleteMany({ user_id: uid }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete all-data failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
