import { execute, queryAll, queryOne, getDbUserId } from './database';
import { MemberDTO } from './types';

export const MemberService = {
  async getByGroup(groupId: string): Promise<MemberDTO[]> {
    const rows = await queryAll<any>('SELECT * FROM members WHERE group_id = ? AND user_id = ?', [groupId, getDbUserId()]);
    return rows.map(row => ({
      ...row,
      field_values: JSON.parse(row.field_values)
    }));
  },

  async getAll(): Promise<MemberDTO[]> {
    const rows = await queryAll<any>('SELECT * FROM members WHERE user_id = ?', [getDbUserId()]);
    return rows.map(row => ({
      ...row,
      field_values: JSON.parse(row.field_values)
    }));
  },

  async getById(id: string): Promise<MemberDTO | null> {
    const row = await queryOne<any>('SELECT * FROM members WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
    if (!row) return null;
    return {
      ...row,
      field_values: JSON.parse(row.field_values)
    };
  },

  async create(member: Omit<MemberDTO, 'created_at' | 'user_id'>) {
    const userId = getDbUserId();
    return await execute(
      'INSERT INTO members (id, group_id, field_values, created_at, user_id) VALUES (?, ?, ?, ?, ?)',
      [member.id, member.group_id, JSON.stringify(member.field_values), new Date().toISOString(), userId]
    );
  },

  async getLowAttendanceMembers(threshold: number = 75, limit: number = 10): Promise<any[]> {
    const sql = `
      SELECT 
        m.id, m.group_id, g.name as groupName, m.field_values,
        COUNT(r.id) as totalRecords,
        SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) as presentCount,
        CAST(SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) AS FLOAT) / COUNT(r.id) * 100 as pct
      FROM members m
      JOIN groups g ON m.group_id = g.id
      JOIN records r ON r.member_id = m.id
      WHERE m.user_id = ?
      GROUP BY m.id
      HAVING totalRecords > 0 AND pct < ?
      ORDER BY pct ASC
      LIMIT ?
    `;
    const rows = await queryAll<any>(sql, [getDbUserId(), threshold, limit]);
    return rows.map(r => ({ ...r, field_values: JSON.parse(r.field_values) }));
  },

  async update(id: string, fieldValues: Record<string, string>) {
    return await execute(
      'UPDATE members SET field_values = ? WHERE id = ? AND user_id = ?',
      [JSON.stringify(fieldValues), id, getDbUserId()]
    );
  },

  async delete(id: string) {
    return await execute('DELETE FROM members WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
  }
};
