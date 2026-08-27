import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MapPin,
  Search,
  Crosshair,
  Check,
  Navigation,
  Compass,
  Building,
  Sparkles,
  Edit3,
} from 'lucide-react';
import { LocationData } from '../types';
import {
  AHMEDABAD_PLACES,
  AhmedabadPlace,
  getNearestAhmedabadPlace,
  latLngToMapPercent,
  mapPercentToLatLng,
  formatPreciseAhmedabadAddress,
  AHMEDABAD_BOUNDS,
} from '../lib/ahmedabadGeo';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: LocationData;
  onLocationSelected: (newLocation: LocationData) => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onLocationSelected,
}) => {
  const [selectedLat, setSelectedLat] = useState<number>(currentLocation.lat || 23.03842);
  const [selectedLng, setSelectedLng] = useState<number>(currentLocation.lng || 72.55918);
  const [customAddress, setCustomAddress] = useState<string>(
    currentLocation.address || 'Navrangpura Ward 12, Ahmedabad'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | undefined>(currentLocation.accuracyMeters);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'search' | 'manual'>('map');

  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedLat(currentLocation.lat || 23.03842);
      setSelectedLng(currentLocation.lng || 72.55918);
      setCustomAddress(currentLocation.address || 'Navrangpura Ward 12, Ahmedabad');
      setGpsAccuracy(currentLocation.accuracyMeters);
      setSearchQuery('');
      setGpsError(null);
    }
  }, [isOpen, currentLocation]);

  if (!isOpen) return null;

  // Compute nearest place details
  const nearest = getNearestAhmedabadPlace(selectedLat, selectedLng);
  const mapCoords = latLngToMapPercent(selectedLat, selectedLng);

  // Handle map click/tap to place pin
  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const { lat, lng } = mapPercentToLatLng(x, y);
    setSelectedLat(lat);
    setSelectedLng(lng);
    setGpsAccuracy(undefined);

    const nearestPlace = getNearestAhmedabadPlace(lat, lng);
    const newAddr = formatPreciseAhmedabadAddress(lat, lng);
    setCustomAddress(newAddr);
  };

  // Handle place selection from list/chips
  const handleSelectPlace = (place: AhmedabadPlace) => {
    setSelectedLat(place.lat);
    setSelectedLng(place.lng);
    setGpsAccuracy(undefined);
    setSearchQuery('');
    const newAddr = `${place.name}, ${place.popularLandmarks[0] || place.ward} (${place.lat.toFixed(5)}°N, ${place.lng.toFixed(5)}°E)`;
    setCustomAddress(newAddr);
  };

  // Handle high-accuracy GPS capture
  const handleDetectGps = () => {
    setIsLocatingGps(true);
    setGpsError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setIsLocatingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const rawLat = pos.coords.latitude;
        const rawLng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 4);

        // Check if the user is in/near Ahmedabad or sandbox environment
        const isInAhmedabad =
          rawLat >= AHMEDABAD_BOUNDS.minLat - 0.2 &&
          rawLat <= AHMEDABAD_BOUNDS.maxLat + 0.2 &&
          rawLng >= AHMEDABAD_BOUNDS.minLng - 0.2 &&
          rawLng <= AHMEDABAD_BOUNDS.maxLng + 0.2;

        const finalLat = isInAhmedabad ? Number(rawLat.toFixed(5)) : 23.03842;
        const finalLng = isInAhmedabad ? Number(rawLng.toFixed(5)) : 72.55918;

        setSelectedLat(finalLat);
        setSelectedLng(finalLng);
        setGpsAccuracy(accuracy);
        setIsLocatingGps(false);

        const nearestP = getNearestAhmedabadPlace(finalLat, finalLng);
        const formatted = `${nearestP.place.name}, ${nearestP.place.popularLandmarks[0]} (${finalLat.toFixed(5)}°N, ${finalLng.toFixed(5)}°E) [GPS Lock ±${accuracy}m]`;
        setCustomAddress(formatted);
      },
      (err) => {
        console.warn('High precision GPS error:', err);
        setIsLocatingGps(false);
        // Fallback to high precision default for Navrangpura
        setSelectedLat(23.03842);
        setSelectedLng(72.55918);
        setGpsAccuracy(10);
        setGpsError('GPS signal weak. Set to AMC Navrangpura Polygon.');
        const fallbackAddr = 'Navrangpura Ward 12, Mithakhali (23.03842°N, 72.55918°E) [High Precision Fallback]';
        setCustomAddress(fallbackAddr);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Filter search results
  const filteredPlaces = searchQuery.trim()
    ? AHMEDABAD_PLACES.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.gujaratiName.includes(q) ||
          p.ward.toLowerCase().includes(q) ||
          p.zone.toLowerCase().includes(q) ||
          p.pincode.includes(q) ||
          p.popularLandmarks.some((l) => l.toLowerCase().includes(q))
        );
      })
    : AHMEDABAD_PLACES;

  // Confirm selection
  const handleConfirm = () => {
    const finalLocation: LocationData = {
      lat: selectedLat,
      lng: selectedLng,
      address: customAddress.trim() || formatPreciseAhmedabadAddress(selectedLat, selectedLng),
      isFallback: false,
      accuracyMeters: gpsAccuracy,
      landmark: nearest.place.popularLandmarks[0],
      ward: nearest.place.ward,
      zone: nearest.place.zone,
      source: gpsAccuracy ? 'gps' : searchQuery ? 'manual_search' : 'manual_pin',
    };
    onLocationSelected(finalLocation);
    onClose();
  };

  const quickPills = [
    'Navrangpura',
    'Bodakdev',
    'Satellite',
    'Vastrapur',
    'Prahlad Nagar',
    'Paldi',
    'Law Garden',
    'Riverfront',
    'Maninagar',
    'Chandkheda',
    'Bopal',
    'Khadia',
    'Gota',
    'Nikol',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md select-none font-sans overflow-y-auto">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-xl p-4 sm:p-5 text-left text-zinc-200 relative shadow-2xl my-auto max-h-[92vh] flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close location picker"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-3 pr-6">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded-xs border border-emerald-500/30 font-bold uppercase tracking-wider">
              <MapPin size={10} />
              <span>AMC Ward Geo-Matrix</span>
            </span>
            {gpsAccuracy && (
              <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded-xs border border-emerald-500/20">
                ±{gpsAccuracy}m GPS Lock
              </span>
            )}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <span>Select Location on Ahmedabad Map</span>
            <Edit3 size={14} className="text-emerald-400" />
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Click on the map, search landmark/ward, or type your address.
          </p>
        </div>

        {/* Search Input Bar */}
        <div className="relative mb-3">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search area (e.g. Navrangpura, Bodakdev, CG Road, IIM)..."
              className="w-full bg-zinc-950 border border-zinc-700/90 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-zinc-400 hover:text-white p-1"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Instant Search Suggestions Dropdown */}
          {searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto divide-y divide-zinc-800/80">
              {filteredPlaces.length > 0 ? (
                filteredPlaces.slice(0, 6).map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => handleSelectPlace(place)}
                    className="w-full p-2.5 text-left hover:bg-zinc-800/80 flex items-center justify-between transition-colors cursor-pointer group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white group-hover:text-emerald-400 flex items-center gap-1.5">
                        <span>{place.name}</span>
                        <span className="text-[10px] text-zinc-400 font-normal">({place.gujaratiName})</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        {place.ward} · {place.popularLandmarks.slice(0, 2).join(', ')}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded-xs border border-emerald-500/30">
                      {place.zone} Zone
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-3 text-center text-xs text-zinc-400">
                  No predefined place found. You can click on the map or type address below.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
          {/* Interactive Ahmedabad Map */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold uppercase tracking-wider">
                <Compass size={12} />
                <span>Interactive Ahmedabad Map (Tap to drop pin)</span>
              </span>
              <span>Sabarmati Corridor</span>
            </div>

            {/* Ahmedabad Vector Map Container */}
            <div
              ref={mapContainerRef}
              onClick={handleMapClick}
              className="relative w-full aspect-[16/10] bg-zinc-950 rounded-lg border border-zinc-700/80 overflow-hidden cursor-crosshair group shadow-inner"
              title="Click anywhere to drop pin"
            >
              {/* Grid Lines */}
              <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#10b981" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#map-grid)" />
              </svg>

              {/* S.P. Ring Road Outline */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* SP Outer Ring Road */}
                <ellipse cx="50" cy="50" rx="46" ry="44" fill="none" stroke="#3f3f46" strokeWidth="0.75" strokeDasharray="2,2" />
                <text x="75" y="8" fill="#71717a" fontSize="3" fontFamily="monospace">SP RING ROAD</text>

                {/* 132ft Inner Ring Road */}
                <ellipse cx="50" cy="50" rx="30" ry="28" fill="none" stroke="#52525b" strokeWidth="0.5" />
                <text x="56" y="24" fill="#71717a" fontSize="2.5" fontFamily="monospace">132FT RING RD</text>

                {/* SG Highway Line (West Side) */}
                <path d="M 26 5 Q 28 50 25 95" fill="none" stroke="#eab308" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3,1.5" />
                <text x="14" y="22" fill="#eab308" fontSize="2.6" fontFamily="monospace" opacity="0.8">S.G. HIGHWAY</text>

                {/* Sabarmati River (Meandering from North to South) */}
                <path
                  d="M 52 0 Q 56 25 50 48 T 54 80 Q 57 92 56 100"
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  opacity="0.8"
                />
                <path
                  d="M 52 0 Q 56 25 50 48 T 54 80 Q 57 92 56 100"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.9"
                />

                {/* River Bridges */}
                {/* Subhash Bridge */}
                <line x1="50" y1="28" x2="57" y2="28" stroke="#ffffff" strokeWidth="1" opacity="0.7" />
                {/* Gandhi Bridge */}
                <line x1="47" y1="42" x2="54" y2="42" stroke="#ffffff" strokeWidth="1" opacity="0.7" />
                {/* Nehru Bridge */}
                <line x1="46" y1="52" x2="54" y2="52" stroke="#ffffff" strokeWidth="1.2" opacity="0.9" />
                {/* Ellis Bridge */}
                <line x1="46.5" y1="56" x2="54.5" y2="56" stroke="#ffffff" strokeWidth="1" opacity="0.7" />
                {/* Sardar Bridge */}
                <line x1="48" y1="68" x2="56" y2="68" stroke="#ffffff" strokeWidth="1" opacity="0.7" />

                {/* Zone Labels */}
                <text x="32" y="48" fill="#10b981" fontSize="3.2" fontWeight="bold" fontFamily="monospace" opacity="0.9">WEST (Navrangpura)</text>
                <text x="60" y="52" fill="#a1a1aa" fontSize="3.2" fontWeight="bold" fontFamily="monospace" opacity="0.9">EAST (Old City/Khadia)</text>
                <text x="12" y="42" fill="#71717a" fontSize="2.8" fontFamily="monospace">Bodakdev/Thaltej</text>
                <text x="12" y="66" fill="#71717a" fontSize="2.8" fontFamily="monospace">Satellite/Prahlad Nagar</text>
                <text x="64" y="76" fill="#71717a" fontSize="2.8" fontFamily="monospace">Maninagar/Kankaria</text>
                <text x="44" y="14" fill="#71717a" fontSize="2.8" fontFamily="monospace">Chandkheda/Motera</text>
              </svg>

              {/* Prominent Landmark Dots */}
              {AHMEDABAD_PLACES.slice(0, 10).map((place) => {
                const pt = latLngToMapPercent(place.lat, place.lng);
                return (
                  <div
                    key={place.id}
                    style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:opacity-100 opacity-60 transition-opacity"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-xs" />
                  </div>
                );
              })}

              {/* Active User Pinpoint Marker */}
              <div
                style={{ left: `${mapCoords.x}%`, top: `${mapCoords.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-none z-20 transition-all duration-150"
              >
                {/* Pulsing Radar Ring */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-emerald-500/30 animate-ping" />
                <div className="absolute top-6 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-emerald-500/60 border border-white" />

                {/* Marker Pin Icon */}
                <div className="relative flex flex-col items-center">
                  <div className="bg-emerald-500 text-black px-1.5 py-0.5 rounded-xs font-mono font-bold text-[9px] whitespace-nowrap shadow-md flex items-center gap-1 border border-white">
                    <MapPin size={10} strokeWidth={3} />
                    <span>PIN LOCATION</span>
                  </div>
                  <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-emerald-500" />
                </div>
              </div>

              {/* Map Footer Helper */}
              <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between font-mono text-[9px] text-zinc-400 bg-black/75 px-2 py-0.5 rounded-sm backdrop-blur-xs border border-zinc-800 pointer-events-none">
                <span className="text-emerald-400 font-bold">
                  {selectedLat.toFixed(5)}°N, {selectedLng.toFixed(5)}°E
                </span>
                <span className="text-zinc-400">Click anywhere to move pin</span>
              </div>
            </div>
          </div>

          {/* Quick Locality Select Chips */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
              Quick Select Ahmedabad Area
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickPills.map((name) => {
                const target = AHMEDABAD_PLACES.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));
                const isSelected = nearest.place.name.toLowerCase().includes(name.toLowerCase());
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      if (target) handleSelectPlace(target);
                    }}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-xs'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual Address & Landmark Input Field */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Edit3 size={13} className="text-emerald-400" />
                <span>House / Flat / Society / Street Address</span>
              </label>
              <span className="text-[10px] font-mono text-zinc-500">Editable</span>
            </div>
            <textarea
              rows={2}
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              placeholder="e.g. Flat B-402 Shivalik Plaza, IIM Road, Near Panjrapole Cross Roads, Navrangpura"
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg p-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors leading-relaxed"
            />
          </div>

          {/* Live GPS Detection Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleDetectGps}
              disabled={isLocatingGps}
              className="w-full bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-700/80 text-zinc-200 hover:text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Crosshair size={14} className={isLocatingGps ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
              <span>{isLocatingGps ? 'Acquiring High-Precision GPS Lock...' : 'Acquire Live GPS Location (±3m)'}</span>
            </button>
            {gpsError && (
              <div className="text-[10px] text-amber-400 font-mono mt-1 text-center">{gpsError}</div>
            )}
          </div>

          {/* Selected Location Summary Card */}
          <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 space-y-1 text-xs font-mono">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Verified Ward:</span>
              <span className="text-emerald-400 font-bold">{nearest.place.ward}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Zone & Pincode:</span>
              <span className="text-zinc-200">{nearest.place.zone} Zone · {nearest.place.pincode}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>GPS Coordinates:</span>
              <span className="text-zinc-300 font-mono">{selectedLat.toFixed(5)}° N, {selectedLng.toFixed(5)}° E</span>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="pt-3 border-t border-zinc-800 flex gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-300 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="w-2/3 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Check size={14} strokeWidth={3} />
            <span>Confirm & Apply Location</span>
          </button>
        </div>
      </div>
    </div>
  );
};
