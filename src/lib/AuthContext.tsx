import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
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
  login: () => Promise<void>;
  logout: () => Promise<void>;
  addInvite: (email: string, role: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await handleUserSync(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUserSync = async (firebaseUser: FirebaseUser) => {
    try {
      // 1. Check if user exists in our 'users' collection
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      
      if (userDoc.exists()) {
        setUser(userDoc.data() as User);
      } else {
        // 2. If not, check if they are invited
        const inviteDoc = await getDoc(doc(db, 'invites', firebaseUser.email?.toLowerCase() || ''));
        
        // Special case for the owner
        const isOwner = firebaseUser.email === 'quinnledak@vastasports.com';

        if (inviteDoc.exists() || isOwner) {
          const role = isOwner ? 'admin' : (inviteDoc.data()?.role || 'trainer');
          const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'Team Member',
            email: firebaseUser.email || '',
            role: role as 'admin' | 'trainer',
            photoURL: firebaseUser.photoURL || undefined
          };
          
          await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
          setUser(newUser);
          
          if (inviteDoc.exists()) {
            await deleteDoc(doc(db, 'invites', firebaseUser.email!.toLowerCase()));
          }
        } else {
          // Not invited
          await signOut(auth);
          toast.error('Access Denied: You have not been invited to this team.');
        }
      }
    } catch (error) {
      console.error('Error syncing user:', error);
      toast.error('Authentication error. Please try again.');
    }
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Successfully signed in');
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to sign in with Google');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      toast.info('Signed out');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  const addInvite = async (email: string, role: string) => {
    try {
      await setDoc(doc(db, 'invites', email.toLowerCase()), {
        email: email.toLowerCase(),
        role,
        invitedBy: user?.id,
        invitedByName: user?.name,
        sentAt: new Date().toISOString(),
        status: 'pending'
      });
      toast.success(`Invitation sent to ${email}`);
    } catch (error) {
      console.error('Invite error:', error);
      toast.error('Failed to send invitation');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, addInvite }}>
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
