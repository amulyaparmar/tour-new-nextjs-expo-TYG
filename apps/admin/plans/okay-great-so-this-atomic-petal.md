# Plan: Admin & Manager Dashboard Platform

## Context

The current app has three screens: Dashboard, Recording, and SessionDetail. The user wants to pivot the product focus entirely to the **admin/manager side** — removing the recording flow and replacing it with a richer, purpose-built platform for reviewing agent performance, managing rubrics, and analyzing trends. This is the desktop web experience managers use at their desk, not the field-facing recording tool.

---

## Screens to Build / Replace

### 1. Remove
- `Recording.tsx` — delete or strip from routing entirely
- "New recording" button in Dashboard header — remove

---

### 2. Dashboard (rewrite `Dashboard.tsx`)
Keep the session list and stats sidebar concept but significantly expand it:

**Header / nav**
- Replace "New recording" CTA with "Upload recording" button (opens modal)
- Add property/team selector dropdown in the header
- Make nav links functional: Dashboard, Sessions, Analytics, Team, Rubrics

**Session list (left)**
- Add column headers: Prospect, Property, Agent, Date, Duration, Score
- Add sortable columns (click header to sort)
- Add date range filter (Today / This week / This month / Custom)
- Add agent filter (multi-select dropdown)
- Add property filter

**Stats sidebar (right)**
- Team avg score card
- Tours this week
- Conversion rate
- New: "Sessions needing review" (low-score sessions with no coaching comments)
- Leaderboard: keep but make clickable — clicking an agent name navigates to Agent Profile

---

### 3. SessionDetail — keep and deepen

The existing SessionDetail is solid. Extend it:

**Transcript tab**
- No changes needed

**Score tab**
- Show which rubric template was applied (name + version)
- Link to view/edit that rubric

**Follow-up tab**
- No changes needed

**Comments sidebar**
- Keep as-is

---

### 4. NEW: Analytics Screen (`components/Analytics.tsx`)

Full-page analytics view with:

**Filters bar** (sticky)
- Date range picker
- Property selector
- Agent multi-select

**Sections:**
1. **Score distribution histogram** — bar chart showing how many tours land in each score band (0–59, 60–69, 70–79, 80–89, 90–100)
2. **Score trend over time** — existing line chart but larger, with per-agent lines togglable
3. **Rubric category heatmap** — table: rows = agents, columns = rubric categories, cells = avg score with color coding (red/yellow/green)
4. **Conversion funnel** — stacked bar: Tours → Applications → Leases
5. **Top/bottom performing sessions** — two small lists (top 5 and bottom 5 by score), each row links to SessionDetail

Use `recharts` throughout (BarChart, LineChart, RadarChart already used; add ComposedChart for funnel).

---

### 5. NEW: Team Screen (`components/Team.tsx`)

**Agent cards grid**
- Each card: avatar initials, name, role badge, # tours this month, avg score, trend arrow
- Click → Agent Profile modal or inline expand

**Agent Profile panel** (slide-in right panel or modal)
- Agent name + role
- Score trend line (last 8 weeks)
- Radar chart showing their rubric category breakdown vs team avg (two overlapping radars)
- Recent sessions list (last 5)
- Coaching notes count
- "View all sessions" link → filters Dashboard to this agent

---

### 6. NEW: Rubrics Screen (`components/Rubrics.tsx`)

This is the most complex new screen. Core concept: managers upload a rubric template document (PDF or text), AI extracts the categories and criteria, and the manager can review/edit before activating.

**Rubric list view** (default)
- Table: Name, Version, Properties assigned, Category count, Status (Draft / Active), Last updated
- "New rubric" button → opens creation flow
- Each row is clickable → Rubric Detail

**Rubric creation flow** (multi-step, shown in a full-page form or large modal):

*Step 1 — Upload*
- Drag-and-drop zone for PDF/DOCX/TXT
- Or paste text directly into a textarea
- Shows file name + size once uploaded
- "Extract with AI" button

*Step 2 — AI extraction preview*
- Shows extracted categories in an editable card list:
  - Category name (editable inline)
  - Description (editable inline)
  - Weight / point value (number input)
  - Criteria bullets (editable list, add/remove)
- User can drag to reorder categories
- "Add category" button adds a blank card
- Delete icon on each card
- Total weight indicator (must sum to 100%)

*Step 3 — Assign & Activate*
- Property assignment (multi-select checkboxes)
- Name the rubric version
- "Save as Draft" or "Activate" buttons
- Warning if total weight ≠ 100%

**Rubric Detail view**
- Shows all categories and criteria (read-only unless editing)
- "Edit" button → re-opens step 2 editor
- "Assign to properties" → step 3
- Version history list (v1, v2, etc.)
- Sessions scored against this rubric (count + link)

---

### 7. NEW: Prospects Screen (`components/Prospects.tsx`)

A CRM-lite view of every prospect who has been toured, surfacing property fit, follow-up status, and next actions.

**Prospect list** (default)
- Table columns: Name, Property of interest, Unit, Touring agent, Tour date, Score, Follow-up status (Pending / Sent / Converted / Lost), Last contact date
- Search by name or email
- Filter by property, agent, follow-up status, date range
- Score pill (same color coding as Dashboard)
- Row click → Prospect Detail panel

**Prospect Detail panel** (slide-in right panel)
- Avatar initials + name + contact info (email, phone — editable fields)
- Property interest + unit toured
- Timeline of interactions:
  - Tour session (links to SessionDetail)
  - Follow-up actions sent (from AI-generated list)
  - Manager coaching notes
  - Manual notes (free text, timestamped)
- AI-generated follow-up actions (same list from SessionDetail, shown in context here)
- Follow-up status selector (dropdown: Pending / Sent / Converted / Lost)
- "Mark converted" button → changes status, records date
- Next follow-up date picker

**Mock data additions** (`mockData.ts`)
```typescript
prospects[] = {
  id, name, email, phone,
  propertyId, unit, agentId,
  tourSessionId,       // links to session
  tourDate,
  score,
  followUpStatus: "pending" | "sent" | "converted" | "lost",
  lastContact,
  nextFollowUp,
  notes: { text, timestamp, author }[],
  followUpActions: string[],  // AI-generated from tour
}
```

---

## Navigation

Wire all nav links in the shared header. Use a `view` state in `App.tsx` with values:
`"dashboard" | "session" | "analytics" | "team" | "rubrics" | "prospects"`

Pass `setView` down via props or lift routing logic into App.

---

## Data / Mock Data

All screens use realistic mock data (no backend integration in this pass). Define a shared `mockData.ts` file at `src/app/data/mockData.ts` with exported arrays for:
- `sessions[]` — extended to include `rubricId`, `propertyId`
- `agents[]` — extended to include `weeklyScores[]`
- `properties[]` — `{ id, name }`
- `rubrics[]` — `{ id, name, version, status, categories[] }`
- `rubricCategories[]` — `{ name, weight, description, criteria[] }`

Components import from this shared file instead of defining inline.

---

## File Changes

| Action | File |
|--------|------|
| Delete | `src/app/components/Recording.tsx` |
| Rewrite | `src/app/App.tsx` — new view routing, remove recording |
| Rewrite | `src/app/components/Dashboard.tsx` — sortable table, new filters |
| Extend | `src/app/components/SessionDetail.tsx` — add rubric link in Score tab |
| Create | `src/app/components/Analytics.tsx` |
| Create | `src/app/components/Team.tsx` |
| Create | `src/app/components/Rubrics.tsx` |
| Create | `src/app/components/Prospects.tsx` |
| Create | `src/app/data/mockData.ts` |

---

## Verification

1. Navigate through all 5 nav items — each renders without crashing
2. Dashboard: search, sort, and filter sessions; click a session to open SessionDetail
3. Analytics: all charts render with data; filters update chart content
4. Team: agent cards render; clicking an agent opens profile panel with radar + trend chart
5. Rubrics: list view renders; "New rubric" opens step 1 upload; "Extract with AI" transitions to step 2 editable card list; step 3 assigns and saves
6. SessionDetail: Score tab shows rubric name; coaching comments panel works
7. Prospects: list renders with search/filter; clicking a prospect opens the detail panel showing property, tour score, follow-up actions, timeline, and status selector
