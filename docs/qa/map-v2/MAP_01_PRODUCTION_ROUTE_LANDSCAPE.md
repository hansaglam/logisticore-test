# MAP-01 — production Harita route / landscape foundation

Date: 2026-10-14 (Europe/Istanbul)

Status: **MAP_PRODUCTION_ROUTE_LANDSCAPE_IMPLEMENTED_MANUAL_QA_REQUIRED**.

## Entry and orientation audit (before implementation)

- `App.tsx` owns a custom tab switch, not React Navigation. Main tabs are dashboard/Ana, map/Harita, contracts/İşler and market/Piyasa. The central Yönetim button opens `ManagementPanel`; management destinations use `more` subroutes or other root tabs.
- Harita rendered `MapScreen` → `WorldMapCanvas` → `InteractiveTurkeyMap`. The legacy screen is retained.
- `DebugSimulationScreen` opened `MapV2WorldScreen` (world/country/city-detail) and separate renderer, geometry and transport diagnostics. There was no orientation owner on these paths.
- Active tab started at `dashboard`, without persisted tab restoration. `navigationRequest` dispatches requests through the same tab switch. `more` and `vehicleMarketplace` are kept alive; Harita is not.
- `app.json` forced portrait. The checked-in iOS plist allowed portrait/upside-down only; Android's activity manifest forced portrait. MainActivity had no runtime orientation code. No independent Xcode orientation override was found; deployment target remains 15.1.
- `expo-screen-orientation` was absent. No existing lock/unlock authority was present.
- The active legacy and V2 canvases use layout measurement. WorldMapCanvas and MapV2WorldScreen already use `useWindowDimensions`; no module-scope window snapshot drives their viewport. V2 had portrait minimum heights and a camera initially fitted only once. Legacy is a vertically scrollable screen with a fixed-height canvas and responsive width.
- `app.config.js` already resolves `LOGISTICORE_BUILD_PROFILE`, defaulting to internal, and embeds `extra.buildProfile`; existing EAS simulator/preview profiles explicitly use internal. No second environment switch was added.

## Implemented architecture

Normal game launch → **Harita** → `MapEntryScreen` → `resolveMapExperience`:

| Build metadata | Experience |
| --- | --- |
| Explicit internal | MAP_V2 |
| Development JS with no profile metadata | MAP_V2 |
| Explicit production/store, even with development JS | LEGACY_MAP |
| Unknown profile or missing metadata in release JS | LEGACY_MAP |

The V2 module is loaded only on the selected V2 path. Both Harita and the optional diagnostic entry use the exact same `MapV2WorldScreen`; there is no forked implementation or new visible tab. All legacy resources remain present. Rollback of experience selection is centralized in the pure resolver.

**Simülasyon Testi is diagnostic-only.** All new Map phase acceptance testing starts from normal game launch → Harita. Older preview-oriented QA instructions are superseded by this document for MAP-01 and subsequent production Harita phases.

`screenOrientationAuthority.ts` resolves Harita to LANDSCAPE_MAP; other/unknown tabs and explicitly standalone surfaces resolve to PORTRAIT_APP. Map-owned nested states and overlays inherit the map tab. Yönetim's menu is a standalone surface: opening it restores portrait, dismissing it back to Harita restores landscape. Account/progression data is not an input to this policy.

`App` owns active navigation state and mounts one `useScreenOrientationController`, including loading/recovery. Native calls are serialized through a shared queue retained over Fast Refresh. Pending requests read the newest desired mode; revision checks invalidate stale completions. Identical settled requests do not lock again. Rejected locks are logged and can retry on the next request/foreground, without an infinite retry loop. Route effects and root remounts reassert the current mode; AppState reactivation reasserts the current route. No screen owns native orientation independently.

Cold startup resolves dashboard/portrait. There is no existing navigation persistence to change; any future restored `map` tab must feed the same root state. Back from V2 nested state remains in Harita; exiting the V2 world returns to Ana.

## Native and dependency changes

- Added only `expo-screen-orientation ~9.0.9` (resolved 9.0.9), using `npx expo install`. This is the SDK 54 version from Expo's bundled dependency map and [SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/sdk/screen-orientation/).
- App config now allows native rotation and installs the orientation plugin with PORTRAIT_UP initial orientation.
- iPhone supports portrait and both landscapes. iPad retains all four valid orientations. Full-screen mode is enabled for reliable iPad orientation locking; existing `supportsTablet: false` is preserved.
- Checked-in plist sets `EXDefaultScreenOrientationMask` to the plugin's actual native value, `UIInterfaceOrientationMaskPortrait`.
- Android manifest uses `unspecified`. MainActivity sets the initial portrait request before React startup; the runtime controller owns later requests.
- No Expo prebuild ran. Signing, identifiers, entitlements, Firebase, ads, SDK/RN/Skia/Reanimated/Gesture Handler versions and iOS deployment target were not changed.
- iOS requires a macOS CocoaPods install/native rebuild before testing the added module. `Podfile.lock` was not fabricated on Windows.

## Layout and modal safety

- Harita's root consumes safe-area-context left/right/top insets. Existing bottom tab/home-indicator padding remains authoritative; no device-specific offsets were added.
- Landscape V2 canvas minimum height is reduced, and existing information panels scroll within available height. This is a compatibility adjustment, not the MAP-02 command-center shell. City lists and non-map panes retain their own scrolling.
- V2 camera responds to viewport changes, preserving geographic center/relative zoom and clamping to current bounds.
- Global dialogs, delivery/offline/recovery sheets, map fuel sheets and the management modal permit portrait and both landscape directions. Their orientation follows navigation ownership.
- Legacy MapScreen, InteractiveTurkeyMap and legacy map resources are retained. Existing legacy scrolling and responsive viewport width continue to handle the landscape fallback.

## Automated validation

`npx tsc --noEmit`: PASS. New orientation regression: PASS. Updated implementation-plan regression: PASS (25 assertions). `git diff --check`: no whitespace errors.

94 scripts were run: all root `map-*-test.ts` scripts (including Map V2), navigation regressions, iOS map regressions, delivery-boost/map interaction and Bursa–Ankara truck route checks. After updating the obsolete portrait-only configuration assertion and rerunning it, 89 scripts pass and 5 remain failing. Both **29AM canonical progression read** and **29AN canonical progression eligibility** regressions pass. Tab navigation performance and contract-transfer navigation regressions pass.

| Remaining existing test failure | Evidence / scope |
| --- | --- |
| `management-account-navigation-regression-test.ts` | 3 outdated source assertions: AccountSection placement, separate account route, and searching the old QuickAccessMenu re-export for Modal props. MoreScreen, QuickAccessMenu and the test are unchanged. |
| `map-truck-position-test.ts` | 4 heading assertions: L-corner tangent, just-before-corner tangent, İzmir–Ankara and İstanbul–Antalya reverse headings. mapRoadUtils, mapTruckLocation, route data and test are unchanged. |
| `map-v2-player-rail-corridors-regression-test.ts` | Missing ignored `turkey-rail-corridors.lineage.json`. Canonical RAIL artifacts were not regenerated/changed. |
| `map-v2-rail-ingest-regression-test.ts` | `spawnSync('npx', ...)` does not launch successfully in this Windows test environment (`tsx available` assertion). |
| `map-v2-road-ingest-regression-test.ts` | Missing raw source with an already packaged ROAD network conflicts with the old SOURCE_PENDING expectation; the same Windows `spawnSync('npx', ...)` path then fails and its null-output handling throws. No source/canonical network was changed. |

The implementation-plan test's old `orientation: portrait` assertion was intentionally replaced with checks for native rotation support plus the portrait initial-orientation plugin. No unrelated failing assertion was weakened.

Three additional layout/menu suites were checked after the safe-area changes: management panel PASS (85 assertions); iOS tab-bar safe area has 3 existing failures (literal 72px height, Finance scroll inset, old marketTheme bottom spacing); iOS layout has 1 existing Finance metrics-wrap failure. The relevant layout constants, Finance screen and market theme were not changed. Combined result: **97 scripts, 90 pass, 7 fail**. This is not an all-green automated baseline.

The new `scripts/map-orientation-regression.ts` covers route policy, map-owned/standalone states, rollout fail-safe behavior, duplicate locks, delayed competing native requests, foreground reassertion, rejection/retry, and native/integration wiring.

No Firebase destructive operations or gameplay/canonical topology changes are part of this phase.

## MAP-01 MANUAL QA

Only actual device observations may be marked PASS or FAIL. NOT RUN is intentional where the device/build environment prevents verification; automated assertions are not substituted for manual results.

| Required check | iOS | Android |
| --- | --- | --- |
| Cold launch portrait | NOT RUN | BLOCKED |
| Ana → Harita automatic landscape | NOT RUN | BLOCKED |
| Harita opens Map V2 directly | NOT RUN | BLOCKED |
| Landscape Left | NOT RUN | BLOCKED |
| Landscape Right | NOT RUN | BLOCKED |
| Harita → Ana portrait | NOT RUN | BLOCKED |
| Harita → Yönetim portrait | NOT RUN | BLOCKED |
| Harita → İşler portrait | NOT RUN | BLOCKED |
| Harita → Piyasa portrait | NOT RUN | BLOCKED |
| Nested/back/standalone navigation authority | NOT RUN | BLOCKED |
| Background/foreground landscape | NOT RUN | BLOCKED |
| Background/foreground portrait | NOT RUN | BLOCKED |
| Rapid route switching in both directions | NOT RUN | BLOCKED |
| Map-owned overlay remains landscape | NOT RUN | BLOCKED |
| Safe area/notch/home indicator | NOT RUN | BLOCKED |
| Map pan/pinch after rotation | NOT RUN | BLOCKED |
| Crash/render errors | NOT RUN | BLOCKED |

iOS blocker: Windows host has no Xcode/iOS device or simulator execution environment. Both orientations and Dynamic Island/notch usability still need verification on a rebuilt iOS binary.

Android status: **MAP_01_ANDROID_QA_BLOCKED_ENVIRONMENT**. The x86_64 debug native build completed successfully (`assembleDebug`, 361 tasks), and the APK installed successfully with `adb install -r` after a non-destructive emulator reboot. Metro bundled the application successfully. However, normal launch repeatedly stalls at Bundling 100%: OkHttp reports `java.net.ProtocolException: Expected leading [0-9a-fA-F] character but was 0xd` while downloading from `http://10.0.2.2:8081`. The error reproduced after a verified Metro restart and on a cached 257ms bundle. No React game screen or Harita interaction was reached. The launch window was observed in portrait, but this does not qualify as a full cold-launch PASS. Android rejected the attempted temporary metro.host override; its value remained unchanged. No game data was cleared.

## Deferred / next blocker

MAP-02 was not implemented. Portrait-style headers, controls, tab bar and information cards are intentionally retained. Country-map gesture restrictions already present in V2 are unchanged; verify world pan/pinch and country selection separately. Premium landscape shell, command rail, inspector and KPI strip remain future work.

The dominant next blocker is the Android development-bundle HTTP transport failure before React startup, followed by the unavailable iOS native QA environment. The release gate remains the full manual matrix on runnable native binaries, including iOS. Do not mark MAP_PRODUCTION_ROUTE_LANDSCAPE_PASS until that matrix passes and outstanding automated failures are resolved or explicitly triaged.

## File inventory

Added:

- `src/domain/mapExperienceAuthority.ts`
- `src/domain/screenOrientationAuthority.ts`
- `src/hooks/useScreenOrientationController.ts`
- `src/screens/MapEntryScreen.tsx`
- `scripts/map-orientation-regression.ts`
- This QA/implementation report.

Changed:

- `App.tsx` — root navigation/orientation wiring and Harita safe area.
- `app.json`, `ios/LogistiCore/Info.plist`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/ethemsincar/logisticore/MainActivity.kt` — supported orientations and portrait initial state.
- `package.json`, `package-lock.json` — orientation dependency only.
- `src/mapV2/screens/MapV2WorldScreen.tsx`, `src/mapV2/world/MapV2GeographicCanvas.tsx` — landscape height/scrolling and resize-compatible camera.
- `src/components/navigation/GameTabBar.tsx` — management visibility metadata and safe-area side padding.
- `src/components/management/ManagementPanel.tsx`, `src/components/ui/AppDialog.tsx`, `src/components/delivery/DeliveryIncidentModal.tsx`, `src/components/delivery/DeliveryResultSheet.tsx`, `src/components/delivery/VehicleRecoverySheet.tsx`, `src/components/offline/OfflineProgressSummaryModal.tsx`, `src/components/RoadsideFuelSheet.tsx`, `src/components/TruckRefuelSheet.tsx` — native modal supported orientations.
- `scripts/map-v2-implementation-plan-regression-test.ts` — superseded native portrait-only assertion.

Unchanged: legacy MapScreen/InteractiveTurkeyMap, gameplay/store authorities, routes.ts, ROAD/RAIL canonical topology and hashes, economics, progression, contracts, warehouse business rules, migrations and 29AO work.
