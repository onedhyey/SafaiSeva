import { get, set, del } from 'idb-keyval';
import {
  HouseholdProfile,
  HandoverRecord,
  TicketRecord,
  KarmachariProfile,
  WardStats,
  DemoSettings,
} from '../types';
import { initialSeedData } from './seed';

const STORAGE_KEYS = {
  HOUSEHOLD: 'safaispot_household_profile',
  HANDOVERS: 'safaispot_handovers_v1',
  TICKETS: 'safaispot_tickets_v1',
  KARMACHARI: 'safaispot_karmachari_v1',
  WARD_STATS: 'safaispot_ward_stats_v1',
  SETTINGS: 'safaispot_settings_v1',
  INITIALIZED: 'safaispot_initialized_v1',
};

// Safe storage wrapper (supports IndexedDB with localStorage fallback)
async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const val = await get<T>(key);
    if (val !== undefined && val !== null) return val;
    const localVal = localStorage.getItem(key);
    if (localVal) return JSON.parse(localVal);
    return fallback;
  } catch (err) {
    try {
      const localVal = localStorage.getItem(key);
      if (localVal) return JSON.parse(localVal);
    } catch {}
    return fallback;
  }
}

async function safeSet<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value);
  } catch (err) {
    console.warn('IndexedDB set failed, using localStorage fallback', err);
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function initializeDatabase(forceReset = false): Promise<void> {
  const isInitialized = await safeGet<boolean>(STORAGE_KEYS.INITIALIZED, false);
  if (!isInitialized || forceReset) {
    const seed = initialSeedData();
    await safeSet(STORAGE_KEYS.HOUSEHOLD, seed.household);
    await safeSet(STORAGE_KEYS.HANDOVERS, seed.handovers);
    await safeSet(STORAGE_KEYS.TICKETS, seed.tickets);
    await safeSet(STORAGE_KEYS.KARMACHARI, seed.karmachari);
    await safeSet(STORAGE_KEYS.WARD_STATS, seed.wardStats);
    await safeSet(STORAGE_KEYS.SETTINGS, seed.settings);
    await safeSet(STORAGE_KEYS.INITIALIZED, true);
  }
}

export async function resetDatabase(): Promise<void> {
  try {
    await del(STORAGE_KEYS.HOUSEHOLD);
    await del(STORAGE_KEYS.HANDOVERS);
    await del(STORAGE_KEYS.TICKETS);
    await del(STORAGE_KEYS.KARMACHARI);
    await del(STORAGE_KEYS.WARD_STATS);
    await del(STORAGE_KEYS.SETTINGS);
    await del(STORAGE_KEYS.INITIALIZED);
  } catch {}
  localStorage.clear();
  await initializeDatabase(true);
}

export async function getHouseholdProfile(): Promise<HouseholdProfile> {
  await initializeDatabase();
  const seed = initialSeedData();
  return safeGet<HouseholdProfile>(STORAGE_KEYS.HOUSEHOLD, seed.household);
}

export async function saveHouseholdProfile(profile: HouseholdProfile): Promise<void> {
  await safeSet(STORAGE_KEYS.HOUSEHOLD, profile);
}

export async function getHandovers(): Promise<HandoverRecord[]> {
  await initializeDatabase();
  const seed = initialSeedData();
  return safeGet<HandoverRecord[]>(STORAGE_KEYS.HANDOVERS, seed.handovers);
}

export async function saveHandovers(handovers: HandoverRecord[]): Promise<void> {
  await safeSet(STORAGE_KEYS.HANDOVERS, handovers);
}

export async function addHandover(handover: HandoverRecord): Promise<void> {
  const list = await getHandovers();
  const updated = [handover, ...list];
  await saveHandovers(updated);

  // Update household balance & stats if verified
  if (handover.status === 'verified' && handover.creditsAwarded > 0) {
    const profile = await getHouseholdProfile();
    profile.balance += handover.creditsAwarded;
    profile.streakDays += 1;
    profile.totalKgDiverted = Number((profile.totalKgDiverted + 2.8).toFixed(1));
    profile.lastHandoverDate = handover.dateString;
    await saveHouseholdProfile(profile);
  }
}

export async function updateHandover(handoverId: string, patch: Partial<HandoverRecord>): Promise<HandoverRecord | null> {
  const list = await getHandovers();
  const index = list.findIndex(h => h.id === handoverId);
  if (index === -1) return null;
  const current = list[index];
  const updated = { ...current, ...patch };
  list[index] = updated;
  await saveHandovers(list);

  // If status changed from in_review to verified and credits haven't been awarded
  if (current.status !== 'verified' && updated.status === 'verified' && updated.creditsAwarded > 0) {
    const profile = await getHouseholdProfile();
    profile.balance += updated.creditsAwarded;
    profile.totalKgDiverted = Number((profile.totalKgDiverted + 2.8).toFixed(1));
    await saveHouseholdProfile(profile);
  }
  return updated;
}

export async function getTickets(): Promise<TicketRecord[]> {
  await initializeDatabase();
  const seed = initialSeedData();
  return safeGet<TicketRecord[]>(STORAGE_KEYS.TICKETS, seed.tickets);
}

export async function saveTickets(tickets: TicketRecord[]): Promise<void> {
  await safeSet(STORAGE_KEYS.TICKETS, tickets);
}

export async function addTicket(ticket: TicketRecord): Promise<void> {
  const list = await getTickets();
  const updated = [ticket, ...list];
  await saveTickets(updated);

  const profile = await getHouseholdProfile();
  profile.balance = Math.max(0, profile.balance - ticket.creditsSpent);
  profile.ridesTaken += 1;
  await saveHouseholdProfile(profile);
}

export async function getKarmachariProfile(): Promise<KarmachariProfile> {
  await initializeDatabase();
  const seed = initialSeedData();
  return safeGet<KarmachariProfile>(STORAGE_KEYS.KARMACHARI, seed.karmachari);
}

export async function saveKarmachariProfile(profile: KarmachariProfile): Promise<void> {
  await safeSet(STORAGE_KEYS.KARMACHARI, profile);
}

export async function getWardStats(): Promise<WardStats> {
  await initializeDatabase();
  const seed = initialSeedData();
  return safeGet<WardStats>(STORAGE_KEYS.WARD_STATS, seed.wardStats);
}

export async function saveWardStats(stats: WardStats): Promise<void> {
  await safeSet(STORAGE_KEYS.WARD_STATS, stats);
}

export async function getDemoSettings(): Promise<DemoSettings> {
  await initializeDatabase();
  const seed = initialSeedData();
  return safeGet<DemoSettings>(STORAGE_KEYS.SETTINGS, seed.settings);
}

export async function saveDemoSettings(settings: DemoSettings): Promise<void> {
  await safeSet(STORAGE_KEYS.SETTINGS, settings);
}
