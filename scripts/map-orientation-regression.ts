import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createOrientationController, resolveOrientationForMainTab, resolveOrientationForRoute,
  type AppOrientationMode,
} from '../src/domain/screenOrientationAuthority';
import { resolveMapExperience } from '../src/domain/mapExperienceAuthority';

const P = 'PORTRAIT_APP';
const L = 'LANDSCAPE_MAP';
const read = (path: string) => readFileSync(path, 'utf8');

async function main() {
  for (const tab of ['dashboard', 'more', 'contracts', 'market', 'fleet', 'shop', 'warehouse', 'account', 'settings', 'unknown']) {
    assert.equal(resolveOrientationForMainTab('map'), L);
    assert.equal(resolveOrientationForMainTab(tab), P, `Harita -> ${tab}`);
  }
  for (const nestedState of ['WORLD', 'COUNTRY', 'CITY_DETAIL', 'inspector', 'truck', 'contract', 'planner', 'warehouse', 'market', 'warning', 'modal']) {
    assert.equal(resolveOrientationForRoute({ mainTab: 'map', owner: 'map', nestedState }), L);
  }
  assert.equal(resolveOrientationForRoute({ mainTab: 'map', owner: 'standalone', nestedState: 'warehouse' }), P);
  assert.equal(resolveOrientationForRoute({ mainTab: 'unknown', owner: 'map' }), P);
  assert.equal(resolveOrientationForRoute({ mainTab: 'more', nestedState: 'MapV2Diagnostic' }), P);
  for (const account of ['guest', 'signed-in']) {
    for (const progression of ['legacy', 'canonical']) {
      const route = { mainTab: 'map', account, progression };
      assert.equal(resolveOrientationForRoute(route), L);
    }
  }
  assert.equal(resolveMapExperience('internal', false), 'MAP_V2');
  assert.equal(resolveMapExperience(undefined, true), 'MAP_V2');
  assert.equal(resolveMapExperience('production', true), 'LEGACY_MAP');
  assert.equal(resolveMapExperience('production', false), 'LEGACY_MAP');
  assert.equal(resolveMapExperience(undefined, false), 'LEGACY_MAP');
  assert.equal(resolveMapExperience('unknown', true), 'LEGACY_MAP');

  const calls: AppOrientationMode[] = [];
  const controller = createOrientationController(async (mode) => { calls.push(mode); });
  await controller.request(P);
  await controller.request(P);
  assert.deepEqual(calls, [P], 'duplicate requests do not relock');
  await controller.request(L);
  await controller.request(L, true);
  assert.deepEqual(calls, [P, L, L], 'foreground reasserts landscape');
  await controller.request(P);
  await controller.request(P, true);
  assert.deepEqual(calls.slice(-2), [P, P], 'foreground reasserts portrait');

  for (const sequence of [[L, P], [P, L], [L, P, L]] as AppOrientationMode[][]) {
    const first = sequence[0];
    const last = sequence[sequence.length - 1];
    const locks: AppOrientationMode[] = [];
    let release!: () => void;
    let native: AppOrientationMode | undefined;
    const race = createOrientationController(async (mode) => {
      locks.push(mode);
      if (locks.length === 1) await new Promise<void>((resolve) => { release = resolve; });
      native = mode;
    });
    const stale = race.request(first);
    await Promise.resolve(); // First native lock is in flight.
    const pending = sequence.slice(1).map((mode) => race.request(mode));
    assert.equal(locks.length, 1, 'native calls never overlap');
    release();
    await Promise.all([stale, ...pending]);
    assert.equal(native, last, 'new navigation wins against stale native completion');
    const afterCompletion = race.request(first);
    await afterCompletion;
    assert.equal(native, first, 'request at queue completion is not lost');
  }
  let attempts = 0;
  const errors: unknown[] = [];
  const retry = createOrientationController(async () => {
    if (++attempts === 1) throw new Error('native unavailable');
  }, (error) => errors.push(error));
  await retry.request(L);
  await retry.request(L, true);
  assert.equal(attempts, 2);
  assert.equal(errors.length, 1);

  const app = read('App.tsx');
  assert(app.includes('<MapEntryScreen'));
  assert(app.includes("useState<TabKey>('dashboard')"));
  assert(app.includes('useScreenOrientationController(resolveOrientationForRoute('));
  assert(app.includes("owner: managementVisible ? 'standalone' : undefined"));
  assert.equal(resolveOrientationForRoute({ mainTab: 'map', owner: 'standalone', nestedState: 'management' }), P);
  const entry = read('src/screens/MapEntryScreen.tsx');
  assert(entry.includes('Constants.expoConfig?.extra?.buildProfile'));
  assert(entry.includes("../mapV2/screens/MapV2WorldScreen"));
  assert(entry.includes('<MapScreen'));
  assert(read('src/screens/DebugSimulationScreen.tsx').includes('<MapV2WorldScreen'));
  const config = JSON.parse(read('app.json')).expo;
  assert.equal(config.orientation, 'default');
  assert.equal(config.ios.requireFullScreen, true);
  const plist = read('ios/LogistiCore/Info.plist');
  for (const value of ['UIInterfaceOrientationMaskPortrait', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']) assert(plist.includes(value));
  assert(!read('android/app/src/main/AndroidManifest.xml').includes('screenOrientation="portrait"'));
  assert(read('android/app/src/main/java/com/ethemsincar/logisticore/MainActivity.kt').includes('SCREEN_ORIENTATION_PORTRAIT'));
  for (const path of ['management/ManagementPanel', 'ui/AppDialog', 'delivery/DeliveryIncidentModal', 'delivery/DeliveryResultSheet', 'delivery/VehicleRecoverySheet', 'offline/OfflineProgressSummaryModal', 'RoadsideFuelSheet', 'TruckRefuelSheet']) {
    assert(read(`src/components/${path}.tsx`).includes("supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}"));
  }
  console.log('MAP-01 orientation regression PASS: policy, rollout, races, deduplication, foreground, failures, native configuration and integration');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
