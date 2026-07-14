const fs = require("node:fs");
const path = require("node:path");

const appJson = require("./app.json");

const iosGoogleServices = path.join(__dirname, "GoogleService-Info.plist");
const androidGoogleServices = path.join(__dirname, "google-services.json");
const hasIosFirebase = fs.existsSync(iosGoogleServices);
const hasAndroidFirebase = fs.existsSync(androidGoogleServices);

const plugins = [
  ...(appJson.expo.plugins ?? []),
  [
    "expo-notifications",
    {
      color: "#087f8c",
    },
  ],
];

if (hasIosFirebase || hasAndroidFirebase) {
  plugins.push("@react-native-firebase/app");
  plugins.push("@react-native-firebase/analytics");
}

/** @type {import('expo/config').ExpoConfig} */
const config = {
  ...appJson.expo,
  ios: {
    ...appJson.expo.ios,
    infoPlist: {
      ...appJson.expo.ios?.infoPlist,
      UIBackgroundModes: Array.from(
        new Set([...(appJson.expo.ios?.infoPlist?.UIBackgroundModes ?? []), "audio", "remote-notification"]),
      ),
    },
    ...(hasIosFirebase ? { googleServicesFile: "./GoogleService-Info.plist" } : {}),
  },
  android: {
    ...appJson.expo.android,
    ...(hasAndroidFirebase ? { googleServicesFile: "./google-services.json" } : {}),
  },
  plugins,
};

module.exports = { expo: config };
