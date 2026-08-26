import React from 'react';
import { Role } from '../types';
import { Settings } from 'lucide-react';
import { SafaiSevaLogo } from './SafaiSevaLogo';

interface RoleSwitcherProps {
  currentRole: Role;
  onRoleChange: (role: Role) => void;
  onOpenSettings: () => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  currentRole,
  onRoleChange,
  onOpenSettings,
}) => {
  const roles: { id: Role; label: string; sub: string }[] = [
    { id: 'resident', label: 'Resident', sub: 'નાગરિક' },
    { id: 'karmachari', label: 'Karmachari', sub: 'કર્મચારી' },
    { id: 'officer', label: 'Ward Officer', sub: 'અધિકારી' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#08080a]/95 backdrop-blur-md border-b border-zinc-800/80 select-none">
      <div className="max-w-md mx-auto px-3.5 py-2.5 flex items-center justify-between gap-2">
        {/* Brand with SafaiSeva Logo & Live State */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center justify-center">
            <SafaiSevaLogo size={22} className="text-emerald-400" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-mono text-xs font-bold tracking-wider text-white">
              SafaiSeva
            </span>
            <span className="text-[9px] font-mono text-emerald-400 font-semibold tracking-tight">
              AMC CIVIC EDGE
            </span>
          </div>
        </div>

        {/* Segmented Control */}
        <div
          role="tablist"
          aria-label="User Role Selection"
          className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800/90 shadow-inner"
        >
          {roles.map((r) => {
            const active = currentRole === r.id;
            return (
              <button
                key={r.id}
                role="tab"
                aria-selected={active}
                onClick={() => onRoleChange(r.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all text-left ${
                  active
                    ? 'bg-zinc-800 text-white font-semibold shadow-xs border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          aria-label="Open Demo Settings"
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors border border-transparent hover:border-zinc-800"
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
};
