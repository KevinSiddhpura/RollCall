import axios from 'axios';
import { BACKEND_URL } from '../config';
import { GroupService } from './db/GroupService';
import { MemberService } from './db/MemberService';
import { execute, queryAll, getDbUserId } from './db/database';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncProgress {
  phase: 'push' | 'pull' | 'complete' | 'error';
  message: string;
  groups?: number;
  members?: number;
  sessions?: number;
  records?: number;
  error?: string;
}

type ProgressCb = (p: SyncProgress) => void;

export async function pushToMongo(token: string, userId: string, onProgress?: ProgressCb): Promise<void> {
  onProgress?.({ phase: 'push', message: 'Collecting local data…' });

  const uid = getDbUserId();
  const [groups, fieldDefs, members, sessions] = await Promise.all([
    GroupService.getAll(), queryAll<any>('SELECT * FROM field_defs WHERE user_id = ?', [uid]),
    MemberService.getAll(), queryAll<any>('SELECT * FROM sessions WHERE user_id = ?', [uid]),
  ]);
  const records = await queryAll<any>('SELECT * FROM records WHERE user_id = ?', [uid]);

  const mapId = (arr: any[]) => arr.map(i => {
    const { id, ...rest } = i;
    return { _id: id, ...rest, user_id: userId };
  });

  onProgress?.({ phase: 'push', message: 'Uploading to server…', groups: groups.length, members: members.length, sessions: sessions.length, records: records.length });

  await axios.post(
    `${BACKEND_URL}/sync/push`,
    {
      groups: mapId(groups), fieldDefs: mapId(fieldDefs),
      members: members.map((m: any) => { const { id, ...rest } = m; return { _id: id, ...rest, user_id: userId }; }),
      sessions: mapId(sessions), records: mapId(records),
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
  );
}

export async function pullFromMongo(token: string, userId: string, onProgress?: ProgressCb): Promise<void> {
  onProgress?.({ phase: 'pull', message: 'Downloading from server…' });

  const response = await axios.get(`${BACKEND_URL}/sync/pull`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 30000,
  });

  const { groups = [], fieldDefs = [], members = [], sessions = [], records = [] } = response.data;

  const batchUpsert = async (table: string, columns: string[], rows: any[][]) => {
    if (!rows.length) return;
    const ph = `(${columns.map(() => '?').join(', ')})`;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await execute(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES ${batch.map(() => ph).join(', ')}`, batch.flat());
    }
  };

  onProgress?.({ phase: 'pull', message: 'Saving groups…', groups: groups.length });
  await batchUpsert('groups', ['id', 'name', 'parent_id', 'node_type', 'display_order', 'created_at', 'user_id'],
    groups.map((g: any) => [g._id, g.name, g.parent_id || '', g.node_type, g.display_order ?? 0, g.created_at || new Date().toISOString(), userId]));

  onProgress?.({ phase: 'pull', message: 'Saving members…', groups: groups.length, members: members.length });
  await batchUpsert('field_defs', ['id', 'group_id', 'name', 'is_unique', 'is_display', 'display_order', 'user_id'],
    fieldDefs.map((f: any) => [f._id, f.group_id, f.name, f.is_unique ? 1 : 0, f.is_display ? 1 : 0, f.display_order || 0, userId]));

  onProgress?.({ phase: 'pull', message: 'Saving sessions…', groups: groups.length, members: members.length, sessions: sessions.length });
  await batchUpsert('members', ['id', 'group_id', 'field_values', 'created_at', 'user_id'],
    members.map((m: any) => [m._id, m.group_id, typeof m.field_values === 'string' ? m.field_values : JSON.stringify(m.field_values), m.created_at || new Date().toISOString(), userId]));

  onProgress?.({ phase: 'pull', message: 'Saving records…', groups: groups.length, members: members.length, sessions: sessions.length, records: records.length });
  await batchUpsert('sessions', ['id', 'group_id', 'date', 'time', 'notes', 'created_at', 'user_id'],
    sessions.map((s: any) => [s._id, s.group_id, s.date, s.time, s.notes || '', s.created_at || new Date().toISOString(), userId]));

  await batchUpsert('records', ['id', 'session_id', 'member_id', 'status', 'reason', 'user_id'],
    records.map((r: any) => [r._id, r.session_id, r.member_id, r.status, r.reason || '', userId]));

  onProgress?.({ phase: 'pull', message: 'Sync complete', groups: groups.length, members: members.length, sessions: sessions.length, records: records.length });
}

export async function syncData(token: string, userId: string, onProgress?: ProgressCb): Promise<void> {
  await pushToMongo(token, userId, onProgress);
  await pullFromMongo(token, userId, onProgress);
}
