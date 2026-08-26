import React from 'react';
import { Wallet, Camera, Ticket, BarChart3 } from 'lucide-react';

export type ResidentTab = 'wallet' | 'document' | 'rewards' | 'impact';

interface BottomNavProps {
  currentTab: ResidentTab;
  onTabChange: (tab: ResidentTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange }) => {
  const tabs: { id: ResidentTab; label: string; icon: React.ElementType }[] = [
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'document', label: 'Document', icon: Camera },
    { id: 'rewards', label: 'Rewards', icon: Ticket },
    { id: 'impact', label: 'Impact', icon: BarChart3 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#08080a]/95 backdrop-blur-lg border-t border-zinc-800/80 select-none pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto grid grid-cols-4 h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 transition-all min-h-[44px] relative ${
                active ? 'text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {active && (
                <div className="absolute top-0 w-8 h-0.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
              )}
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} className={active ? 'drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]' : ''} />
              <span className={`text-[11px] leading-none ${active ? 'text-white font-medium' : 'text-zinc-400'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
