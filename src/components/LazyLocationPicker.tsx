import React, { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import type { LocationPickerModal as Picker } from './LocationPickerModal';

// Leaflet + the picker load only when the picker is first opened, keeping the map library
// out of the initial bundle (audit performance pass).
const LocationPickerModal = lazy(() =>
  import('./LocationPickerModal').then((m) => ({ default: m.LocationPickerModal }))
);

export const LazyLocationPicker: React.FC<ComponentProps<typeof Picker>> = (props) => {
  if (!props.isOpen) return null;
  return (
    <Suspense fallback={null}>
      <LocationPickerModal {...props} />
    </Suspense>
  );
};
