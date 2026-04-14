import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'trainer';
  photoURL?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
  invitedEmails: string[];
  addInvite: (email: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initial invited emails (whitelist)
const INITIAL_INVITES = [
  'quinnledak@vastasports.com', // The owner/admin
  'alex@vasta.com',
  'sarah@vasta.com',
  'mike@vasta.com',
  'emma@vasta.com'
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitedEmails, setInvitedEmails] = useState<string[]>(INITIAL_INVITES);

  useEffect(() => {
    // Check local storage for existing session
    const savedUser = localStorage.getItem('vasta_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email: string) => {
    setLoading(true);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    if (invitedEmails.includes(email.toLowerCase())) {
      const mockUser: User = {
        id: email === 'quinnledak@vastasports.com' ? 'admin-1' : `user-${Date.now()}`,
        name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1),
        email: email.toLowerCase(),
        role: email === 'quinnledak@vastasports.com' ? 'admin' : 'trainer',
        photoURL: `https://picsum.photos/seed/${email}/100/100`
      };
      setUser(mockUser);
      localStorage.setItem('vasta_user', JSON.stringify(mockUser));
      toast.success('Successfully signed in');
    } else {
      toast.error('Access Denied: You have not been invited to this team.');
      throw new Error('Not invited');
    }
    setLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('vasta_user');
    toast.info('Signed out');
  };

  const addInvite = (email: string) => {
    if (!invitedEmails.includes(email.toLowerCase())) {
      setInvitedEmails(prev => [...prev, email.toLowerCase()]);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, invitedEmails, addInvite }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
