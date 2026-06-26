# Admin API Integration Plan

## Current State

- `apps/admin` is a Vite React app imported from Figma/Make.
- It is now registered as the `@tour/admin` npm workspace and can run through Turbo.
- The UI is currently mock-driven from `src/app/data/mockData.ts`.
- Existing backend surface lives in `apps/web/app/api/*` and is backed by `apps/web/lib/*` plus `@tour/shared` types.
- The current backend already supports sessions, recordings, processing, analysis, transcripts, comments, follow-up actions, rubrics, materials, dashboard summary, and QR lead capture.

## Monorepo Hookup Completed

- Root scripts:
  - `npm run admin`
  - `npm run build:admin`
  - `npm run typecheck:admin`
- Admin package renamed to `@tour/admin`.
- Admin uses npm workspaces instead of its generated nested pnpm workspace.
- Admin has `tsconfig.json` extending the shared repo config.
- React versions are aligned to the repo's React 19 line.

## Integration Architecture

1. Add an admin API client layer:
   - `apps/admin/src/app/api/client.ts`
   - `apps/admin/src/app/api/types.ts`
   - `apps/admin/src/app/api/sessions.ts`
   - `apps/admin/src/app/api/rubrics.ts`
   - `apps/admin/src/app/api/dashboard.ts`
   - `apps/admin/src/app/api/prospects.ts`
   - `apps/admin/src/app/api/settings.ts`

2. Configure API base URL:
   - `VITE_API_BASE_URL=http://localhost:3000` for local admin-to-web API calls.
   - Default to same-origin (`""`) for future deployment if admin is served behind the same domain/proxy.

3. Reuse shared types where possible:
   - `SessionSummary`, `SessionDetail`, `AnalysisResult`, `FollowUpAction`, `Rubric`, `RubricDefinition`.
   - Add admin-only view models only where the UI needs aggregates not present in `@tour/shared`.

4. Add reusable request states:
   - `loading`
   - `error`
   - `empty`
   - optimistic mutation state for comments, action status, settings toggles, and uploads.

5. Keep mock data as fallback fixtures only during migration:
   - Move imports behind adapter hooks.
   - Delete direct component imports from `mockData.ts` once each screen is integrated.

## Existing API Map

### Dashboard

Use:
- `GET /api/dashboard`
- `GET /api/sessions?limit=...&sort=newest`
- `GET /api/sessions?status=completed&sort=score_desc`

Needed additions:
- Admin dashboard wants trend charts, radar breakdowns, leaderboard, property filters, and score-band distribution.
- Add `GET /api/admin/analytics/summary` or extend `/api/dashboard` with optional `range`, `propertyId`, and `agentId` query params.

### Sessions

Use:
- `GET /api/sessions?page=&limit=&search=&status=&sort=`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `PATCH /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `POST /api/sessions/:id/upload`
- `POST /api/sessions/:id/process`
- `GET /api/sessions/:id/recording`

UI work:
- Replace table mock rows with paginated API data.
- Map admin filters to supported params first; add backend params for agent/property/date later.
- Wire create/upload modal to create session, upload file, then trigger processing.
- Poll session status while processing.

Needed additions:
- Sessions currently do not have `agentId` or `propertyId` fields in shared types.
- Add those columns/types before making team/property filters real.

### Session Detail

Use:
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/analysis`
- `GET /api/sessions/:id/transcript`
- `GET /api/sessions/:id/comments`
- `POST /api/sessions/:id/comments`
- `DELETE /api/sessions/:id/comments`
- `GET /api/sessions/:id/actions`
- `PATCH /api/sessions/:id/actions`
- `POST /api/sessions/:id/analysis`
- `POST /api/sessions/:id/process`

UI work:
- Pass the selected session id into `SessionDetail`.
- Load session, transcript, analysis, comments, and actions in parallel.
- Replace static transcript/rubric/follow-up arrays with API responses.
- Use `/api/sessions/:id/recording` for audio/video playback.

### Rubrics

Use:
- `GET /api/rubrics`
- `POST /api/rubrics`
- `GET /api/rubrics/:id`
- `DELETE /api/rubrics/:id`
- `POST /api/rubrics/upload`

UI work:
- Replace rubric list mock data.
- Wire rubric upload to the existing upload endpoint.
- Save edited extracted categories through `POST /api/rubrics`.
- Disable delete for default rubrics based on `isDefault`.

Needed additions:
- The admin UI has draft/publish and property assignment concepts; current backend only has default/non-default rubrics.
- Add rubric status and property assignment tables or remove those UI states until supported.

### Prospects

Current source:
- `POST /api/leads` captures QR leads into session `leads`.

Needed additions:
- Add `GET /api/admin/prospects` to flatten session leads into prospect rows.
- Add `PATCH /api/admin/prospects/:id` or session-lead update support for follow-up status and notes.
- Decide whether prospects become their own table or remain embedded in `sessions.leads`.

UI work:
- Initially derive prospects from sessions/leads.
- Wire notes and status after persistence model is decided.

### Team

Current gap:
- Mock agents are not represented in existing shared/backend models.

Needed additions:
- Add team/member table or profile source:
  - `agents`
  - `properties`
  - assignments between agents and properties
  - session ownership via `agent_id`
- Add `GET /api/admin/team`
- Add `GET /api/admin/team/:agentId`

UI work:
- Use aggregated session scores for leaderboard and profile panels once `agentId` exists.

### Analytics

Current partial support:
- Existing sessions and analyses can compute score distributions and top/bottom sessions.

Needed additions:
- Add `GET /api/admin/analytics` with query params:
  - `range`
  - `propertyId`
  - `agentId`
- Response should include:
  - KPI summary
  - score distribution
  - trend series
  - rubric heatmap
  - conversion funnel
  - top/bottom sessions

UI work:
- Replace chart mock data with server aggregates.
- Keep filters in URL/search state if admin gets real routing.

### Settings / Integrations

Current gap:
- Settings and Entrata/Yardi integrations are UI-only.

Needed additions:
- `GET /api/admin/settings/profile`
- `PATCH /api/admin/settings/profile`
- `GET /api/admin/settings/notifications`
- `PATCH /api/admin/settings/notifications`
- `GET /api/admin/integrations`
- `POST /api/admin/integrations/entrata/test`
- `POST /api/admin/integrations/entrata/connect`
- Store integration secrets server-side only.

UI work:
- Never keep integration API keys in localStorage.
- Submit keys directly to backend test/connect endpoints.
- Return masked status metadata to the UI.

### Recording

Use:
- `POST /api/sessions`
- `POST /api/sessions/:id/upload`
- `POST /api/sessions/:id/process`

Needed additions:
- Browser recording upload can use the same upload endpoint once the recording component exports a `Blob`.
- Consider adding progress/presigned-upload support for long recordings.

## Recommended Implementation Order

1. Add admin API client and environment config.
2. Add lightweight in-app routing so session ids are first-class instead of transient local state.
3. Integrate Sessions list and Dashboard with existing APIs.
4. Integrate Session Detail with session, analysis, transcript, comments, actions, and recording endpoints.
5. Integrate Rubrics with existing rubric CRUD/upload endpoints.
6. Add admin aggregate endpoints for analytics and dashboard charts.
7. Add prospects read model from session leads, then persist notes/status.
8. Add team/property data model and wire Team filters/profile panels.
9. Add settings and integration endpoints with secure secret handling.
10. Remove direct mock imports and keep fixtures only for tests/story previews.

## Backend Data Model Gaps To Resolve

- `sessions.agent_id`
- `sessions.property_id`
- `properties` table for admin app property filters
- `agents` or `profiles` table for team views
- prospect notes/status persistence
- rubric property assignments
- integration connection metadata and encrypted secret storage
- analytics aggregate API shape

## Verification Checklist

- `npm run typecheck:admin`
- `npm run build:admin`
- API client tests for request/response mapping
- Manual flow:
  - list sessions
  - open session detail
  - add/delete comment
  - update follow-up action
  - upload/process recording
  - create/upload rubric
  - filter dashboard/sessions/analytics
