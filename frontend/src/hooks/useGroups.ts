import { useState, useEffect, useCallback } from 'react';
import { GroupService } from '../services/db/GroupService';
import { GroupDTO } from '../services/db/types';
import { subscribeToDB } from '../services/db/database';

export function useRootGroups() {
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const data = await GroupService.getAllRoot();
      setGroups(data);
    } catch (err) {
      console.error('useRootGroups fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    return subscribeToDB(fetch);
  }, [fetch]);

  return { groups, loading, refresh: fetch };
}

export function useSubGroups(parentId: string) {
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!parentId) return;
    try {
      const data = await GroupService.getChildren(parentId);
      setGroups(data);
    } catch (err) {
      console.error('useSubGroups fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [parentId]);

  useEffect(() => {
    fetch();
    return subscribeToDB(fetch);
  }, [fetch]);

  return { groups, loading, refresh: fetch };
}
