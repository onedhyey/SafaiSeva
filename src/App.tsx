import React, { useState, useEffect, useCallback } from 'react';
import {
  Role,
  HouseholdProfile,
  HandoverRecord,
  TicketRecord,
  KarmachariProfile,
  WardStats,
  DemoSettings,
  DemoOutcomeOverride,
  AppTheme,
} from './types';
import {
  getHouseholdProfile,
  getHandovers,
  getTickets,
  getKarmachariProfile,
  getWardStats,
  getDemoSettings,
  saveDemoSettings,
  resetDatabase,
} from './lib/db';
import { useAuth } from './lib/authContext';
import {
  getWallet,
  getOfficerDashboard,
  getOfficerAnomalies,
  getWardLeaderboard,
  getWorkerProfile,
  BinsInfo,
} from './lib/api';
import { serverHandoverToRecord, serverTicketToRecord } from './lib/serverMap';
import { useOnline } from './lib/useOnline';
import {
  listQueue,
  flushQueue,
  removeFromQueue,
  QueuedCapture,
} from './lib/offlineQueue';
import { BinSetupModal } from './components/resident/BinSetupModal';
import { RoleSwitcher } from './components/RoleSwitcher';
import { BottomNav, ResidentTab } from './components/BottomNav';
import { InstallAppFooter } from './components/InstallAppFooter';
import { SettingsModal } from './components/SettingsModal';
import { TicketModal } from './components/TicketModal';
import { HandoverDetailModal } from './components/HandoverDetailModal';
import { LoginView } from './components/auth/LoginView';
import { RoleSelectionModal } from './components/auth/RoleSelectionModal';
import { WalletView } from './components/resident/WalletView';
import { HouseholdSetupView } from './components/resident/HouseholdSetupView';
import { DocumentView } from './components/resident/DocumentView';
import { RewardsView } from './components/resident/RewardsView';
import { ImpactView } from './components/resident/ImpactView';
import { KarmachariView } from './components/karmachari/KarmachariView';
import { WardOfficerView } from './components/officer/WardOfficerView';
import { OutboxView } from './components/resident/OutboxView';

export default function App() {
  const { isSignedIn, selectedRole, setSelectedRole, user, authEnabled, authGate } = useAuth();
  const [residentTab, setResidentTab] = useState<ResidentTab>('wallet');
  const [loading, setLoading] = useState<boolean>(true);

  // Core App State
  const [household, setHousehold] = useState<HouseholdProfile | null>(null);
  const [handovers, setHandovers] = useState<HandoverRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [karmachari, setKarmachari] = useState<KarmachariProfile | null>(null);
  const [wardStats, setWardStats] = useState<WardStats | null>(null);
  const [settings, setSettings] = useState<DemoSettings>({
    aiOutcomeOverride: 'auto',
    simulateOffline: false,
    theme: 'light',
  });

  // Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [selectedHandover, setSelectedHandover] = useState<HandoverRecord | null>(null);

  // Bin onboarding (audit P1)
  const [bins, setBins] = useState<BinsInfo | null>(null);
  const [binModalOpen, setBinModalOpen] = useState<boolean>(false);

  // Auth-on path: a signed-in resident with no household yet must create or join one.
  const [needsHousehold, setNeedsHousehold] = useState<boolean>(false);

  // Server-backed reward costs (fallback to nothing until the wallet call returns)
  const [redeemCosts, setRedeemCosts] = useState<Record<string, number>>({});

  // Offline capture queue (audit P6 / T3.1)
  const browserOnline = useOnline();
  const [queueItems, setQueueItems] = useState<QueuedCapture[]>([]);
  // What DocumentView / the Outbox treat as "can't reach the server right now".
  const effectiveOffline = !browserOnline || settings.simulateOffline;

  const currentTheme: AppTheme = settings.theme || 'light';

  const refreshQueue = useCallback(async () => {
    try {
      setQueueItems(await listQueue());
    } catch {
      /* IndexedDB unavailable — leave the last known list */
    }
  }, []);

  // Send everything queued. Returns how many were accepted so the caller can decide
  // whether to refresh the wallet. flushQueue() has its own in-flight lock, so
  // overlapping calls (e.g. React StrictMode double-invoke) are harmless no-ops.
  const runFlush = useCallback(async (): Promise<number> => {
    try {
      const outcome = await flushQueue();
      return outcome.sent.length;
    } catch (e) {
      console.warn('Offline queue flush failed:', e);
      return 0;
    } finally {
      await refreshQueue();
    }
  }, [refreshQueue]);

  // Synchronize theme to document body & root html
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    }
  }, [currentTheme]);

  // Load app data. Wallet, karmachari console, ward officer dashboard, and the resident
  // leaderboard are all backend-served now; `src/lib/seed.ts` is only the offline
  // fallback each of those falls back to if its API call fails.
  const loadData = useCallback(async () => {
    try {
      const [hh, hnds, tkts, karm, ward, sett] = await Promise.all([
        getHouseholdProfile(),
        getHandovers(),
        getTickets(),
        getKarmachariProfile(),
        getWardStats(),
        getDemoSettings(),
      ]);

      let mergedHousehold = hh;
      let mergedHandovers = hnds;
      let mergedTickets = tkts;

      try {
        const wallet = await getWallet();
        if (wallet.householdCode) {
          setNeedsHousehold(false);
          mergedHousehold = {
            ...hh,
            balance: wallet.balance,
            binCount: wallet.bins?.count ?? hh.binCount,
            binTarget: wallet.bins?.target ?? hh.binTarget,
          };
          const serverRecords = wallet.handovers.map((sh) => serverHandoverToRecord(sh, hh));
          // Server handovers for this household + seeded items for OTHER households
          // (the karmachari review queue).
          mergedHandovers = [
            ...serverRecords,
            ...hnds.filter((h) => h.householdId !== hh.id),
          ];
          mergedTickets = wallet.tickets.map(serverTicketToRecord);
          setBins(wallet.bins ?? null);
          setRedeemCosts(wallet.redeem ?? {});
          if (wallet.bins && !wallet.bins.onboarded) setBinModalOpen(true);
        } else if (authEnabled) {
          // Signed in, but not linked to a household yet — show the create/join step.
          setNeedsHousehold(true);
        }
      } catch (e) {
        console.warn('Wallet API unavailable — showing local state only.', e);
      }

      // Ward stats are backend-driven: the officer screen (schema 0015 + 0016) and the
      // resident Impact-tab leaderboard (schema 0017). The seed remains the fallback for
      // whichever call is unreachable.
      let mergedWardStats = ward;
      try {
        const [dash, anom] = await Promise.all([
          getOfficerDashboard(),
          getOfficerAnomalies(),
        ]);
        mergedWardStats = {
          ...mergedWardStats,
          wardName: dash.wardName,
          householdsEnrolled: dash.householdsEnrolled,
          participationRateThisWeek: dash.participationRateThisWeek,
          participationRateLastWeek: dash.participationRateLastWeek,
          creditsIssued: dash.creditsIssued,
          rupeeValue: dash.rupeeValue,
          aiSplit: dash.aiSplit,
          subDistricts: dash.subDistricts,
          karmacharis: dash.karmacharis,
          anomalies: anom.anomalies,
        };
      } catch (e) {
        console.warn('Officer API unavailable — using seeded ward stats.', e);
      }
      try {
        const { leaderboard } = await getWardLeaderboard();
        if (leaderboard.length) mergedWardStats = { ...mergedWardStats, leaderboard };
      } catch (e) {
        console.warn('Ward leaderboard API unavailable — using seeded leaderboard.', e);
      }

      // Karmachari header identity + today's counters (schema: workers / worker_issuances).
      let mergedKarmachari = karm;
      try {
        const wp = await getWorkerProfile();
        mergedKarmachari = {
          ...karm,
          id: wp.id,
          name: wp.name,
          workerCode: wp.workerCode,
          zone: wp.zone,
          ward: wp.ward,
          reviewsClearedToday: wp.reviewsClearedToday,
          manualCreditsIssued: wp.manualCreditsIssued,
          overrideRate: wp.overrideRate,
        };
      } catch (e) {
        console.warn('Worker profile API unavailable — using seeded karmachari.', e);
      }

      setHousehold(mergedHousehold);
      setHandovers(mergedHandovers);
      setTickets(mergedTickets);
      setKarmachari(mergedKarmachari);
      setWardStats(mergedWardStats);
      setSettings(sett);
    } catch (err) {
      console.error('Failed to load SafaiSeva state:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep the wallet fresh when the resident moves between tabs (audit F1).
  useEffect(() => {
    if (!loading) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentTab]);

  // Offline capture queue (audit P6 / T3.1): load it once, and drain it whenever the
  // effective-online state flips to true (real reconnect or the demo toggle switched off).
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (effectiveOffline) return;
    // Not abandoned on cleanup: App never unmounts, the flush must run to completion,
    // and flushQueue()'s own lock makes a duplicate invocation a no-op.
    (async () => {
      if ((await listQueue()).length === 0) return;
      const sent = await runFlush();
      if (sent > 0) await loadData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveOffline]);

  // Handle Role Switch
  const handleRoleChange = (newRole: Role) => {
    setSelectedRole(newRole);
  };

  // Reset Demo handler
  const handleResetDemo = async () => {
    await resetDatabase();
    await loadData();
    setResidentTab('wallet');
  };

  // Update AI override
  const handleUpdateOverride = async (override: DemoOutcomeOverride) => {
    const updated = { ...settings, aiOutcomeOverride: override };
    setSettings(updated);
    await saveDemoSettings(updated);
  };

  // Update Theme Mode
  const handleUpdateTheme = async (newTheme: AppTheme) => {
    const updated = { ...settings, theme: newTheme };
    setSettings(updated);
    await saveDemoSettings(updated);
  };

  // Demo: force the app offline so the capture queue can be shown (T3.1). Turning it
  // back off lets the auto-flush effect drain whatever was queued.
  const handleToggleOffline = async (value: boolean) => {
    const updated = { ...settings, simulateOffline: value };
    setSettings(updated);
    await saveDemoSettings(updated);
  };

  // Mark ticket used
  const handleMarkTicketUsed = async (ticketId: string) => {
    const updatedTickets = tickets.map((t) =>
      t.id === ticketId ? { ...t, status: 'used' as const } : t
    );
    setTickets(updatedTickets);
  };

  if (loading || !household || !karmachari || !wardStats) {
    return (
      <div className="min-h-screen bg-ink text-tint flex flex-col items-center justify-center p-4">
        <div className="w-6 h-6 rounded-full border-2 border-green border-t-transparent animate-spin mb-3" />
        <div className="font-mono text-xs text-muted-l">Loading SafaiSeva AMC Registry...</div>
      </div>
    );
  }

  // Active display household adapting with logged in user name if available
  const activeHousehold: HouseholdProfile = {
    ...household,
    name: user?.fullName || household.name,
    // Rides taken = transit tickets that have been redeemed and boarded.
    ridesTaken: tickets.filter((t) => t.status === 'used').length,
  };

  const activeRole: Role = selectedRole || 'resident';

  // --- Gate ordering -------------------------------------------------------------------
  // In the open demo (authEnabled=false) both checks pass through and the app renders
  // immediately. When auth is enabled, `authGate` decides whether the sign-in screen
  // comes before or after role selection. Everything downstream keys off `gateScreen`.
  const needsAuth = authEnabled && !isSignedIn;
  const needsRole = !selectedRole;
  let gateScreen: 'auth' | 'role' | null = null;
  if (authGate === 'after_role') {
    if (needsRole) gateScreen = 'role';
    else if (needsAuth) gateScreen = 'auth';
  } else {
    if (needsAuth) gateScreen = 'auth';
    else if (needsRole) gateScreen = 'role';
  }
  const inApp = gateScreen === null;

  return (
    <div className="demo-stage min-h-screen bg-ink text-tint flex flex-col items-center justify-start lg:justify-center antialiased">
      {/* Mobile viewport container. On wide screens it becomes a device on a stage
          (see .demo-frame in index.css) so the demo reads as a real phone product. */}
      <div className="demo-frame w-full max-w-md min-h-screen lg:min-h-0 lg:h-[860px] lg:max-h-[88vh] flex flex-col bg-ink relative border-x border-ink-soft/40 shadow-2xl lg:overflow-hidden">
        {/* Persistent Top Header with Auth & Role state */}
        <RoleSwitcher
          currentRole={selectedRole}
          onRoleChange={handleRoleChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenRoleModal={() => setIsRoleModalOpen(true)}
          currentTheme={currentTheme}
          onToggleTheme={() => handleUpdateTheme(currentTheme === 'dark' ? 'light' : 'dark')}
        />

        {/* Main Content Area */}
        <main className="flex-1 px-4 py-3 overflow-y-auto flex flex-col">
          {gateScreen === 'auth' ? (
            /* Auth gateway (only reachable when VITE_AUTH_ENABLED=true) */
            <LoginView />
          ) : gateScreen === 'role' ? (
            /* Role gateway — the RoleSelectionModal below is forced open over this */
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-6">
              <div className="w-10 h-10 rounded-xl bg-green/15 border border-green/40" />
              <h1 className="text-sm font-semibold text-white">Choose how you'll use SafaiSeva</h1>
              <p className="text-xs text-muted-l max-w-xs">
                Select whether you are a resident, a karmachari, or a ward officer to continue.
              </p>
            </div>
          ) : (
            /* In the app: role-specific screens */
            <>
              {/* RESIDENT VIEWS */}
              {activeRole === 'resident' && needsHousehold && (
                <HouseholdSetupView
                  onLinked={async () => {
                    setNeedsHousehold(false);
                    await loadData();
                  }}
                />
              )}

              {activeRole === 'resident' && !needsHousehold && (
                <>
                  {residentTab === 'wallet' && (
                    <WalletView
                      household={activeHousehold}
                      handovers={handovers}
                      bins={bins}
                      outboxCount={queueItems.length}
                      offline={effectiveOffline}
                      onOpenBinSetup={() => setBinModalOpen(true)}
                      onNavigateToDocument={() => setResidentTab('document')}
                      onNavigateToOutbox={() => setResidentTab('outbox')}
                      onSelectHandover={(h) => setSelectedHandover(h)}
                    />
                  )}

                  {residentTab === 'document' && (
                    <DocumentView
                      household={activeHousehold}
                      handovers={handovers}
                      aiOverride={settings.aiOutcomeOverride}
                      isOffline={effectiveOffline}
                      onQueued={refreshQueue}
                      onRefreshData={loadData}
                      onCancel={() => setResidentTab('wallet')}
                    />
                  )}

                  {residentTab === 'outbox' && (
                    <OutboxView
                      items={queueItems}
                      online={!effectiveOffline}
                      onBack={() => setResidentTab('wallet')}
                      onRetryAll={async () => {
                        const sent = await runFlush();
                        if (sent > 0) await loadData();
                      }}
                      onRetryOne={async () => {
                        const sent = await runFlush();
                        if (sent > 0) await loadData();
                      }}
                      onDelete={async (id) => {
                        await removeFromQueue(id);
                        await refreshQueue();
                      }}
                    />
                  )}

                  {residentTab === 'rewards' && (
                    <RewardsView
                      household={activeHousehold}
                      tickets={tickets}
                      redeemCosts={redeemCosts}
                      onOpenTicketModal={(t) => setSelectedTicket(t)}
                      onRefreshData={loadData}
                    />
                  )}

                  {residentTab === 'impact' && (
                    <ImpactView
                      household={activeHousehold}
                      wardStats={wardStats}
                      handovers={handovers}
                    />
                  )}
                </>
              )}

              {/* KARMACHARI VIEW */}
              {activeRole === 'karmachari' && (
                <KarmachariView karmachari={karmachari} onRefreshData={loadData} />
              )}

              {/* WARD OFFICER VIEW */}
              {activeRole === 'officer' && (
                <WardOfficerView
                  wardStats={wardStats}
                  handovers={handovers}
                />
              )}
            </>
          )}
        </main>

        {/* PWA Install Control Footer (Website only, hidden automatically once installed as standalone app) */}
        <div className={inApp && activeRole === 'resident' && !needsHousehold ? 'mb-14' : ''}>
          <InstallAppFooter />
        </div>

        {/* Resident Bottom Nav */}
        {inApp && activeRole === 'resident' && !needsHousehold && (
          <BottomNav
            currentTab={residentTab}
            onTabChange={(tab) => setResidentTab(tab)}
          />
        )}
      </div>

      {/* Role Selection Modal — forced open while the role gateway is active, or on a manual switch */}
      <RoleSelectionModal
        isOpen={gateScreen === 'role' || isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        canCancel={Boolean(selectedRole)}
      />

      {/* Settings / Demo Control Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        household={activeHousehold}
        aiOverride={settings.aiOutcomeOverride}
        onUpdateOverride={handleUpdateOverride}
        theme={currentTheme}
        onUpdateTheme={handleUpdateTheme}
        onResetDemo={handleResetDemo}
        simulateOffline={settings.simulateOffline}
        onToggleOffline={handleToggleOffline}
      />

      {/* Transit Ticket View Modal */}
      <TicketModal
        ticket={selectedTicket}
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onMarkUsed={handleMarkTicketUsed}
      />

      {/* Handover Detail Audit Modal */}
      <HandoverDetailModal
        handover={selectedHandover}
        isOpen={!!selectedHandover}
        onClose={() => setSelectedHandover(null)}
        onDisputed={loadData}
      />

      {/* Bin setup / onboarding (audit P1) */}
      {inApp && activeRole === 'resident' && bins && (
        <BinSetupModal
          isOpen={binModalOpen || !bins.onboarded}
          bins={bins}
          onboarding={!bins.onboarded}
          onClose={() => setBinModalOpen(false)}
          onSaved={async () => {
            setBinModalOpen(false);
            await loadData();
          }}
        />
      )}
    </div>
  );
}

