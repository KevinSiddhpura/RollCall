import { execute, queryAll, queryOne, getDbUserId } from './database';
import { GroupDTO } from './types';

export const GroupService = {
  async getAll(): Promise<GroupDTO[]> {
    return await queryAll<GroupDTO>('SELECT * FROM groups WHERE user_id = ? ORDER BY display_order ASC', [getDbUserId()]);
  },

  async getAllRoot(): Promise<GroupDTO[]> {
    const sql = `
      SELECT g.*, 
        (SELECT COUNT(*) FROM members m WHERE m.group_id = g.id) as memberCount,
        (SELECT COUNT(*) FROM groups child WHERE child.parent_id = g.id) as childCount,
        (SELECT COUNT(*) FROM sessions s WHERE s.group_id = g.id) as sessionCount
      FROM groups g 
      WHERE (g.parent_id = "" OR g.parent_id IS NULL) AND g.user_id = ?
      ORDER BY g.display_order ASC
    `;
    return await queryAll<GroupDTO>(sql, [getDbUserId()]);
  },

  async getChildren(parentId: string): Promise<GroupDTO[]> {
    const sql = `
      SELECT g.*, 
        (SELECT COUNT(*) FROM members m WHERE m.group_id = g.id) as memberCount,
        (SELECT COUNT(*) FROM groups child WHERE child.parent_id = g.id) as childCount,
        (SELECT COUNT(*) FROM sessions s WHERE s.group_id = g.id) as sessionCount
      FROM groups g 
      WHERE g.parent_id = ? AND g.user_id = ?
      ORDER BY g.display_order ASC
    `;
    return await queryAll<GroupDTO>(sql, [parentId, getDbUserId()]);
  },

  async getById(id: string): Promise<GroupDTO | null> {
    return await queryOne<GroupDTO>('SELECT * FROM groups WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
  },

  async create(group: Omit<GroupDTO, 'created_at' | 'user_id'>) {
    const createdAt = new Date().toISOString();
    const userId = getDbUserId();
    return await execute(
      'INSERT INTO groups (id, name, parent_id, node_type, created_at, user_id, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [group.id, group.name, group.parent_id, group.node_type, createdAt, userId, group.display_order]
    );
  },

  async updateOrder(id: string, order: number) {
    return await execute('UPDATE groups SET display_order = ? WHERE id = ? AND user_id = ?', [order, id, getDbUserId()]);
  },

  async delete(id: string) {
    // Cascading delete is handled by SQLite foreign keys!
    return await execute('DELETE FROM groups WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
  },

  async rename(id: string, newName: string) {
    return await execute('UPDATE groups SET name = ? WHERE id = ? AND user_id = ?', [newName, id, getDbUserId()]);
  },

  async getBreadcrumb(id: string): Promise<GroupDTO[]> {
    const trail: GroupDTO[] = [];
    let currentId: string | null = id;
    const seen = new Set<string>();

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const group = await this.getById(currentId);
      if (!group) break;
      trail.unshift(group);
      currentId = group.parent_id;
    }
    return trail;
  }
};
