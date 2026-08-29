import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ClerkProvider, useUser, useClerk } from '@clerk/clerk-react';
import { Role } from '../types';

/**
 * Where the authentication gateway sits relative to role selection.
 * - 'before_role': sign in, THEN pick resident / karmachari / officer  (default)
 * - 'after_role' : pick a role, THEN sign in
 * Only has an effect when VITE_AUTH_ENABLED=true. Changing it is a one-line config
 * change — App.tsx reads `authGate` from context and orders the two screens accordingly.
 */
export type AuthGate = 'before_role' | 'after_role';

export interface AuthUser {
  id: string;
  fullName: string;
  firstName?: string;
  primaryEmail: string;
  imageUrl?: string;
}

interface AuthContextType {
  isSignedIn: boolean;
  user: AuthUser | null;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
  signIn: (demoUser?: Partial<AuthUser>) => void;
  signOut: () => void;
  hasClerkKey: boolean;
  isClerkConfigured: boolean;
  /** Whether real authentication is enforced. When false the app runs an open demo session. */
  authEnabled: boolean;
  /** Ordering of the auth gateway vs. role selection. Only meaningful when authEnabled. */
  authGate: AuthGate;
  openSignInModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

// Master switch. Default OFF for the public demo: everyone gets straight into the product.
// Set VITE_AUTH_ENABLED=true to require sign-in (Clerk when a key is present).
const AUTH_ENABLED =
  String(import.meta.env.VITE_AUTH_ENABLED ?? '').trim().toLowerCase() === 'true';

const AUTH_GATE: AuthGate =
  String(import.meta.env.VITE_AUTH_GATE ?? '').trim().toLowerCase() === 'after_role'
    ? 'after_role'
    : 'before_role';

const DEVICE_ID_KEY = 'safaiseva_device_id';

/**
 * Stable per-browser identifier. This is the principal the backend will treat as an
 * anonymous session; when auth is later enabled it is superseded by the Clerk user id
 * without any schema change (see users.device_id / users.clerk_user_id).
 */
function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev-ephemeral';
  }
}

export function getDeviceId(): string {
  return getOrCreateDeviceId();
}

// -------------------------------------------------------------------------------------
// Provider: open demo session (no auth). Used when VITE_AUTH_ENABLED is not "true".
// -------------------------------------------------------------------------------------
const DemoSessionProvider: React.FC<{
  children: ReactNode;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
}> = ({ children, selectedRole, setSelectedRole }) => {
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());

  const user: AuthUser = {
    id: `anon-${deviceId}`,
    fullName: 'Demo Resident',
    firstName: 'Demo',
    primaryEmail: 'demo@safaiseva.local',
  };

  return (
    <AuthContext.Provider
      value={{
        isSignedIn: true,
        user,
        selectedRole,
        setSelectedRole,
        signIn: () => {},
        // In the open demo, "sign out" just returns to the role picker.
        signOut: () => setSelectedRole(null),
        hasClerkKey: false,
        isClerkConfigured: false,
        authEnabled: false,
        authGate: AUTH_GATE,
        openSignInModal: () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// -------------------------------------------------------------------------------------
// Provider: real Clerk authentication. Used when auth is enabled AND a key is present.
// -------------------------------------------------------------------------------------
const ClerkAuthBridge: React.FC<{
  children: ReactNode;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
}> = ({ children, selectedRole, setSelectedRole }) => {
  const { user: clerkUser, isSignedIn: clerkIsSignedIn } = useUser();
  const { signOut: clerkSignOut, openSignIn } = useClerk();

  const user: AuthUser | null = clerkUser
    ? {
        id: clerkUser.id,
        fullName:
          clerkUser.fullName ||
          clerkUser.username ||
          clerkUser.primaryEmailAddress?.emailAddress ||
          'SafaiSeva Resident',
        firstName: clerkUser.firstName || 'Resident',
        primaryEmail: clerkUser.primaryEmailAddress?.emailAddress || 'user@amc.gov.in',
        imageUrl: clerkUser.imageUrl,
      }
    : null;

  const handleSignOut = async () => {
    try {
      await clerkSignOut();
      setSelectedRole(null);
      localStorage.removeItem('safaiseva_selected_role');
    } catch (e) {
      console.error('Sign out error:', e);
    }
  };

  const handleSignIn = () => {
    if (openSignIn) openSignIn();
  };

  return (
    <AuthContext.Provider
      value={{
        isSignedIn: Boolean(clerkIsSignedIn),
        user,
        selectedRole,
        setSelectedRole,
        signIn: handleSignIn,
        signOut: handleSignOut,
        hasClerkKey: true,
        isClerkConfigured: true,
        authEnabled: true,
        authGate: AUTH_GATE,
        openSignInModal: handleSignIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// -------------------------------------------------------------------------------------
// Provider: auth enabled but no Clerk key configured yet — local manual sign-in.
// -------------------------------------------------------------------------------------
const LocalDevAuthProvider: React.FC<{
  children: ReactNode;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
}> = ({ children, selectedRole, setSelectedRole }) => {
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() =>
    Boolean(localStorage.getItem('safaiseva_auth_user'))
  );

  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('safaiseva_auth_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const handleSignIn = (demoUser?: Partial<AuthUser>) => {
    const newUser: AuthUser = {
      id: demoUser?.id || 'usr_local_' + Math.random().toString(36).substring(2, 9),
      fullName: demoUser?.fullName || 'Aarav Patel',
      firstName: demoUser?.firstName || 'Aarav',
      primaryEmail: demoUser?.primaryEmail || 'aarav.patel@amc-resident.in',
      imageUrl: demoUser?.imageUrl,
    };
    setUser(newUser);
    setIsSignedIn(true);
    localStorage.setItem('safaiseva_auth_user', JSON.stringify(newUser));
  };

  const handleSignOut = () => {
    setUser(null);
    setIsSignedIn(false);
    setSelectedRole(null);
    localStorage.removeItem('safaiseva_auth_user');
    localStorage.removeItem('safaiseva_selected_role');
  };

  return (
    <AuthContext.Provider
      value={{
        isSignedIn,
        user,
        selectedRole,
        setSelectedRole,
        signIn: handleSignIn,
        signOut: handleSignOut,
        hasClerkKey: false,
        isClerkConfigured: false,
        authEnabled: true,
        authGate: AUTH_GATE,
        openSignInModal: () => handleSignIn(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedRole, setSelectedRoleState] = useState<Role | null>(() => {
    const saved = localStorage.getItem('safaiseva_selected_role');
    if (saved) return saved as Role;
    // Open demo: skip the role picker entirely and land on the resident experience.
    return AUTH_ENABLED ? null : 'resident';
  });

  const setSelectedRole = (role: Role | null) => {
    setSelectedRoleState(role);
    if (role) {
      localStorage.setItem('safaiseva_selected_role', role);
    } else {
      localStorage.removeItem('safaiseva_selected_role');
    }
  };

  // --- Open demo: no authentication at all ---
  if (!AUTH_ENABLED) {
    return (
      <DemoSessionProvider selectedRole={selectedRole} setSelectedRole={setSelectedRole}>
        {children}
      </DemoSessionProvider>
    );
  }

  // --- Auth enabled + Clerk key present ---
  if (CLERK_PUBLISHABLE_KEY.trim().length > 0) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <ClerkAuthBridge selectedRole={selectedRole} setSelectedRole={setSelectedRole}>
          {children}
        </ClerkAuthBridge>
      </ClerkProvider>
    );
  }

  // --- Auth enabled but Clerk not configured yet ---
  return (
    <LocalDevAuthProvider selectedRole={selectedRole} setSelectedRole={setSelectedRole}>
      {children}
    </LocalDevAuthProvider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
