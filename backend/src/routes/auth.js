const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Group = require('../models/Group');
const FieldDef = require('../models/FieldDef');
const Member = require('../models/Member');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const authMiddleware = require('../middleware/auth');
const logger = require('../logger');

function makeToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

router.post('/register', async (req, res) => {
  try {
    const { password } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email format.' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });
    res.status(201).json({ token: makeToken(user), userId: user._id, email: user.email });
  } catch (err) {
    logger.error('Register failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    res.json({ token: makeToken(user), userId: user._id, email: user.email });
  } catch (err) {
    logger.error('Login failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /auth/change-password — requires valid JWT
router.patch('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ ok: true });
  } catch (err) {
    logger.error('Change password failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /auth/delete-account — wipes account + all sync data
router.delete('/delete-account', authMiddleware, async (req, res) => {
  try {
    const uid = req.userId;
    await Promise.all([
      Group.deleteMany({ user_id: uid }),
      FieldDef.deleteMany({ user_id: uid }),
      Member.deleteMany({ user_id: uid }),
      AttendanceSession.deleteMany({ user_id: uid }),
      AttendanceRecord.deleteMany({ user_id: uid }),
      User.findByIdAndDelete(uid),
    ]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Delete account failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
