import { useState, useEffect, useCallback } from 'react';
import { GroupService } from '../services/db/GroupService';
import { FieldService } from '../services/db/FieldService';
import { MemberService } from '../services/db/MemberService';
import { SessionService } from '../services/db/SessionService';
import { GroupDTO, FieldDefDTO, MemberDTO, AttendanceSessionDTO } from '../services/db/types';
import { subscribeToDB, queryAll, getDbUserId } from '../services/db/database';

export function useGroupDetail(id: string) {
  const [group, setGroup] = useState<GroupDTO | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<GroupDTO[]>([]);
  const [subGroups, setSubGroups] = useState<GroupDTO[]>([]);
  const [fields, setFields] = useState<FieldDefDTO[]>([]);
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [sessions, setSessions] = useState<AttendanceSessionDTO[]>([]);
  const [memberPcts, setMemberPcts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!id) return;
    try {
      const g = await GroupService.getById(id);
      if (!g) {
        setGroup(null);
        setLoading(false);
        return;
      }
      setGroup(g);

      const [bc, sg, f, m, s] = await Promise.all([
        GroupService.getBreadcrumb(id),
        GroupService.getChildren(id),
        FieldService.getByGroup(id),
        MemberService.getByGroup(id),
        SessionService.getByGroup(id),
      ]);

      setBreadcrumb(bc);
      setSubGroups(sg);
      setFields(f);
      setMembers(m);
      setSessions(s);

      // Compute per-member attendance percentages
      if (s.length > 0 && m.length > 0) {
        const placeholders = s.map(() => '?').join(',');
        const sidParams = s.map(ses => ses.id);
        const records = await queryAll<{ session_id: string; member_id: string; status: string }>(
          `SELECT session_id, member_id, status FROM records WHERE session_id IN (${placeholders}) AND user_id = ?`,
          [...sidParams, getDbUserId()]
        );
        // Index records by session_id|member_id for O(1) lookups
        const recordIndex = new Map<string, string>();
        for (const r of records) {
          recordIndex.set(`${r.session_id}|${r.member_id}`, r.status);
        }
        const pcts = new Map<string, number>();
        for (const member of m) {
          let present = 0;
          let total = 0;
          for (const ses of s) {
            const status = recordIndex.get(`${ses.id}|${member.id}`);
            if (status) {
              total++;
              if (status === 'present' || status === 'late') present++;
            }
          }
          pcts.set(member.id, total > 0 ? Math.round((present / total) * 100) : 0);
        }
        setMemberPcts(pcts);
      }
    } catch (err) {
      console.error('useGroupDetail fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
    return subscribeToDB(fetch);
  }, [fetch]);

  return { group, breadcrumb, subGroups, fields, members, sessions, memberPcts, loading, refresh: fetch };
}
