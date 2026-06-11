# TestFlight Setup

The Expo project is linked as `@tourtyg/tour-new-tour-you-tyg`.

## Current iOS identifiers

- App name: `Tour.new TYG / Tour.you TYG`
- Expo slug: `tour-new-tour-you-tyg`
- iOS bundle ID: `com.leasemagnets.tournewtouryou.tyg`
- Android package: `com.leasemagnets.tournewtouryou.tyg`
- EAS project ID: `a30cd0f8-93f0-423b-979b-2c415aa6a5c4`

Create the App Store Connect app with the same bundle ID before the first upload.

## Required EAS production environment variables

These values are embedded into the mobile app at build time:

```sh
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://tkweddqlriikqgylsuxz.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_SUPABASE_ANON_KEY --visibility plaintext
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://tour.you --visibility plaintext
```

If `https://tour.you` is not the deployed Next.js API host, replace it with the production web app URL before building.

## First TestFlight upload

Run from `apps/mobile`:

```sh
npx testflight
```

Or run from the repository root:

```sh
npm run mobile:testflight
```

The first run is interactive. Sign in with the Expo account that can access `tourtyg`, then sign in with an Apple Developer account that has access to the App Store Connect app. Let EAS manage the iOS distribution certificate and provisioning profile unless you already have a reason to manage them manually.

## Separate build and submit commands

```sh
npm run mobile:build:ios
npm run mobile:submit:ios
```

Use these if you want to inspect the EAS build result before submitting it to App Store Connect.
