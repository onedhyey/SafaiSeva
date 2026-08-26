import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ClerkProvider, useUser, useClerk } from '@clerk/clerk-react';
import { Role } from '../types';

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
  openSignInModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

// Internal component when Clerk is available
const ClerkAuthBridge: React.FC<{
  children: ReactNode;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
}> = ({ children, selectedRole, setSelectedRole }) => {
  const { user: clerkUser, isSignedIn: clerkIsSignedIn, isLoaded } = useUser();
  const { signOut: clerkSignOut, openSignIn } = useClerk();

  const user: AuthUser | null = clerkUser
    ? {
        id: clerkUser.id,
        fullName: clerkUser.fullName || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress || 'SafaiSeva Resident',
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
    if (openSignIn) {
      openSignIn();
    }
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
        openSignInModal: handleSignIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Fallback provider when Clerk Publishable Key is not yet in .env
const LocalDevAuthProvider: React.FC<{
  children: ReactNode;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
}> = ({ children, selectedRole, setSelectedRole }) => {
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => {
    const saved = localStorage.getItem('safaiseva_auth_user');
    return Boolean(saved);
  });

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
      id: demoUser?.id || 'usr_amc_' + Math.random().toString(36).substring(2, 9),
      fullName: demoUser?.fullName || 'Aarav Patel',
      firstName: demoUser?.firstName || 'Aarav',
      primaryEmail: demoUser?.primaryEmail || 'aarav.patel@amc-resident.in',
      imageUrl: demoUser?.imageUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
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
    return (saved as Role) || null;
  });

  const setSelectedRole = (role: Role | null) => {
    setSelectedRoleState(role);
    if (role) {
      localStorage.setItem('safaiseva_selected_role', role);
    } else {
      localStorage.removeItem('safaiseva_selected_role');
    }
  };

  if (CLERK_PUBLISHABLE_KEY && CLERK_PUBLISHABLE_KEY.trim().length > 0) {
    return (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
        <ClerkAuthBridge selectedRole={selectedRole} setSelectedRole={setSelectedRole}>
          {children}
        </ClerkAuthBridge>
      </ClerkProvider>
    );
  }

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
