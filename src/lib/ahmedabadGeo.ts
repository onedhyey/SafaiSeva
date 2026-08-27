export interface AhmedabadPlace {
  id: string;
  name: string;
  gujaratiName: string;
  ward: string;
  zone: 'West' | 'North West' | 'South West' | 'Central' | 'North' | 'East' | 'South';
  lat: number;
  lng: number;
  pincode: string;
  type: 'ward_hub' | 'landmark' | 'transit_hub' | 'residential' | 'commercial';
  popularLandmarks: string[];
}

export const AHMEDABAD_BOUNDS = {
  minLat: 22.95,
  maxLat: 23.15,
  minLng: 72.44,
  maxLng: 72.70,
  centerLat: 23.0384,
  centerLng: 72.5592,
};

export const AHMEDABAD_PLACES: AhmedabadPlace[] = [
  {
    id: 'navrangpura-main',
    name: 'Navrangpura (Ward 12)',
    gujaratiName: 'નવરંગપુરા',
    ward: 'Ward 12 - Navrangpura',
    zone: 'West',
    lat: 23.03842,
    lng: 72.55918,
    pincode: '380009',
    type: 'ward_hub',
    popularLandmarks: ['Mithakhali Six Roads', 'Commerce Six Roads', 'Gujarat University', 'Panjrapole', 'St. Xavier\'s College Road'],
  },
  {
    id: 'cg-road',
    name: 'C.G. Road, Navrangpura',
    gujaratiName: 'સી.જી. રોડ',
    ward: 'Ward 12 - Navrangpura',
    zone: 'West',
    lat: 23.03310,
    lng: 72.55620,
    pincode: '380009',
    type: 'commercial',
    popularLandmarks: ['Municipal Market', 'Panchvati Circle', 'Giridhar Nagar', 'Super Mall'],
  },
  {
    id: 'law-garden',
    name: 'Law Garden & Ellisbridge',
    gujaratiName: 'લો ગાર્ડન',
    ward: 'Ward 12 - Navrangpura',
    zone: 'West',
    lat: 23.02380,
    lng: 72.56140,
    pincode: '380006',
    type: 'landmark',
    popularLandmarks: ['Night Market', 'GLS Campus', 'Maharashtra Society', 'Panchavati'],
  },
  {
    id: 'bodakdev-sbr',
    name: 'Bodakdev & Sindhu Bhavan',
    gujaratiName: 'બોડકદેવ',
    ward: 'Ward 08 - Bodakdev',
    zone: 'North West',
    lat: 23.04265,
    lng: 72.51134,
    pincode: '380054',
    type: 'ward_hub',
    popularLandmarks: ['Sindhu Bhavan Road', 'Pakwan Cross Road', 'Judges Bungalow Road', 'Rajpath Club'],
  },
  {
    id: 'satellite-jodhpur',
    name: 'Satellite & Jodhpur Cross Roads',
    gujaratiName: 'સેટેલાઇટ',
    ward: 'Ward 10 - Satellite & Jodhpur',
    zone: 'South West',
    lat: 23.02781,
    lng: 72.52739,
    pincode: '380015',
    type: 'ward_hub',
    popularLandmarks: ['Shivranjani Cross Roads', 'Shyamal Cross Roads', 'Mansi Circle', 'Star Bazaar', 'Ramdevnagar'],
  },
  {
    id: 'vastrapur-lake',
    name: 'Vastrapur & IIM Ahmedabad',
    gujaratiName: 'વસ્ત્રાપુર',
    ward: 'Ward 09 - Vastrapur',
    zone: 'North West',
    lat: 23.03547,
    lng: 72.52988,
    pincode: '380015',
    type: 'landmark',
    popularLandmarks: ['Vastrapur Lake Garden', 'Ahmedabad One Mall (Alpha One)', 'IIM Old/New Campus', 'Gurukul Road'],
  },
  {
    id: 'prahlad-nagar',
    name: 'Prahlad Nagar & Corporate Road',
    gujaratiName: 'પ્રહલાદ નગર',
    ward: 'Ward 14 - Prahlad Nagar',
    zone: 'South West',
    lat: 23.00762,
    lng: 72.50851,
    pincode: '380015',
    type: 'commercial',
    popularLandmarks: ['Prahlad Nagar Garden', 'Titanium City Centre', 'Corporate Road', 'Vejalpur Link'],
  },
  {
    id: 'thaltej-science-city',
    name: 'Thaltej & Science City Road',
    gujaratiName: 'થલતેજ',
    ward: 'Ward 07 - Thaltej',
    zone: 'North West',
    lat: 23.05612,
    lng: 72.51529,
    pincode: '380059',
    type: 'ward_hub',
    popularLandmarks: ['Thaltej Cross Roads', 'Science City Road', 'Hebatpur Road', 'Baghban Party Plot'],
  },
  {
    id: 'paldi-sanskar',
    name: 'Paldi & Mahalaxmi Crossroads',
    gujaratiName: 'પાલડી',
    ward: 'Ward 13 - Paldi',
    zone: 'West',
    lat: 23.01358,
    lng: 72.56247,
    pincode: '380007',
    type: 'ward_hub',
    popularLandmarks: ['Mahalaxmi Five Roads', 'Sanskar Kendra', 'Anjali Flyover', 'NID Ahmedabad', 'Fatehpura'],
  },
  {
    id: 'sabarmati-ashram',
    name: 'Sabarmati & Gandhi Ashram',
    gujaratiName: 'સાબરમતી',
    ward: 'Ward 04 - Sabarmati',
    zone: 'North',
    lat: 23.08271,
    lng: 72.58412,
    pincode: '380005',
    type: 'landmark',
    popularLandmarks: ['Sabarmati Ashram', 'Sabarmati Railway Station', 'D-Cabin', 'Torrent Power Area', 'RTO Circle'],
  },
  {
    id: 'riverfront-west',
    name: 'Sabarmati Riverfront Promenade',
    gujaratiName: 'સાબરમતી રિવરફ્રન્ટ',
    ward: 'Ward 12 - Navrangpura',
    zone: 'West',
    lat: 23.03050,
    lng: 72.57850,
    pincode: '380006',
    type: 'landmark',
    popularLandmarks: ['Riverfront Flower Park', 'Event Center', 'Subhash Bridge River Walk', 'Nehru Bridge Promenade'],
  },
  {
    id: 'maninagar-kankaria',
    name: 'Maninagar & Kankaria Lake',
    gujaratiName: 'મણિનગર',
    ward: 'Ward 18 - Maninagar',
    zone: 'South',
    lat: 22.99684,
    lng: 72.60195,
    pincode: '380008',
    type: 'ward_hub',
    popularLandmarks: ['Kankaria Lake Gate 3', 'Maninagar Railway Station', 'Rambaug Cross Road', 'Pushpakunj Circle'],
  },
  {
    id: 'chandkheda-motera',
    name: 'Chandkheda & Motera Stadium',
    gujaratiName: 'ચાંદખેડા',
    ward: 'Ward 02 - Chandkheda',
    zone: 'North',
    lat: 23.10925,
    lng: 72.58550,
    pincode: '380024',
    type: 'ward_hub',
    popularLandmarks: ['Narendra Modi Stadium', 'Visat Petrol Pump', 'ONGC Complex', 'Tragath Cross Road'],
  },
  {
    id: 'old-city-khadia',
    name: 'Khadia & Manek Chowk (Old City)',
    gujaratiName: 'ખાડિયા',
    ward: 'Ward 15 - Khadia',
    zone: 'Central',
    lat: 23.02340,
    lng: 72.59060,
    pincode: '380001',
    type: 'landmark',
    popularLandmarks: ['Manek Chowk Heritage Square', 'Raipur Darwaja', 'Bhadra Fort', 'Teen Darwaza', 'Astodia Gate'],
  },
  {
    id: 'gota-sg-highway',
    name: 'Gota & Vandematram',
    gujaratiName: 'ગોતા',
    ward: 'Ward 05 - Gota',
    zone: 'North West',
    lat: 23.10620,
    lng: 72.54010,
    pincode: '380081',
    type: 'residential',
    popularLandmarks: ['Vandematram Cross Road', 'Gota Flyover', 'Silver Star Circle', 'Ognaj Ring Road'],
  },
  {
    id: 'nikol-raspan',
    name: 'Nikol & Raspan Arcade',
    gujaratiName: 'નિકોલ',
    ward: 'Ward 21 - Nikol',
    zone: 'East',
    lat: 23.04890,
    lng: 72.67340,
    pincode: '382350',
    type: 'residential',
    popularLandmarks: ['Raspan Cross Road', 'Nikol Lake', 'Bhakti Circle', 'SP Ring Road Nikol'],
  },
  {
    id: 'bopal-south-bopal',
    name: 'Bopal & South Bopal',
    gujaratiName: 'બોપલ',
    ward: 'Ward 11 - Bopal',
    zone: 'South West',
    lat: 23.03380,
    lng: 72.46320,
    pincode: '380058',
    type: 'residential',
    popularLandmarks: ['Bopal Cross Road', 'TRP Mall', 'Gala Gymkhana Road', 'Arohi Club Road', 'SP Ring Road Bopal'],
  },
  {
    id: 'naranpura-ankur',
    name: 'Naranpura & Ankur Cross Roads',
    gujaratiName: 'નારણપુરા',
    ward: 'Ward 06 - Naranpura',
    zone: 'West',
    lat: 23.05310,
    lng: 72.55390,
    pincode: '380013',
    type: 'ward_hub',
    popularLandmarks: ['Ankur Cross Roads', 'Pragati Nagar', 'AEC Char Rasta', 'Sola Road Junction'],
  },
  {
    id: 'ghatlodia-chanakyapuri',
    name: 'Ghatlodia & Chanakyapuri',
    gujaratiName: 'ઘાટલોડિયા',
    ward: 'Ward 06 - Ghatlodia',
    zone: 'North West',
    lat: 23.06780,
    lng: 72.53580,
    pincode: '380061',
    type: 'residential',
    popularLandmarks: ['Chanakyapuri Overbridge', 'Sayona City', 'Rannapark', 'Prabhat Chowk'],
  },
  {
    id: 'sarkhej-roza',
    name: 'Sarkhej & SG Highway South',
    gujaratiName: 'સરખેજ',
    ward: 'Ward 14 - Sarkhej',
    zone: 'South West',
    lat: 22.98630,
    lng: 72.50210,
    pincode: '382210',
    type: 'landmark',
    popularLandmarks: ['Sarkhej Roza Heritage Monument', 'Sanand Cross Road', 'Ujala Circle', 'Makarba Crossing'],
  },
  {
    id: 'bapunagar-india-colony',
    name: 'Bapunagar & India Colony',
    gujaratiName: 'બાપુનગર',
    ward: 'Ward 20 - Bapunagar',
    zone: 'East',
    lat: 23.04210,
    lng: 72.63580,
    pincode: '380024',
    type: 'ward_hub',
    popularLandmarks: ['Shyam Shikhar', 'India Colony Road', 'Galaxy Cinema Circle', 'Hirabaug'],
  },
  {
    id: 'naroda-gidc',
    name: 'Naroda & Galaxy Circle',
    gujaratiName: 'નરોડા',
    ward: 'Ward 22 - Naroda',
    zone: 'East',
    lat: 23.07120,
    lng: 72.65890,
    pincode: '382330',
    type: 'ward_hub',
    popularLandmarks: ['Naroda Patiya', 'Bethak Circle', 'Naroda GIDC', 'Muthiya'],
  },
  {
    id: 'isanpur-ghodasar',
    name: 'Isanpur & Ghodasar',
    gujaratiName: 'ઇસનપુર',
    ward: 'Ward 19 - Isanpur',
    zone: 'South',
    lat: 22.98120,
    lng: 72.59840,
    pincode: '380050',
    type: 'residential',
    popularLandmarks: ['Isanpur Cross Roads', 'Smruti Mandir', 'Cadila Bridge', 'Ghodasar Canal'],
  },
  {
    id: 'shahibaug-camp',
    name: 'Shahibaug & Airport Road',
    gujaratiName: 'શાહીબાગ',
    ward: 'Ward 03 - Shahibaug',
    zone: 'North',
    lat: 23.05830,
    lng: 72.59120,
    pincode: '380004',
    type: 'ward_hub',
    popularLandmarks: ['Camp Hanuman Temple', 'Circuit House', 'Duffnala', 'Airport Circle Link', 'Police Stadium'],
  },
];

/**
 * Calculates distance in kilometers between two lat/lng coordinates (Haversine formula).
 */
export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the closest recognized Ahmedabad place from a given coordinate.
 */
export function getNearestAhmedabadPlace(lat: number, lng: number): {
  place: AhmedabadPlace;
  distanceMeters: number;
} {
  let closestPlace = AHMEDABAD_PLACES[0];
  let minDistanceKm = Infinity;

  for (const place of AHMEDABAD_PLACES) {
    const d = calculateDistanceKm(lat, lng, place.lat, place.lng);
    if (d < minDistanceKm) {
      minDistanceKm = d;
      closestPlace = place;
    }
  }

  return {
    place: closestPlace,
    distanceMeters: Math.round(minDistanceKm * 1000),
  };
}

/**
 * Formats a clean, high-precision location description string for AMC records.
 */
export function formatPreciseAhmedabadAddress(
  lat: number,
  lng: number,
  customDetail?: string,
  accuracyMeters?: number
): string {
  const { place, distanceMeters } = getNearestAhmedabadPlace(lat, lng);
  const coordTag = `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;

  if (customDetail && customDetail.trim()) {
    return `${customDetail.trim()}, ${place.name} (${coordTag})`;
  }

  if (distanceMeters < 250) {
    return `${place.name}, ${place.popularLandmarks[0] || place.ward} (${coordTag})`;
  } else {
    return `Near ${place.name} (${distanceMeters}m away), ${place.ward} (${coordTag})`;
  }
}

/**
 * Converts Latitude/Longitude to relative X, Y percentages (0% to 100%) on our Ahmedabad map SVG coordinate system.
 */
export function latLngToMapPercent(lat: number, lng: number): { x: number; y: number } {
  // Clamp inside Ahmedabad bounding box
  const clampedLat = Math.max(AHMEDABAD_BOUNDS.minLat, Math.min(AHMEDABAD_BOUNDS.maxLat, lat));
  const clampedLng = Math.max(AHMEDABAD_BOUNDS.minLng, Math.min(AHMEDABAD_BOUNDS.maxLng, lng));

  // Latitude goes from bottom (minLat) to top (maxLat), so Y is inverted: 0% is maxLat (North), 100% is minLat (South)
  const y = ((AHMEDABAD_BOUNDS.maxLat - clampedLat) / (AHMEDABAD_BOUNDS.maxLat - AHMEDABAD_BOUNDS.minLat)) * 100;

  // Longitude goes from West (minLng) to East (maxLng): 0% is minLng, 100% is maxLng
  const x = ((clampedLng - AHMEDABAD_BOUNDS.minLng) / (AHMEDABAD_BOUNDS.maxLng - AHMEDABAD_BOUNDS.minLng)) * 100;

  return {
    x: Math.max(2, Math.min(98, Number(x.toFixed(2)))),
    y: Math.max(2, Math.min(98, Number(y.toFixed(2)))),
  };
}

/**
 * Converts map click percentage X, Y (0% to 100%) to precise lat, lng coordinates in Ahmedabad.
 */
export function mapPercentToLatLng(xPercent: number, yPercent: number): { lat: number; lng: number } {
  const clampedX = Math.max(0, Math.min(100, xPercent));
  const clampedY = Math.max(0, Math.min(100, yPercent));

  const lng = AHMEDABAD_BOUNDS.minLng + (clampedX / 100) * (AHMEDABAD_BOUNDS.maxLng - AHMEDABAD_BOUNDS.minLng);
  const lat = AHMEDABAD_BOUNDS.maxLat - (clampedY / 100) * (AHMEDABAD_BOUNDS.maxLat - AHMEDABAD_BOUNDS.minLat);

  return {
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
  };
}
