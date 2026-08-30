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
import { getWallet, BinsInfo } from './lib/api';
import { serverHandoverToRecord, serverTicketToRecord } from './lib/serverMap';
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
import { DocumentView } from './components/resident/DocumentView';
import { RewardsView } from './components/resident/RewardsView';
import { ImpactView } from './components/resident/ImpactView';
import { KarmachariView } from './components/karmachari/KarmachariView';
import { WardOfficerView } from './components/officer/WardOfficerView';

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

  // Server-backed reward costs (fallback to nothing until the wallet call returns)
  const [redeemCosts, setRedeemCosts] = useState<Record<string, number>>({});

  const currentTheme: AppTheme = settings.theme || 'light';

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

  // Load app data. The resident wallet (balance + handover history) is served by the
  // backend (Phase 2); rewards/tickets, karmachari and officer screens still read the
  // local seed and migrate in Phase 3.
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
        }
      } catch (e) {
        console.warn('Wallet API unavailable — showing local state only.', e);
      }

      setHousehold(mergedHousehold);
      setHandovers(mergedHandovers);
      setTickets(mergedTickets);
      setKarmachari(karm);
      setWardStats(ward);
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
    <div className="min-h-screen bg-ink text-tint flex flex-col items-center justify-start antialiased">
      {/* 390px Mobile Viewport Container */}
      <div className="w-full max-w-md min-h-screen flex flex-col bg-ink relative border-x border-ink-soft/40 shadow-2xl">
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
              {activeRole === 'resident' && (
                <>
                  {residentTab === 'wallet' && (
                    <WalletView
                      household={activeHousehold}
                      handovers={handovers}
                      bins={bins}
                      onOpenBinSetup={() => setBinModalOpen(true)}
                      onNavigateToDocument={() => setResidentTab('document')}
                      onSelectHandover={(h) => setSelectedHandover(h)}
                    />
                  )}

                  {residentTab === 'document' && (
                    <DocumentView
                      household={activeHousehold}
                      handovers={handovers}
                      aiOverride={settings.aiOutcomeOverride}
                      onRefreshData={loadData}
                      onCancel={() => setResidentTab('wallet')}
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
                <KarmachariView
                  karmachari={karmachari}
                  handovers={handovers}
                  onRefreshData={loadData}
                />
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
        <div className={inApp && activeRole === 'resident' ? 'mb-14' : ''}>
          <InstallAppFooter />
        </div>

        {/* Resident Bottom Nav */}
        {inApp && activeRole === 'resident' && (
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

