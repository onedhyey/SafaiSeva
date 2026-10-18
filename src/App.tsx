import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
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
  getMe,
  BinsInfo,
} from './lib/api';
import { ConsentModal } from './components/ConsentModal';
import { useI18n } from './lib/i18n';
import { UpdatePrompt } from './components/UpdatePrompt';
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
// Role screens residents never open are split out of the initial bundle.
const KarmachariView = lazy(() =>
  import('./components/karmachari/KarmachariView').then((m) => ({ default: m.KarmachariView }))
);
const WardOfficerView = lazy(() =>
  import('./components/officer/WardOfficerView').then((m) => ({ default: m.WardOfficerView }))
);
import { OutboxView } from './components/resident/OutboxView';

export default function App() {
  const { isSignedIn, selectedRole, setSelectedRole, user, authEnabled, authGate } = useAuth();
  const { t } = useI18n();
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
  // Privacy notice (audit F8): the server refuses evidence until the current version is accepted.
  const [consent, setConsent] = useState<{ required: boolean; version: string } | null>(null);
  const [consentDismissed, setConsentDismissed] = useState<boolean>(false);
  // Signed-in builds never show seeded numbers as if they were live (audit F14): on an API
  // failure they show empty values and this message instead.
  const [loadError, setLoadError] = useState<string | null>(null);

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

      // Signed-in builds without a session yet: set up the (empty) local structure the
      // screens need and make no API calls — loadData reruns once sign-in completes.
      if (authEnabled && !isSignedIn) {
        setHousehold({ ...hh, balance: 0 });
        setHandovers([]);
        setTickets([]);
        setKarmachari(karm);
        setWardStats({ ...ward, leaderboard: [], anomalies: [] });
        setSettings(sett);
        return;
      }

      // Demo builds start from the local seed; signed-in builds start empty and only ever
      // show what the server returned.
      const live = authEnabled;
      let mergedHousehold = live ? { ...hh, balance: 0 } : hh;
      let mergedHandovers = live ? [] : hnds;
      let mergedTickets = live ? [] : tkts;
      let failed = false;

      try {
        getMe()
          .then((me) => setConsent({ required: me.consentRequired, version: me.consentVersion }))
          .catch(() => setConsent(null));
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
            ...(live ? [] : hnds.filter((h) => h.householdId !== hh.id)),
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
        failed = true;
        console.warn('Wallet API unavailable.', e);
      }

      // Ward stats are backend-driven: the officer screen (schema 0015 + 0016) and the
      // resident Impact-tab leaderboard (schema 0017). The seed remains the fallback for
      // whichever call is unreachable.
      let mergedWardStats = live
        ? {
            ...ward,
            householdsEnrolled: 0,
            participationRateThisWeek: 0,
            participationRateLastWeek: 0,
            creditsIssued: 0,
            rupeeValue: 0,
            aiSplit: { approved: 0, inReview: 0, rejected: 0 },
            subDistricts: [],
            karmacharis: [],
            anomalies: [],
            leaderboard: [],
          }
        : ward;
      // Role-specific endpoints only for the role in use: a resident must not spend its
      // read budget (and log 403s) on officer / karmachari calls every tab switch.
      if (!live || selectedRole === 'officer') try {
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
        if (live) failed = true;
        console.warn('Officer API unavailable.', e);
      }
      try {
        const { leaderboard } = await getWardLeaderboard();
        if (live || leaderboard.length) mergedWardStats = { ...mergedWardStats, leaderboard };
      } catch (e) {
        console.warn('Ward leaderboard API unavailable.', e);
      }

      // Karmachari header identity + today's counters (schema: workers / worker_issuances).
      let mergedKarmachari = karm;
      if (!live || selectedRole === 'karmachari') try {
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
        if (live) failed = true;
        console.warn('Worker profile API unavailable.', e);
      }
      setLoadError(
        live && failed ? 'load.error' : null
      );

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
  }, [authEnabled, isSignedIn, selectedRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Notification taps (and links) carry ?tab=wallet|rewards|impact or ?settings=…; open
  // that screen — but never yank a resident out of an in-progress capture.
  useEffect(() => {
    const open = (raw: string) => {
      let url: URL;
      try {
        url = new URL(raw, window.location.origin);
      } catch {
        return;
      }
      const tab = url.searchParams.get('tab');
      if (tab && ['wallet', 'rewards', 'impact'].includes(tab)) {
        setResidentTab((cur) => (cur === 'document' ? cur : (tab as ResidentTab)));
      }
      if (url.searchParams.has('settings')) setIsSettingsOpen(true);
    };
    if (window.location.search) {
      open(window.location.href);
      window.history.replaceState(null, '', window.location.pathname);
    }
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-target' && typeof e.data.url === 'string') open(e.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

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
        <div className="font-mono text-xs text-muted-l">Loading SafaiSeva…</div>
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
              {loadError && (
                <div role="alert" className="mb-3 bg-amber/10 border border-amber/30 rounded-md p-3 text-[11px] text-tint flex items-center justify-between gap-2">
                  <span>{t(loadError)}</span>
                  <button
                    type="button"
                    onClick={() => loadData()}
                    className="text-[11px] font-semibold text-white bg-ink border border-muted/40 rounded-md px-2.5 min-h-[36px] cursor-pointer shrink-0"
                  >
                    {t('load.retry')}
                  </button>
                </div>
              )}

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
                <Suspense fallback={null}>
                  <KarmachariView karmachari={karmachari} onRefreshData={loadData} />
                </Suspense>
              )}

              {/* WARD OFFICER VIEW */}
              {activeRole === 'officer' && (
                <Suspense fallback={null}>
                  <WardOfficerView
                    wardStats={wardStats}
                    handovers={handovers}
                  />
                </Suspense>
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

      <UpdatePrompt />

      {/* Privacy notice — before the first submission (audit F8) */}
      {inApp && activeRole === 'resident' && consent && (
        <ConsentModal
          // Dismissable, but it comes back whenever the resident opens the capture screen.
          isOpen={consent.required && (!consentDismissed || residentTab === 'document')}
          version={consent.version}
          onAccepted={() => setConsent({ ...consent, required: false })}
          onDismiss={() => {
            setConsentDismissed(true);
            if (residentTab === 'document') setResidentTab('wallet');
          }}
        />
      )}

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

