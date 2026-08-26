import React, { useState } from 'react';
import { Role, AppTheme } from '../types';
import { Settings, LogIn, LogOut, RefreshCw, User, Shield, ChevronDown, Sun, Moon } from 'lucide-react';
import { SafaiSevaLogo } from './SafaiSevaLogo';
import { useAuth } from '../lib/authContext';

interface RoleSwitcherProps {
  currentRole: Role | null;
  onRoleChange: (role: Role) => void;
  onOpenSettings: () => void;
  onOpenRoleModal: () => void;
  currentTheme?: AppTheme;
  onToggleTheme?: () => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  currentRole,
  onRoleChange,
  onOpenSettings,
  onOpenRoleModal,
  currentTheme = 'dark',
  onToggleTheme,
}) => {
  const { isSignedIn, user, signOut, signIn, openSignInModal, hasClerkKey } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLoginClick = () => {
    if (hasClerkKey) {
      openSignInModal();
    } else {
      signIn();
    }
  };

  const getRoleLabel = (r: Role | null) => {
    if (r === 'resident') return { label: 'Resident', color: 'text-emerald-400 bg-emerald-950/80 border-emerald-800/70', dot: 'bg-emerald-400' };
    if (r === 'karmachari') return { label: 'Karmachari', color: 'text-amber-400 bg-amber-950/80 border-amber-800/70', dot: 'bg-amber-400' };
    if (r === 'officer') return { label: 'Ward Officer', color: 'text-blue-400 bg-blue-950/80 border-blue-800/70', dot: 'bg-blue-400' };
    return { label: 'Select Role', color: 'text-zinc-400 bg-zinc-900 border-zinc-800', dot: 'bg-zinc-500' };
  };

  const roleInfo = getRoleLabel(currentRole);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#08080a]/95 backdrop-blur-md border-b border-zinc-800/80 select-none transition-colors">
      <div className="max-w-md mx-auto px-3.5 py-2.5 flex items-center justify-between gap-2">
        {/* Brand with SafaiSeva Logo & Live State */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center justify-center">
            <SafaiSevaLogo size={22} className="text-emerald-500" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-mono text-xs font-bold tracking-wider text-white">
              SafaiSeva
            </span>
            <span className="text-[9px] font-mono text-emerald-500 font-semibold tracking-tight">
              AMC CIVIC EDGE
            </span>
          </div>
        </div>

        {/* Right Controls: Theme toggle, Login / Role & Profile, Settings */}
        <div className="flex items-center gap-1.5">
          {/* Quick Light/Dark Mode Toggle */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg transition-colors border border-transparent hover:border-zinc-700/60 cursor-pointer"
            >
              {currentTheme === 'dark' ? (
                <Sun size={15} className="text-amber-400 hover:rotate-45 transition-transform" />
              ) : (
                <Moon size={15} className="text-indigo-500 hover:-rotate-12 transition-transform" />
              )}
            </button>
          )}

          {!isSignedIn ? (
            /* Logged Out State: Prominent Login Button */
            <button
              onClick={handleLoginClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-xs cursor-pointer"
            >
              <LogIn size={13} />
              <span>Login</span>
            </button>
          ) : (
            /* Logged In State: Role Badge with Switch Action + Profile Menu */
            <div className="flex items-center gap-1.5">
              {/* Role Badge / Switcher Button */}
              <button
                onClick={onOpenRoleModal}
                title="Click to switch role"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all hover:brightness-105 cursor-pointer ${roleInfo.color}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${roleInfo.dot}`} />
                <span>{roleInfo.label}</span>
                <RefreshCw size={11} className="opacity-70 ml-0.5 hover:rotate-180 transition-transform" />
              </button>

              {/* User Profile / Sign Out Trigger */}
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 hover:border-emerald-500 text-white text-xs flex items-center justify-center font-medium transition-colors cursor-pointer"
                  title={user?.fullName || 'User Profile'}
                >
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span>{user?.firstName?.[0] || user?.fullName?.[0] || 'U'}</span>
                  )}
                </button>

                {/* Profile Popup Menu */}
                {showProfileMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowProfileMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl p-2 shadow-2xl z-50 text-left animate-fade-in">
                      <div className="px-2 py-1.5 border-b border-zinc-800 mb-1">
                        <div className="text-xs font-semibold text-white truncate">
                          {user?.fullName || 'Citizen User'}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {user?.primaryEmail}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onOpenRoleModal();
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw size={13} className="text-emerald-400" />
                        <span>Switch Role</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          signOut();
                        }}
                        className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg flex items-center gap-2 mt-1 cursor-pointer"
                      >
                        <LogOut size={13} />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            aria-label="Open Demo Settings"
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/60 rounded-lg transition-colors border border-transparent hover:border-zinc-700/60 cursor-pointer"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};

