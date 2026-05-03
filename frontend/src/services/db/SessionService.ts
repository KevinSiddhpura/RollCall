import { queryAll, queryOne, execute, getDbUserId } from './database';
import { AttendanceSessionDTO, AttendanceRecordDTO } from './types';

export const SessionService = {
  async getByGroup(groupId: string, from?: string, to?: string): Promise<any[]> {
    let sql = `
      SELECT s.*,
        SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) as presentCount,
        SUM(CASE WHEN r.status = 'absent' THEN 1 ELSE 0 END) as absentCount,
        SUM(CASE WHEN r.status = 'late' THEN 1 ELSE 0 END) as lateOnlyCount,
        COUNT(r.id) as totalCount
      FROM sessions s
      LEFT JOIN records r ON r.session_id = s.id
      WHERE s.group_id = ? AND s.user_id = ?
    `;
    const params: any[] = [groupId, getDbUserId()];

    if (from) {
      sql += ' AND s.date >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND s.date <= ?';
      params.push(to);
    }

    sql += `
      GROUP BY s.id
      ORDER BY s.date DESC, s.time DESC
    `;
    return await queryAll<any>(sql, params);
  },

  async getRecentWithDetails(limit: number = 5): Promise<any[]> {
    const sql = `
      SELECT s.*, g.name as groupName,
        SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) as presentCount,
        COUNT(r.id) as totalCount
      FROM sessions s
      JOIN groups g ON s.group_id = g.id
      LEFT JOIN records r ON r.session_id = s.id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.date DESC, s.time DESC
      LIMIT ?
    `;
    return await queryAll<any>(sql, [getDbUserId(), limit]);
  },

  async getOverallStats() {
    const sql = `
      SELECT 
        COUNT(DISTINCT session_id) as sessionCount,
        COUNT(*) as recordCount,
        SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) as presentCount
      FROM records
      WHERE user_id = ?
    `;
    return await queryOne<any>(sql, [getDbUserId()]);
  },

  async getById(id: string): Promise<AttendanceSessionDTO | null> {
    return await queryOne<AttendanceSessionDTO>('SELECT * FROM sessions WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
  },

  async delete(id: string) {
    return await execute('DELETE FROM sessions WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
  },

  async createWithRecords(session: Omit<AttendanceSessionDTO, 'created_at' | 'user_id'>, records: Omit<AttendanceRecordDTO, 'user_id'>[]) {
    const userId = getDbUserId();
    await execute(
      'INSERT INTO sessions (id, group_id, date, time, notes, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [session.id, session.group_id, session.date, session.time, session.notes, userId, new Date().toISOString()]
    );

    for (const r of records) {
      await execute(
        'INSERT INTO records (id, session_id, member_id, status, reason, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        [r.id, r.session_id, r.member_id, r.status, r.reason, userId]
      );
    }
  },

  async updateWithRecords(sessionId: string, sessionData: Partial<AttendanceSessionDTO>, records: Omit<AttendanceRecordDTO, 'user_id'>[]) {
    const userId = getDbUserId();
    if (sessionData.date) {
      await execute(
        'UPDATE sessions SET date = ?, notes = ? WHERE id = ?',
        [sessionData.date, sessionData.notes || '', sessionId]
      );
    }

    await execute('DELETE FROM records WHERE session_id = ?', [sessionId]);
    for (const r of records) {
      await execute(
        'INSERT INTO records (id, session_id, member_id, status, reason, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        [r.id, r.session_id, r.member_id, r.status, r.reason, userId]
      );
    }
  },

  async getRecordsBySession(sessionId: string): Promise<AttendanceRecordDTO[]> {
    return await queryAll<AttendanceRecordDTO>('SELECT * FROM records WHERE session_id = ? AND user_id = ?', [sessionId, getDbUserId()]);
  },

  async getRecordsByMember(memberId: string): Promise<any[]> {
    // Clean duplicate records for this member before fetching — keeps only the latest row per session
    await execute(
      `DELETE FROM records WHERE rowid NOT IN (
        SELECT MAX(rowid) FROM records
        WHERE member_id = ?
        GROUP BY session_id, member_id
      ) AND member_id = ?`,
      [memberId, memberId]
    );
    const sql = `
      SELECT r.*, s.date, s.time, s.notes as sessionNotes
      FROM records r
      JOIN sessions s ON r.session_id = s.id
      WHERE r.member_id = ? AND r.user_id = ?
      ORDER BY s.date DESC, s.time DESC
    `;
    return await queryAll<any>(sql, [memberId, getDbUserId()]);
  }
};
