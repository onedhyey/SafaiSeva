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
  StreamChecklist,
  LocationData,
  VerificationResult,
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
  addHandover,
  updateHandover,
} from './lib/db';
import { analyse } from './lib/verification';
import { useAuth } from './lib/authContext';
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
import { AiAnalysisView } from './components/resident/AiAnalysisView';
import { RewardsView } from './components/resident/RewardsView';
import { ImpactView } from './components/resident/ImpactView';
import { KarmachariView } from './components/karmachari/KarmachariView';
import { WardOfficerView } from './components/officer/WardOfficerView';

export default function App() {
  const { isSignedIn, selectedRole, setSelectedRole, user } = useAuth();
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
    theme: 'dark',
  });

  // Modal States
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [selectedHandover, setSelectedHandover] = useState<HandoverRecord | null>(null);

  // Active Live AI Analysis Transition State
  const [activeAnalysis, setActiveAnalysis] = useState<{
    photoUrl: string;
    streams: StreamChecklist;
    location: LocationData;
    verificationResult: VerificationResult;
    currentBalance: number;
  } | null>(null);

  const currentTheme: AppTheme = settings.theme || 'dark';

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

  // Load all app data from local persistence (IndexedDB / localStorage)
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

      setHousehold(hh);
      setHandovers(hnds);
      setTickets(tkts);
      setKarmachari(karm);
      setWardStats(ward);
      setSettings(sett);
    } catch (err) {
      console.error('Failed to load SafaiSeva database state:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Role Switch
  const handleRoleChange = (newRole: Role) => {
    setSelectedRole(newRole);
    setActiveAnalysis(null);
  };

  // Handle Resident Document Submission
  const handleDocumentSubmit = async (data: {
    photoUrl: string;
    streams: StreamChecklist;
    location: LocationData;
  }) => {
    if (!household) return;

    const previousBalance = household.balance;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Run deterministic verification engine
    const verification = await analyse({
      photo: data.photoUrl,
      streams: data.streams,
      location: data.location,
      household,
      priorHandovers: handovers,
      override: settings.aiOutcomeOverride,
      timestamp: now,
    });

    const newHandover: HandoverRecord = {
      id: `HND-NV-${dateStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`,
      householdId: household.id,
      householdName: user?.fullName || household.name,
      ward: household.ward,
      timestamp: now.toISOString(),
      dateString: dateStr,
      photoUrl: data.photoUrl,
      imageHash: verification.imageHash,
      location: data.location,
      streamsConfirmed: data.streams,
      verification,
      status: verification.status,
      creditsAwarded: verification.creditsAwarded,
      source: 'app',
    };

    // Save handover to persistence
    await addHandover(newHandover);
    await loadData();

    // Trigger AI Vision Verification Stage Screen
    setActiveAnalysis({
      photoUrl: data.photoUrl,
      streams: data.streams,
      location: data.location,
      verificationResult: verification,
      currentBalance: previousBalance,
    });
  };

  // Reset Demo handler
  const handleResetDemo = async () => {
    await resetDatabase();
    await loadData();
    setActiveAnalysis(null);
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

  return (
    <div className="min-h-screen bg-ink text-tint flex flex-col items-center justify-start antialiased">
      {/* 390px Mobile Viewport Container */}
      <div className="w-full max-w-md min-h-screen flex flex-col bg-ink relative border-x border-ink-soft/40 shadow-2xl">
        {/* Persistent Top Header with Auth & Role state */}
        <RoleSwitcher
          currentRole={isSignedIn ? selectedRole : null}
          onRoleChange={handleRoleChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenRoleModal={() => setIsRoleModalOpen(true)}
          currentTheme={currentTheme}
          onToggleTheme={() => handleUpdateTheme(currentTheme === 'dark' ? 'light' : 'dark')}
        />

        {/* Main Content Area */}
        <main className="flex-1 px-4 py-3 overflow-y-auto flex flex-col">
          {!isSignedIn ? (
            /* Logged Out: Welcome & Login Portal */
            <LoginView />
          ) : (
            /* Logged In: Role-specific screens */
            <>
              {/* Active AI Analysis View Overlay if submitting */}
              {activeRole === 'resident' && activeAnalysis ? (
                <AiAnalysisView
                  photoUrl={activeAnalysis.photoUrl}
                  streams={activeAnalysis.streams}
                  location={activeAnalysis.location}
                  verificationResult={activeAnalysis.verificationResult}
                  currentBalance={activeAnalysis.currentBalance}
                  onComplete={() => {
                    setActiveAnalysis(null);
                    setResidentTab('wallet');
                  }}
                />
              ) : (
                <>
                  {/* RESIDENT VIEWS */}
                  {activeRole === 'resident' && (
                    <>
                      {residentTab === 'wallet' && (
                        <WalletView
                          household={activeHousehold}
                          handovers={handovers}
                          onNavigateToDocument={() => setResidentTab('document')}
                          onSelectHandover={(h) => setSelectedHandover(h)}
                        />
                      )}

                      {residentTab === 'document' && (
                        <DocumentView
                          household={activeHousehold}
                          onSubmit={handleDocumentSubmit}
                          onCancel={() => setResidentTab('wallet')}
                        />
                      )}

                      {residentTab === 'rewards' && (
                        <RewardsView
                          household={activeHousehold}
                          tickets={tickets}
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
            </>
          )}
        </main>

        {/* Persistent PWA Install Control Footer (only when authenticated) */}
        {isSignedIn && (
          <div className={activeRole === 'resident' && !activeAnalysis ? 'mb-14' : ''}>
            <InstallAppFooter />
          </div>
        )}

        {/* Resident Bottom Nav (only on resident role when authenticated and not in live analysis) */}
        {isSignedIn && activeRole === 'resident' && !activeAnalysis && (
          <BottomNav
            currentTab={residentTab}
            onTabChange={(tab) => setResidentTab(tab)}
          />
        )}
      </div>

      {/* Post-Auth Role Selection Modal (shown automatically when signed in with no role, or on manual switch) */}
      <RoleSelectionModal
        isOpen={isSignedIn && (!selectedRole || isRoleModalOpen)}
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
    </div>
  );
}

