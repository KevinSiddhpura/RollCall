# RollCall

RollCall is a local-first attendance management app for classrooms and organizations, built with Expo, React Native, SQLite, and a Node.js backend. It supports offline use, signed-in cloud sync, custom group structures, flexible member fields, attendance tracking, CSV import/export, and a modern glass-inspired UI.

> **Project Disclaimer:**
> This repository is part of a **College PBL (Project-Based Learning) Activity**. The app was built with AI assistance for architecture, UI/UX, and implementation.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Screens & Navigation](#screens--navigation)
- [Data Model](#data-model)
- [Backend API](#backend-api)
- [Theme System](#theme-system)
- [Components](#components)
- [Local Testing](#local-testing)
- [Production Release](#production-release)

---

## Features

### Core
- **Local-first** — data stored on-device in SQLite, works without network
- **Guest mode** — use the app without creating an account
- **Account auth** — register, sign in, change password, sign out, delete account
- **Cloud sync** — bidirectional push/pull sync for authenticated users with live progress modal

### Groups & Members
- **Hierarchical groups** — container groups (organize sub-groups) and leaf groups (track attendance)
- **Custom fields** — per-group field definitions with unique identifier and display toggles
- **Member management** — add, edit, delete members with flexible field values
- **CSV import** — 6-step import wizard with column selection, field renaming, unique ID selection, display field selection, and live progress modal
- **Bulk operations** — multi-select members for delete, CSV export, PDF export

### Attendance
- **Attendance sessions** — create dated sessions for any leaf group
- **Status tracking** — present / absent / late with optional reason per member
- **Live P/A/L counts** — real-time count pills during attendance recording
- **Session editing** — edit past sessions, update attendance records

### Export & Reports
- **CSV export** — export with customizable file name, date range filters
- **PDF export** — formatted attendance reports with color-coded statuses
- **Bulk PDF export** — export multiple groups in a single PDF
- **Member export** — export individual member attendance history

### UI/UX
- **Modern glass-inspired design** — clean white surfaces, soft shadows, rounded corners
- **Smooth animations** — Reanimated spring animations throughout
- **Responsive feedback** — success toasts, progress modals, haptic feedback
- **Cross-platform** — consistent experience on iOS and Android

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Expo SDK 54, React Native 0.81.5 |
| Navigation | Expo Router v6 (file-based routing) |
| Local storage | expo-sqlite (SQLite) |
| State management | React Context (Auth, Security, Theme) |
| Animations | react-native-reanimated 4 |
| Gestures | react-native-gesture-handler |
| Drag & drop | react-native-draggable-flatlist |
| Icons | lucide-react-native |
| CSV parsing | papaparse |
| Networking | axios |
| Date formatting | date-fns |
| Backend | Node.js, Express, MongoDB, Mongoose |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Logging | pino, pino-pretty |
| Security | helmet, express-rate-limit, compression |
| Language | TypeScript (frontend), JavaScript (backend) |

---

## Project Structure

```text
RollCall/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express app, MongoDB connection, middleware stack
│   │   ├── logger.js              # Pino logger with pretty-print transport
│   │   ├── middleware/
│   │   │   └── auth.js            # JWT auth guard middleware
│   │   ├── models/
│   │   │   ├── User.js            # Email/password accounts with bcrypt
│   │   │   ├── Group.js           # Hierarchical groups (container/leaf)
│   │   │   ├── FieldDef.js        # Per-group field definitions
│   │   │   ├── Member.js          # Members with flexible field values
│   │   │   ├── AttendanceSession.js  # Dated attendance sessions
│   │   │   └── AttendanceRecord.js   # Per-member attendance status
│   │   └── routes/
│   │       ├── auth.js            # Register, login, password change, delete account
│   │       └── sync.js            # Push/pull sync, cascade deletes
│   └── package.json
└── frontend/
    ├── app/                       # Expo Router file-based routes
    │   ├── _layout.tsx            # Root providers, auth gate, navigation shell
    │   ├── index.tsx              # Redirect to /(tabs)/dashboard
    │   ├── auth.tsx               # Auth screen with modal-based sign in/up
    │   ├── +html.tsx              # Web HTML shell
    │   ├── (tabs)/
    │   │   ├── _layout.tsx        # Bottom tab navigator (Dashboard, Groups, Settings)
    │   │   ├── dashboard.tsx      # Overview stats, attendance ring, recent activity
    │   │   ├── groups.tsx         # Group browser with drag-to-reorder
    │   │   └── settings.tsx       # Reports, account, security, sync controls
    │   └── group/
    │       ├── new.tsx            # Create new group (container or leaf)
    │       ├── [id].tsx           # Group detail — roster/sessions tabs
    │       └── [id]/
    │           ├── add-member.tsx     # Add or edit member
    │           ├── fields.tsx         # Manage custom field definitions
    │           ├── import-csv.tsx     # 6-step CSV import wizard
    │           ├── take-attendance.tsx # Record/edit attendance session
    │           └── member/
    │               └── [memberId].tsx # Member profile & attendance history
    ├── src/
    │   ├── auth/                  # AuthContext, SecurityContext (app lock/PIN)
    │   ├── components/
    │   │   ├── ScreenHeader.tsx   # Gradient back-header for sub-screens
    │   │   ├── MemberCard.tsx     # Member row with selection, % bar, actions
    │   │   ├── CloudSyncButton.tsx # Sync status indicator button
    │   │   ├── GlobalSyncBanner.tsx # Top banner for sync error/offline
    │   │   ├── ExportModal.tsx    # File name prompt for exports
    │   │   ├── SyncModal.tsx      # Live sync progress modal
    │   │   ├── PinModal.tsx       # 6-digit PIN keypad modal
    │   │   ├── LockScreen.tsx     # Full-screen app lock overlay
    │   │   └── SuccessToast.tsx   # Animated success notification
    │   ├── hooks/
    │   │   ├── useGroupDetail.ts  # Group detail data fetching
    │   │   ├── useGroups.ts       # Root/sub-group data hooks
    │   │   └── useSyncTrigger.ts  # Sync trigger + remote delete helpers
    │   ├── services/
    │   │   ├── syncService.ts     # Push/pull/syncData with progress callbacks
    │   │   └── db/
    │   │       ├── database.ts    # SQLite init, query helpers, reactivity system
    │   │       ├── types.ts       # DTO interfaces
    │   │       ├── GroupService.ts    # Group CRUD
    │   │       ├── FieldService.ts    # Field definitions CRUD
    │   │       ├── MemberService.ts   # Member CRUD
    │   │       └── SessionService.ts  # Session + records CRUD
    │   ├── theme.ts               # Light-only design tokens (colors, shadows, spacing, typography)
    │   ├── theme/
    │   │   └── ThemeContext.tsx    # Theme provider + useTheme hook
    │   └── utils/
    │       ├── colorHelpers.ts    # pctColor (green/yellow/red by percentage)
    │       ├── exportHelpers.ts   # CSV/PDF export generation + sharing
    │       ├── idHelpers.ts       # generateId utility
    │       └── memberHelpers.ts   # getMemberDisplayName, getMemberUniqueValue
    ├── assets/
    │   └── images/RollCall.png    # App icon
    ├── app.json                   # Expo configuration
    ├── package.json
    └── tsconfig.json
```

---

## Screens & Navigation

### Tab Bar

| Tab | Route | Description |
|---|---|---|
| Dashboard | `/(tabs)/dashboard` | Attendance overview ring, stats, low attendance alerts, recent sessions, sync button |
| Groups | `/(tabs)/groups` | Group list with search, drag-to-reorder, stats chips, pull-to-refresh |
| Settings | `/(tabs)/settings` | Reports & export, account management, security (app lock/PIN) |

### Auth

| Route | Description |
|---|---|
| `/auth` | Welcome screen → modal-based sign in / sign up with tab switcher, guest mode |

### Group Flows

| Route | Description |
|---|---|
| `/group/new` | Create container or leaf group with name and type selector |
| `/group/[id]` | Group detail: breadcrumb, stats, roster (member list) + sessions (attendance log) tabs, bottom action bar |
| `/group/[id]/add-member` | Add/edit member form with dynamic field inputs |
| `/group/[id]/fields` | Manage custom fields — drag to reorder, toggle unique/display, inline rename |
| `/group/[id]/import-csv` | 6-step import wizard: pick file → select columns → rename fields → unique ID → display fields → import with progress |
| `/group/[id]/take-attendance` | Record attendance: date picker, notes, search/filter, P/A/L status buttons per member |
| `/group/[id]/member/[memberId]` | Member profile: details card, attendance history log, export modal |

---

## Data Model

### Frontend SQLite Tables

| Table | Key Columns |
|---|---|
| `groups` | id, name, parent_id, node_type, display_order |
| `field_defs` | id, group_id, name, is_unique, is_display, display_order |
| `members` | id, group_id, field_values (JSON) |
| `sessions` | id, group_id, date, time, notes |
| `records` | id, session_id, member_id, status, reason |

All tables scoped by `user_id`. Foreign keys cascade on delete.

### Backend MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | Email/password accounts with bcrypt hashes |
| `groups` | Group hierarchy, indexed on (user_id, parent_id) |
| `fielddefs` | Field definitions, indexed on (user_id, group_id) |
| `members` | Member data with flexible field_values, indexed on (user_id, group_id) |
| `attendancesessions` | Session metadata, indexed on (user_id, group_id) |
| `attendancerecords` | Attendance statuses, indexed on (session_id, member_id) |

### Sync Flow

1. **Push** (`POST /sync/push`) — client sends all local data, server performs batch `bulkWrite` upserts
2. **Pull** (`GET /sync/pull`) — server returns all user-owned data, client batch-upserts locally
3. **Cascade delete** — deleting a group removes descendants, members, sessions, and records both locally and remotely

---

## Backend API

### Auth Routes

| Method | Route | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account, returns JWT |
| `POST` | `/auth/login` | Authenticate, returns JWT |
| `PATCH` | `/auth/change-password` | Update password (requires JWT) |
| `DELETE` | `/auth/delete-account` | Delete account + all synced data |

### Sync Routes (all require JWT)

| Method | Route | Description |
|---|---|---|
| `POST` | `/sync/push` | Batch upsert all client data to MongoDB |
| `GET` | `/sync/pull` | Return all user-owned data |
| `DELETE` | `/sync/groups/:id` | Cascade delete group + children |
| `DELETE` | `/sync/members/:id` | Delete member + records |
| `DELETE` | `/sync/sessions/:id` | Delete session + records |
| `DELETE` | `/sync/all-data` | Wipe all user data (keeps account) |

### Health

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/ping` | Device connection log |

---

## Theme System

All design tokens are in `frontend/src/theme.ts`. The app uses a **light-only** palette with an indigo primary and soft blue-gray background.

### Token Groups

| Group | Keys | Description |
|---|---|---|
| Colors | `primary`, `primaryDark`, `primaryDeep`, `background`, `surface`, `text`, `danger`, `success`, `warning`, `present`, `absent`, `late`, `excused` + light/surface variants | Full color palette |
| Shadows | `xs`, `sm`, `md`, `lg`, `primary`, `glass` | Elevation presets |
| Spacing | `xs`(4), `sm`(8), `md`(16), `lg`(24), `xl`(32), `xxl`(48) | Consistent spacing scale |
| Border Radius | `xs`(6), `sm`(8), `md`(12), `lg`(16), `xl`(20), `2xl`(24), `3xl`(28), `full`(9999) | Rounded corner scale |
| Typography | `h1`, `h2`, `h3`, `body`, `bodyMed`, `caption`, `label` | Text style presets |

Components access theme via the `useTheme()` hook (provides `colors`, `shadows`) or direct import of `theme` from `src/theme.ts`.

---

## Components

| Component | File | Purpose |
|---|---|---|
| `ScreenHeader` | `components/ScreenHeader.tsx` | Gradient back-header with title, subtitle, optional right slot |
| `MemberCard` | `components/MemberCard.tsx` | Member list row with accent bar, index bubble, name, percentage bar, edit/delete |
| `CloudSyncButton` | `components/CloudSyncButton.tsx` | Circular button showing sync status via icon color |
| `GlobalSyncBanner` | `components/GlobalSyncBanner.tsx` | Dismissible top banner for sync error/offline |
| `ExportModal` | `components/ExportModal.tsx` | Bottom-sheet modal prompting for custom file name before export |
| `SyncModal` | `components/SyncModal.tsx` | Live sync progress modal showing push/pull phases and data type counts |
| `PinModal` | `components/PinModal.tsx` | 6-digit PIN entry keypad for app lock |
| `LockScreen` | `components/LockScreen.tsx` | Full-screen gradient overlay for app lock |
| `SuccessToast` | `components/SuccessToast.tsx` | Auto-hiding animated success notification |

---

## Local Testing

### Prerequisites

- Node.js 18+
- npm (backend) and Yarn 1.x (frontend)
- MongoDB Atlas or local MongoDB instance
- Android emulator / physical device, or macOS + Xcode for iOS

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in MONGO_URI and JWT_SECRET
npm run dev
```

Required `.env` values:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=a_long_random_secret
SERVER_PORT=3000
LOG_LEVEL=info
```

### Frontend

```bash
cd frontend
yarn install
# Create src/config.ts from src/config.example.ts with your backend URL
yarn start
```

Then press `a` for Android or `i` for iOS in the Expo CLI.

---

## Production Release

### Backend

```bash
cd backend
npm install --omit=dev
npm start
```

Recommended production environment:

```env
MONGO_URI=production_connection_string
JWT_SECRET=a_long_random_secret
SERVER_PORT=3000
LOG_LEVEL=warn
```

### Frontend (Android APK)

```bash
cd frontend/android
.\gradlew assembleRelease
```

APK output: `frontend/android/app/build/outputs/apk/release/app-release.apk`

Install on device:

```bash
adb install app/build/outputs/apk/release/app-release.apk
```

### Release Checklist

1. Backend deployed and reachable over HTTPS
2. `frontend/src/config.ts` points to production backend URL
3. Android release APK rebuilt with production config
4. Verify: sign up → sign in → sync → import data → export data → delete account
