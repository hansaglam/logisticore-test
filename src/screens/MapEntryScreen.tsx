import React from 'react';
import Constants from 'expo-constants';
import { resolveMapExperience } from '../domain/mapExperienceAuthority';
import MapScreen from './MapScreen';

export default function MapEntryScreen({ onClose, onOpenContracts }: {
  onClose: () => void;
  onOpenContracts: () => void;
}) {
  const experience = resolveMapExperience(
    Constants.expoConfig?.extra?.buildProfile,
    typeof __DEV__ !== 'undefined' && __DEV__,
  );
  if (experience === 'MAP_V2') {
    // Load only when selected; public builds keep the established legacy path.
    const MapV2WorldScreen = require('../mapV2/screens/MapV2WorldScreen').default;
    return <MapV2WorldScreen onClose={onClose} />;
  }
  return <MapScreen onOpenContracts={onOpenContracts} />;
}
