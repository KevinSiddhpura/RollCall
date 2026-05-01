import { queryAll, queryOne, execute, getDbUserId } from './database';
import { FieldDefDTO } from './types';

export const FieldService = {
  async getByGroup(groupId: string): Promise<FieldDefDTO[]> {
    return await queryAll<FieldDefDTO>('SELECT * FROM field_defs WHERE group_id = ? AND user_id = ? ORDER BY display_order', [groupId, getDbUserId()]);
  },

  async getById(id: string): Promise<FieldDefDTO | null> {
    return await queryOne<FieldDefDTO>('SELECT * FROM field_defs WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
  },

  async create(field: Omit<FieldDefDTO, 'user_id'>) {
    const userId = getDbUserId();
    return await execute(
      'INSERT INTO field_defs (id, group_id, name, is_unique, is_display, display_order, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [field.id, field.group_id, field.name, field.is_unique ? 1 : 0, field.is_display ? 1 : 0, field.display_order, userId]
    );
  },

  async delete(id: string) {
    return await execute('DELETE FROM field_defs WHERE id = ? AND user_id = ?', [id, getDbUserId()]);
  },

  async setUnique(groupId: string, fieldId: string) {
    const userId = getDbUserId();
    await execute('UPDATE field_defs SET is_unique = 0 WHERE group_id = ? AND user_id = ?', [groupId, userId]);
    return await execute('UPDATE field_defs SET is_unique = 1 WHERE id = ? AND user_id = ?', [fieldId, userId]);
  },

  async toggleDisplay(id: string, isDisplay: boolean) {
    return await execute('UPDATE field_defs SET is_display = ? WHERE id = ? AND user_id = ?', [isDisplay ? 1 : 0, id, getDbUserId()]);
  },

  async updateOrder(id: string, order: number) {
    return await execute('UPDATE field_defs SET display_order = ? WHERE id = ? AND user_id = ?', [order, id, getDbUserId()]);
  },

  async rename(id: string, name: string) {
    return await execute('UPDATE field_defs SET name = ? WHERE id = ? AND user_id = ?', [name, id, getDbUserId()]);
  }
};
