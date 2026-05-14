import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { auth, db } from './firebase';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'trainer' | 'owner';
  location?: string;
  photoURL?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  addInvite: (email: string, role: string, location: string) => Promise<void>;
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
          const inviteData = inviteDoc.data();
          const role = isOwner ? 'admin' : (inviteData?.role || 'trainer');
          const location = isOwner ? 'Dorset Street' : (inviteData?.location || 'Dorset Street');
          
          const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'Team Member',
            email: firebaseUser.email || '',
            role: role as 'admin' | 'trainer' | 'owner',
            location: location,
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

  const addInvite = async (email: string, role: string, location: string) => {
    try {
      const emailLower = email.toLowerCase().trim();
      await setDoc(doc(db, 'invites', emailLower), {
        email: emailLower,
        role,
        location,
        invitedBy: user?.id,
        invitedByName: user?.name,
        sentAt: new Date().toISOString(),
        status: 'pending'
      });

      // Send email alert
      try {
        await addDoc(collection(db, 'mail'), {
          to: emailLower,
          message: {
            subject: 'Invitation to Join Vasta Personal Training Dashboard',
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Welcome to Vasta!</h2>
                <p>Hello,</p>
                <p><strong>${user?.name || 'An administrator'}</strong> has invited you to join the Vasta Personal Training Dashboard as a <strong>${role}</strong> for the <strong>${location}</strong> location.</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
                  <p style="margin: 5px 0;"><strong>Location:</strong> ${location}</p>
                </div>
                <p>To accept this invitation and get started, please click the button below to sign in with your Google account:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${window.location.origin}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Sign In to Vasta</a>
                </div>
                <p style="font-size: 14px; color: #64748b;">Note: You must sign in using the email address this invitation was sent to (${emailLower}).</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #94a3b8; text-align: center;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
              </div>
            `
          }
        });
      } catch (emailError) {
        console.error('Error sending invite email:', emailError);
      }

      toast.success(`Invitation sent to ${emailLower}`);
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
