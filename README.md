# RollCall

A local-first mobile attendance management app for classrooms, built with Expo and React Native. All data lives on-device in SQLite - no backend, no account required.

> **Project Disclaimer:**
> This repository is a part of a **College PBL (Project-Based Learning) Activity**. As per the assignment requirements, this entire mobile application was **built completely with AI**, leveraging intelligent coding assistants for its architecture, UI/UX design, and implementation.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Screens & Navigation](#screens--navigation)
- [Database Schema](#database-schema)
- [Theme System](#theme-system)
- [Data Import & Export](#data-import--export)
- [UI Patterns](#ui-patterns)
- [Platform Notes](#platform-notes)

---

## Overview

RollCall is a single-tier Expo application — there is no server, no cloud sync, and no login. Everything is stored in an on-device SQLite database (`attendance.db`). It is designed for teachers who want a fast, offline-first way to manage classes, track student attendance, and export reports.

---

## Features

- **Class management** — create classes with name, division, and subject; edit or delete at any time
- **Student roster** — add students individually or bulk-import from a CSV file; edit or remove students
- **Attendance sessions** — take attendance for any date with Present / Absent / Late / Excused statuses; add per-student reason notes
- **Dashboard** — at-a-glance stats (total classes, students, sessions, average attendance %) and a list of recent sessions
- **Reports** — per-class attendance summaries filtered by date range (All Time, This Month, Last Month, Custom)
- **CSV export** — student rosters and attendance reports as `.csv` files
- **PDF export** — formatted printable reports with color-coded status columns
- **CSV import** — bulk-load a student roster from any spreadsheet with flexible column name detection
- **Multi-select** — long-press anywhere to enter multi-select mode for bulk delete or bulk export
- **Fully offline** — no network permission required; all data is private and local

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo v54, React Native v0.81.5 (New Architecture) |
| Routing | Expo Router v6 (file-based, typed routes) |
| Database | `expo-sqlite` v16 — on-device SQLite with WAL mode |
| State | React hooks (`useState`, `useFocusEffect`); Zustand v5 installed for future use |
| Lists | `@shopify/flash-list` v2 — virtualized high-performance lists |
| Icons | `@expo/vector-icons` + `lucide-react-native` |
| Animations | `react-native-reanimated` v4 |
| Gestures | `react-native-gesture-handler` v2 |
| CSV | `papaparse` v5 — parse and serialize CSV |
| PDF | `expo-print` + `expo-sharing` — HTML-to-PDF generation and file sharing |
| File I/O | `expo-file-system`, `expo-document-picker` |
| Date | `date-fns` v4 + `@react-native-community/datetimepicker` |
| Haptics | `expo-haptics` |
| Language | TypeScript ~5.9.3, target ES2023 |

---

## Getting Started

All commands run from the `frontend/` directory.

```bash
# Install dependencies
yarn install

# Start the Expo dev server (choose platform interactively)
yarn start

# Android (requires device or emulator)
yarn android

# iOS (requires macOS + Xcode)
yarn ios

# Web preview (SQLite is disabled on web — UI only)
yarn web

# Lint
yarn lint
```

On first launch the app runs database migrations and seeds three sample classes with students and attendance sessions so you can explore the UI immediately.

---

## Project Structure

```
RollCall/
└── frontend/
    ├── app/                        # Expo Router file-based routes
    │   ├── _layout.tsx             # Root layout: SQLiteProvider, Stack navigator
    │   ├── (tabs)/
    │   │   ├── _layout.tsx         # Bottom tab navigator
    │   │   ├── index.tsx           # Dashboard
    │   │   ├── classes.tsx         # Class list
    │   │   └── reports.tsx         # Reports & export
    │   ├── class/
    │   │   ├── new.tsx             # Create class
    │   │   ├── [id].tsx            # Class details (roster + sessions tabs)
    │   │   ├── [id]/
    │   │   │   ├── add-student.tsx # Add / edit student form
    │   │   │   └── take-attendance.tsx  # Record attendance session
    │   └── student/
    │       └── [id].tsx            # Student profile & attendance history
    ├── src/
    │   ├── db/
    │   │   ├── schema.ts           # Table definitions + migrateDbIfNeeded()
    │   │   ├── seed.ts             # Dummy data seeded on first run
    │   │   ├── sqlite.native.tsx   # Native SQLite export
    │   │   └── sqlite.web.tsx      # Web stub (shows warning banner)
    │   └── theme.ts                # All design tokens (colors, spacing, shadows)
    ├── assets/
    │   └── images/
    │       └── RollCall.png        # App icon + splash
    ├── app.json                    # Expo config
    ├── package.json
    └── tsconfig.json
```

---

## Screens & Navigation

### Bottom Tabs

| Tab | File | Description |
|---|---|---|
| Dashboard | `(tabs)/index.tsx` | Greeting, 4 stat cards, quick-action buttons, recent sessions list |
| Classes | `(tabs)/classes.tsx` | Searchable class cards with attendance %, subject filter chips, bulk delete |
| Reports | `(tabs)/reports.tsx` | Date-filtered attendance summaries with per-class CSV/PDF export |

### Stack Screens

| Route | File | Description |
|---|---|---|
| `/class/new` | `class/new.tsx` | Form: class name, division, subject |
| `/class/[id]` | `class/[id].tsx` | Tabbed view: Roster (students) + Sessions; edit, CSV import/export |
| `/class/[id]/add-student` | `class/[id]/add-student.tsx` | Add or edit a student: first/middle/last name, roll no, enrollment no, index no |
| `/class/[id]/take-attendance` | `class/[id]/take-attendance.tsx` | Date picker, quick mark all, per-student P/A/L toggles, reason field, live stats strip |
| `/student/[id]` | `student/[id].tsx` | Student avatar with initials, attendance stats, full session history log |

---

## Database Schema

The database file is `attendance.db` stored in the app's document directory. Foreign keys are enabled and WAL journal mode is active.

### `classes`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `name` | TEXT NOT NULL | e.g. "10th Grade" |
| `division` | TEXT NOT NULL | e.g. "A", "Science" |
| `subject` | TEXT | Optional subject label |
| `created_at` | DATETIME | Default: `CURRENT_TIMESTAMP` |

### `students`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | |
| `class_id` | INTEGER NOT NULL | FK → `classes(id)` ON DELETE CASCADE |
| `index_no` | TEXT | Sequential index within class |
| `roll_no` | TEXT | Default `'-'` |
| `enrollment_no` | TEXT | Default `'-'` |
| `first_name` | TEXT NOT NULL | |
| `middle_name` | TEXT | Default `''` |
| `last_name` | TEXT NOT NULL | |
| `notes` | TEXT | Default `''`; added in migration v3 |
| `created_at` | DATETIME | Default: `CURRENT_TIMESTAMP` |

### `attendance_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | |
| `class_id` | INTEGER NOT NULL | FK → `classes(id)` ON DELETE CASCADE |
| `date` | TEXT NOT NULL | ISO format `YYYY-MM-DD` |
| `time` | TEXT NOT NULL | Display string e.g. `"10:00 AM"` |
| `created_at` | DATETIME | Default: `CURRENT_TIMESTAMP` |

### `attendance_records`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | |
| `session_id` | INTEGER NOT NULL | FK → `attendance_sessions(id)` ON DELETE CASCADE |
| `student_id` | INTEGER NOT NULL | FK → `students(id)` ON DELETE CASCADE |
| `status` | TEXT NOT NULL | `'present'` \| `'absent'` \| `'late'` \| `'excused'` |
| `reason` | TEXT | Default `''`; e.g. "Medical leave" |
| `created_at` | DATETIME | Default: `CURRENT_TIMESTAMP` |
| UNIQUE | `(session_id, student_id)` | One record per student per session |

### Migrations

Migrations run automatically at startup in `migrateDbIfNeeded()` via `PRAGMA user_version`:

| Version | Change |
|---|---|
| v1 | Initial schema — all four tables |
| v2 | Placeholder (no-op) |
| v3 | Added `notes` column to `students` |

---

## Theme System

All design tokens are in `frontend/src/theme.ts`. **Never hardcode colors, spacing, or shadows** — always import from `theme`.

### Colors

```
Primary
  primary:      #2563EB   buttons, active states, FABs
  primaryDark:  #1D4ED8   pressed states
  primaryDeep:  #1E3A8A   hero / header backgrounds
  primaryLight: #DBEAFE   tinted backgrounds
  primarySurface: #EFF6FF  subtle tinted cards

Backgrounds & Surfaces
  background:   #F1F5F9   page background
  surface:      #FFFFFF   cards, list items
  surfaceAlt:   #F8FAFC   alternate surface

Text
  text:         #0F172A   primary body
  textSecondary:#475569   secondary / captions
  textMuted:    #94A3B8   placeholders, disabled
  textInverse:  #FFFFFF   on dark backgrounds
  textPlaceholder: #CBD5E1

Borders
  border:       #E2E8F0
  borderLight:  #F1F5F9

Semantic
  danger:       #EF4444 / dark #DC2626 / bg #FEE2E2
  success:      #22C55E / dark #16A34A / bg #DCFCE7
  warning:      #F59E0B / dark #D97706 / bg #FEF3C7

Attendance Status
  present:      #16A34A / light #DCFCE7 / bg #F0FDF4
  absent:       #DC2626 / light #FEE2E2 / bg #FFF5F5
  late:         #D97706 / light #FEF3C7 / bg #FFFBEB
  excused:      #7C3AED / light #EDE9FE / bg #F5F3FF
```

### Spacing

```
xs: 4   sm: 8   md: 16   lg: 24   xl: 32   xxl: 48
```

### Border Radius

```
xs: 6   sm: 8   md: 12   lg: 16   xl: 20   xxl: 28   full: 9999
```

### Shadows

`xs`, `sm`, `md`, `lg` (elevation 1–8) and `primary` (blue-tinted drop shadow for primary CTAs).

---

## Data Import & Export

### CSV Import

Bulk-load students from any spreadsheet. The parser is flexible and accepts multiple column name conventions:

| Field | Accepted column names |
|---|---|
| First name | `first_name`, `firstName`, `FirstName`, `first` |
| Middle name | `middle_name`, `middleName`, `MiddleName` |
| Last name | `last_name`, `lastName`, `LastName`, `last` |
| Roll no | `roll_no`, `rollNo`, `RollNo`, `roll` |
| Enrollment no | `enrollment_no`, `enrollmentNo` |
| Index no | `index_no`, `indexNo` — auto-incremented if missing |
| Notes | `notes`, `reason` |

Duplicate detection runs against `roll_no` and `enrollment_no` before inserting.

### CSV Export

Two export types:

- **Student roster** — columns: First Name, Middle Name, Last Name, Roll No, Enrollment No, Index No, Notes
- **Attendance report** — columns: Class, Division, Roll No, Name, Present count, Total sessions, Attendance %

### PDF Export

Reports are rendered as styled HTML and printed via `expo-print`:

- **Student roster PDF** — table with name, roll no, enrollment no, attendance %, notes
- **Attendance report PDF** — class header (name, division, subject), then a table with session dates as columns and color-coded status cells (P / A / L / E)

Status colors in PDFs match the theme: Present `#16A34A`, Absent `#DC2626`, Late `#D97706`, Excused `#7C3AED`.

Files are written to the device cache and shared via the native share sheet using `expo-sharing`.

---

## UI Patterns

### Screen Layout

Every screen follows the same three-zone structure:

1. **Hero header** — `primaryDeep` background, white title + subtitle, back button on stack screens
2. **White content area** — cards with `shadows.sm` and `borderRadius.lg`
3. **Bottom action bar** — primary CTA + secondary actions above the safe area inset

### Multi-select

Long-press any list item to enter multi-select mode. While selecting:

- Checkboxes replace trailing icons
- A sticky bulk-action bar appears at the bottom with a Select All toggle and context actions (Delete, Export, etc.)
- Tapping **Cancel** clears the selection and exits multi-select mode

### Other Recurring Patterns

| Pattern | Usage |
|---|---|
| Stat cards / strips | 2–4 column grids with colored icon backgrounds (Dashboard, Take Attendance) |
| Tab switcher | Segmented control tabs (Class Details: Roster / Sessions) |
| Modal sheets | Bottom-anchored modals with a drag handle for forms and pickers |
| Search + filter chips | Search bar with clear button, horizontal scrollable filter chips below |
| Progress bars | Thin colored bars representing attendance % on class cards |
| Status badges | Small colored pills with single-letter codes (P / A / L / E) |
| Accent bars | Left border on list items color-coded to attendance status |
| Empty states | Centered icon + title + description when a list is empty |
| FAB | Floating action button (shadow.primary) for the primary add action |

---

## Platform Notes

- **Android** — package ID `com.kevinsidd.rollcall`; minimum SDK determined by Expo 54 defaults
- **iOS** — full support; run `yarn ios` on macOS with Xcode installed
- **Web** — `yarn web` starts the Metro bundler in web mode, but the SQLite database is **completely disabled**; a warning banner is shown instead of data. Use web only for layout/UI preview.
- **New Architecture** — enabled (`newArchEnabled: true` in `app.json`); uses the Fabric renderer and TurboModules
- **Portrait only** — orientation is locked to portrait in `app.json`
