# Firebase setup (push + analytics)

Firebase is not committed. Create a project, then drop the config files into `apps/mobile/`.

## 1. Create the Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) → Add project.
2. Enable **Google Analytics** when prompted.
3. Enable **Cloud Messaging**.

## 2. Register apps

- **iOS**: bundle id `com.leasemagnets.tournewtouryou.tyg`
  - Download `GoogleService-Info.plist` → save as `apps/mobile/GoogleService-Info.plist`
- **Android**: package `com.leasemagnets.tournewtouryou.tyg`
  - Download `google-services.json` → save as `apps/mobile/google-services.json`

## 3. EAS credentials

From `apps/mobile`:

```bash
eas credentials
```

- Upload **FCM** server key / Google service account for Android push
- Upload **APNs** key for iOS push (Expo Notifications)

## 4. Rebuild native app

```bash
cd apps/mobile
npx expo prebuild --clean   # if needed
npx expo run:ios
# or
eas build --profile development
```

OTA updates cannot add native Firebase / notification modules — a new binary is required after this setup.

## Analytics in DebugView

Native debug builds (`expo run:ios`) now collect analytics. Events appear in Firebase **DebugView** after enabling debug mode once:

```bash
# iOS Simulator
xcrun simctl spawn booted log config --mode "level:debug" --subsystem com.google.firebase.analytics
# Or launch with -FIRDebugEnabled via scheme
```

Realtime Console reports can lag up to ~24h; use DebugView for immediate confirmation.

## Related env (web)

Set on Vercel for crons:

```
CRON_SECRET=<random-secret>
```

- `GET /api/cron/entrata-sync` — every 12 hours  
- `GET /api/cron/session-reminders` — every 15 minutes  

Both expect `Authorization: Bearer $CRON_SECRET`.

Apply the session reminder migration (`reminder_sent_at`) before relying on tour reminders.
