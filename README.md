# Tour Hub TYG

Tour Hub is a shared workspace for leasing and sales teams to manage everything around property tours. The web dashboard is meant for managers and operators who need a central place for tour knowledge, sales materials, media, recordings, AI notes, objections, questions, and follow-up tasks. The mobile app is meant for leasing agents in the field so they can prepare for tours, record conversations, review AI-generated recaps, and send the right materials after each visit.

This repo is a Turborepo workspace with a Next.js web app and an Expo mobile app.

## Project Structure

- `apps/web` - Next.js dashboard for the main Tour Hub workspace.
- `apps/mobile` - Expo app for mobile tour prep, recording, recaps, and follow-ups.
- `packages/shared` - shared constants and domain primitives.
- `packages/config` - shared TypeScript configuration. TYG!
 
## Setup

Install dependencies once from the repository root:

```bash
npm install
```

Supabase project URL:

```text
https://tkweddqlriikqgylsuxz.supabase.co
```

Use the service role key only in trusted server-side environments. Do not put it in Expo, browser code, or any `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variable.

## Run the Web App

From the repository root:

```bash
npm run web
```

This starts the Next.js app in `apps/web`. The local URL is usually:

```text
http://localhost:3000
```

You can also run the web app directly:

```bash
cd apps/web
npm run dev
```

## Run the Mobile App

From the repository root:

```bash
npm run mobile
```

This starts the Expo dev server for `apps/mobile`.

Use one of the Expo options:

- Scan the QR code with Expo Go on your phone.
- Press `i` for iOS Simulator.
- Press `a` for Android Emulator.
- Press `w` for the web preview.

You can also run the mobile app directly:

```bash
cd apps/mobile
npm run dev
```

## Useful Commands

Run both app dev tasks through Turborepo:

```bash
npm run dev
```

Build all workspaces:

```bash
npm run build
```

Run TypeScript checks:

```bash
npm run typecheck
```

## Environment Files

Use the checked-in example files as templates:

- `apps/web/.env.local.example`
- `apps/mobile/.env.example`

The web app can use server-side secrets in local or deployment env vars. The mobile app must only use public Supabase values, such as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

TYG
