import type { SQLiteDatabase } from 'expo-sqlite';

export async function seedDummyData(db: SQLiteDatabase) {
  try {
    const classCountResult = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM classes");
    if (classCountResult && classCountResult.count > 0) return;

    await db.withTransactionAsync(async () => {
      // 1. Create Classes
      const classesData = [
        { name: 'Computer Science 101', division: 'A', subject: 'Intro to Programming' },
        { name: 'Mathematics 202', division: 'B', subject: 'Calculus II' },
        { name: 'Physics 105', division: 'C', subject: 'Mechanics' }
      ];

      const classIds: number[] = [];
      for (const c of classesData) {
        const result = await db.runAsync(
          'INSERT INTO classes (name, division, subject) VALUES (?, ?, ?)',
          [c.name, c.division, c.subject]
        );
        classIds.push(result.lastInsertRowId);
      }

      // 2. Create Students for each class
      const studentsData = [
        [
          { first_name: 'Alice', last_name: 'Smith', roll_no: 'CS001', index_no: '1' },
          { first_name: 'Bob', last_name: 'Johnson', roll_no: 'CS002', index_no: '2' },
          { first_name: 'Charlie', last_name: 'Brown', roll_no: 'CS003', index_no: '3' },
          { first_name: 'Diana', last_name: 'Prince', roll_no: 'CS004', index_no: '4' },
          { first_name: 'Evan', last_name: 'Wright', roll_no: 'CS005', index_no: '5' },
        ],
        [
          { first_name: 'Fiona', last_name: 'Gallagher', roll_no: 'MATH001', index_no: '1' },
          { first_name: 'George', last_name: 'Miller', roll_no: 'MATH002', index_no: '2' },
          { first_name: 'Hannah', last_name: 'Abbott', roll_no: 'MATH003', index_no: '3' },
          { first_name: 'Ian', last_name: 'Malcolm', roll_no: 'MATH004', index_no: '4' },
        ],
        [
          { first_name: 'Jack', last_name: 'Sparrow', roll_no: 'PHY001', index_no: '1' },
          { first_name: 'Karen', last_name: 'Page', roll_no: 'PHY002', index_no: '2' },
          { first_name: 'Leo', last_name: 'Fitz', roll_no: 'PHY003', index_no: '3' },
          { first_name: 'Mia', last_name: 'Thermopolis', roll_no: 'PHY004', index_no: '4' },
          { first_name: 'Noah', last_name: 'Bennett', roll_no: 'PHY005', index_no: '5' },
          { first_name: 'Olivia', last_name: 'Benson', roll_no: 'PHY006', index_no: '6' },
        ]
      ];

      const classStudents: { [classId: number]: number[] } = {};

      for (let i = 0; i < classIds.length; i++) {
        const classId = classIds[i];
        classStudents[classId] = [];

        for (const s of studentsData[i]) {
          const result = await db.runAsync(
            'INSERT INTO students (class_id, first_name, last_name, roll_no, index_no) VALUES (?, ?, ?, ?, ?)',
            [classId, s.first_name, s.last_name, s.roll_no, s.index_no]
          );
          classStudents[classId].push(result.lastInsertRowId);
        }
      }

      // 3. Create Attendance Sessions and Records for multiple dates
      const dates = ['2026-04-15', '2026-04-17', '2026-04-19'];
      const statuses = ['present', 'present', 'present', 'absent', 'late'];

      for (let i = 0; i < classIds.length; i++) {
        const classId = classIds[i];
        const studentIds = classStudents[classId];

        for (const date of dates) {
          const sessionResult = await db.runAsync(
            'INSERT INTO attendance_sessions (class_id, date, time) VALUES (?, ?, ?)',
            [classId, date, '10:00 AM']
          );
          const sessionId = sessionResult.lastInsertRowId;

          // Add records for each student in the class
          for (const studentId of studentIds) {
            // Simple random deterministic-like status
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            await db.runAsync(
              'INSERT INTO attendance_records (session_id, student_id, status) VALUES (?, ?, ?)',
              [sessionId, studentId, randomStatus]
            );
          }
        }
      }
    });

  } catch {
    // seed failure is non-fatal
  }
}
