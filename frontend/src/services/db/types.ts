export interface GroupDTO {
  id: string;
  name: string;
  parent_id: string;
  node_type: 'container' | 'leaf';
  created_at: string;
  user_id: string;
  display_order: number;
  memberCount?: number;
  childCount?: number;
  sessionCount?: number;
}

export interface FieldDefDTO {
  id: string;
  group_id: string;
  name: string;
  is_unique: boolean;
  is_display: boolean;
  display_order: number;
  user_id: string;
}

export interface MemberDTO {
  id: string;
  group_id: string;
  field_values: Record<string, string>;
  created_at: string;
  user_id: string;
}

export interface AttendanceSessionDTO {
  id: string;
  group_id: string;
  date: string;
  time: string;
  notes: string;
  created_at: string;
  user_id: string;
  // Computed fields
  presentCount?: number;
  absentCount?: number;
  lateOnlyCount?: number;
  totalCount?: number;
}

export interface AttendanceRecordDTO {
  id: string;
  session_id: string;
  member_id: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  reason: string;
  user_id: string;
  last_modified?: number;
}
