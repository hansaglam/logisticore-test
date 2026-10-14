export type MapExperience = 'MAP_V2' | 'LEGACY_MAP';

/** An explicit public profile wins even when running a debug JS bundle. */
export function resolveMapExperience(profile: unknown, development: boolean): MapExperience {
  if (profile === 'production' || profile === 'store') return 'LEGACY_MAP';
  if (profile === 'internal') return 'MAP_V2';
  return profile == null && development ? 'MAP_V2' : 'LEGACY_MAP';
}
