import { MemberDTO, FieldDefDTO } from '../services/db/types';

/** Get display name for a member based on leaf group's display fields. */
export function getMemberDisplayName(fields: FieldDefDTO[], member: MemberDTO): string {
  const displayFields = fields.filter(f => f.is_display).sort((a, b) => a.display_order - b.display_order);
  if (!displayFields.length) {
    const uniqueField = fields.find(f => f.is_unique);
    if (uniqueField) return member.field_values[uniqueField.id] ?? '—';
    return '—';
  }
  return displayFields
    .map(f => member.field_values[f.id] ?? '')
    .filter(Boolean)
    .join(' ');
}

/** Get unique field value for a member. */
export function getMemberUniqueValue(fields: FieldDefDTO[], member: MemberDTO): string {
  const uniqueField = fields.find(f => f.is_unique);
  if (!uniqueField) return '—';
  return member.field_values[uniqueField.id] ?? '—';
}
