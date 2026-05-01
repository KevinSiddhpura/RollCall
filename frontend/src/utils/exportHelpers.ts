import { format, parseISO } from 'date-fns';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { GroupDTO, FieldDefDTO, MemberDTO, AttendanceSessionDTO, AttendanceRecordDTO } from '../services/db/types';
import { getMemberDisplayName } from './memberHelpers';
import { pctColor } from './colorHelpers';
import { GroupService } from '../services/db/GroupService';
import { FieldService } from '../services/db/FieldService';
import { MemberService } from '../services/db/MemberService';
import { queryAll, getDbUserId } from '../services/db/database';

function statusLabel(s: string) {
  if (s === 'present') return 'P';
  if (s === 'absent')  return 'A';
  if (s === 'late')    return 'L';
  if (s === 'excused') return 'E';
  return '-';
}

function indexRecords(records: AttendanceRecordDTO[]): Map<string, AttendanceRecordDTO> {
  const index = new Map<string, AttendanceRecordDTO>();
  for (const r of records) {
    index.set(`${r.session_id}|${r.member_id}`, r);
  }
  return index;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface GroupExportData {
  group: GroupDTO;
  fields: FieldDefDTO[];
  uniqueField: FieldDefDTO | undefined;
  members: MemberDTO[];
  sessions: AttendanceSessionDTO[];
  records: AttendanceRecordDTO[];
}

export async function fetchGroupExportData(
  groupId: string,
  fromDate: string | null,
  toDate: string | null
): Promise<GroupExportData> {
  const group = await GroupService.getById(groupId);
  if (!group) throw new Error('Invalid Group ID');
  
  const fields = await FieldService.getByGroup(groupId);
  const uniqueField = fields.find(f => f.is_unique);
  const members = await MemberService.getByGroup(groupId);

  const userId = getDbUserId();
  let sql = 'SELECT * FROM sessions WHERE group_id = ? AND user_id = ?';
  const params: any[] = [groupId, userId];
  if (fromDate) { sql += ' AND date >= ?'; params.push(fromDate); }
  if (toDate) { sql += ' AND date <= ?'; params.push(toDate); }
  sql += ' ORDER BY date ASC';

  const sessions = await queryAll<AttendanceSessionDTO>(sql, params);

  const records: AttendanceRecordDTO[] = [];
  if (sessions.length > 0) {
    const placeholders = sessions.map(() => '?').join(',');
    const recs = await queryAll<AttendanceRecordDTO>(
      `SELECT * FROM records WHERE session_id IN (${placeholders}) AND user_id = ?`,
      [...sessions.map(s => s.id), userId]
    );
    records.push(...recs);
  }

  return { group, fields, uniqueField, members, sessions, records };
}

export function buildCSV(data: GroupExportData): string {
  const { fields, uniqueField, members, sessions, records } = data;
  const idCol = uniqueField?.name || 'ID';
  const displayFields = fields.filter(f => f.is_display);
  const displayLabel = displayFields.length > 0 ? displayFields.map(f => f.name).join(' / ') : 'Name';
  const headers = [idCol, displayLabel, ...sessions.map(s => s.date), 'Present', 'Total', '%'];

  const recIdx = indexRecords(records);

  const rows = members.map(m => {
    const uniqueVal = uniqueField ? (m.field_values[uniqueField.id] || '-') : '-';
    const displayName = getMemberDisplayName(fields, m);
    let present = 0;
    const cols = sessions.map(ses => {
      const rec = recIdx.get(`${ses.id}|${m.id}`);
      const lbl = rec ? statusLabel(rec.status) : '-';
      if (rec && (rec.status === 'present' || rec.status === 'late')) present++;
      const cell = rec?.reason ? `${lbl} (${rec.reason})` : lbl;
      return `"${cell}"`;
    });
    const pct = sessions.length > 0 ? Math.round((present / sessions.length) * 100) : 0;
    return [`"${uniqueVal}"`, `"${displayName}"`, ...cols, `"${present}"`, `"${sessions.length}"`, `"${pct}%"`].join(',');
  });

  return [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
}

export async function exportGroupCSV(data: GroupExportData, customName?: string): Promise<void> {
  if (!data.members.length || !data.sessions.length) {
    throw new Error('No data to export for this group in the selected date range.');
  }
  const csv = buildCSV(data);
  const base = customName?.trim() || data.group.name;
  const fileName = `${base} - Attendance - ${format(new Date(), 'yyyy-MM-dd')}.csv`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export CSV' });
  }
}

export async function exportGroupPDF(data: GroupExportData, customName?: string): Promise<void> {
  const html = buildPDFHtml([data]);
  const base = customName?.trim() || data.group.name;
  const fileName = `${base} - Attendance - ${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.moveAsync({ from: uri, to: fileUri });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF' });
  }
}

export async function exportMultiplePDF(dataList: GroupExportData[], customName?: string): Promise<void> {
  const validData = dataList.filter(d => d.members.length > 0 && d.sessions.length > 0);
  if (!validData.length) throw new Error('No data to export.');
  const html = buildPDFHtml(validData);
  const base = customName?.trim() || 'Multiple Groups';
  const fileName = `${base} - Attendance - ${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.moveAsync({ from: uri, to: fileUri });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF' });
  }
}

function buildPDFHtml(dataList: GroupExportData[]): string {
  const sections = dataList.map((data, idx) => buildPDFSection(data, idx)).join('');
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, system-ui, sans-serif; padding: 20px; color: #333; }
          .section { page-break-after: always; }
          .section:last-child { page-break-after: auto; }
          h1 { color: #2563eb; font-size: 24px; margin-bottom: 4px; }
          h2 { color: #64748b; font-size: 14px; font-weight: 500; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; }
          th { background: #f8fafc; text-align: left; font-size: 10px; font-weight: 700; color: #475569; padding: 8px 4px; border: 1px solid #e2e8f0; }
          td { padding: 6px 4px; border: 1px solid #e2e8f0; font-size: 10px; }
          .status { font-weight: 700; text-align: center; }
          .P { color: #10b981; }
          .A { color: #ef4444; }
          .L { color: #f59e0b; }
          .meta { font-size: 9px; color: #94a3b8; }
        </style>
      </head>
      <body>${sections}</body>
    </html>
  `;
}

function buildPDFSection(data: GroupExportData, _sectionIndex: number): string {
  const { group, fields, uniqueField, members, sessions, records } = data;
  const idCol = escapeHtml(uniqueField?.name || 'ID');
  const displayFields = fields.filter(f => f.is_display);
  const displayLabel = displayFields.length > 0 ? escapeHtml(displayFields.map(f => f.name).join(' / ')) : 'Name';

  const headers = `
    <tr>
      <th>${idCol}</th>
      <th>${displayLabel}</th>
      ${sessions.map(s => `<th>${format(parseISO(s.date), 'MM/dd')}</th>`).join('')}
      <th>%</th>
    </tr>
  `;

  const recIdx = indexRecords(records);

  const rows = members.map(m => {
    const uniqueVal = uniqueField ? escapeHtml(m.field_values[uniqueField.id] || '—') : '—';
    const displayName = escapeHtml(getMemberDisplayName(fields, m));
    let present = 0;
    const sessionCols = sessions.map(ses => {
      const rec = recIdx.get(`${ses.id}|${m.id}`);
      const lbl = rec ? statusLabel(rec.status) : '-';
      if (rec && (rec.status === 'present' || rec.status === 'late')) present++;
      return `<td class="status ${lbl}">${lbl}</td>`;
    }).join('');
    const pct = sessions.length > 0 ? Math.round((present / sessions.length) * 100) : 0;

    return `
      <tr>
        <td>${uniqueVal}</td>
        <td><b>${displayName}</b></td>
        ${sessionCols}
        <td style="font-weight:700; color:${pctColor(pct)}">${pct}%</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="section">
      <h1>${escapeHtml(group.name)}</h1>
      <h2>Attendance Report · ${format(new Date(), 'PPP')}</h2>
      <table>${headers}${rows}</table>
    </div>
  `;
}
