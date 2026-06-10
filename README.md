# Tour Monorepo

Turborepo workspace for the Tour Hub product surface.

## Apps

- `apps/web` - Next.js App Router web/backend application.
- `apps/mobile` - Expo SDK 54 mobile application.

## Packages

- `packages/shared` - shared tour constants and domain primitives.
- `packages/config` - shared TypeScript configuration.

## Commands

```bash
npm install
npm run dev
npm run web
npm run mobile
npm run build
npm run typecheck
```

The Expo app is also wired for the Codex Run action through `script/build_and_run.sh`.

## Supabase

The Supabase project id is `tkweddqlriikqgylsuxz`, with project URL:

```text
https://tkweddqlriikqgylsuxz.supabase.co
```

`SUPABASE_SERVICE_ROLE_KEY` belongs only in server-side Next.js code and local/server deployment secrets. Do not expose it in Expo or browser/client code.

Use `.env.example` as the checked-in template. The local `.env.local` file contains the server-side values requested for this scaffold and is ignored by git.
