import { useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';
import { pushToMongo } from '../services/syncService';
import { BACKEND_URL } from '../config';
import type { SyncStatus } from '../services/syncService';

export type { SyncStatus };

export function useSyncTrigger() {
  const { token, user, syncStatus, setSyncStatus } = useAuth();

  const triggerSync = useCallback(async () => {
    if (!token || !user) return;
    setSyncStatus('syncing');
    try {
      await pushToMongo(token, user.userId);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
      throw new Error('Sync failed');
    }
  }, [token, user, setSyncStatus]);

  const deleteGroupRemote = useCallback(async (groupId: string) => {
    if (!token) return;
    await axios.delete(`${BACKEND_URL}/sync/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
  }, [token]);

  const deleteMemberRemote = useCallback(async (memberId: string) => {
    if (!token) return;
    await axios.delete(`${BACKEND_URL}/sync/members/${memberId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
  }, [token]);

  const deleteSessionRemote = useCallback(async (sessionId: string) => {
    if (!token) return;
    await axios.delete(`${BACKEND_URL}/sync/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
  }, [token]);

  return { triggerSync, syncStatus, deleteGroupRemote, deleteMemberRemote, deleteSessionRemote };
}
