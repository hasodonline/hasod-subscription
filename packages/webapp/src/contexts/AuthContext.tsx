/**
 * Authentication Context
 * Provides auth state and user data throughout the app
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '../firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile } from '../types/user';

interface AuthContextType {
  currentUser: User | null;
  userDoc: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userDoc: null,
  loading: true,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        // Subscribe to user document changes in Firestore
        const userRef = doc(db, 'users', user.uid);

        const unsubscribeDoc = onSnapshot(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setUserDoc({
                uid: user.uid,
                email: user.email || '',
                ...snapshot.data(),
              } as UserProfile);
            } else {
              setUserDoc({
                uid: user.uid,
                email: user.email || '',
              });
            }
            setLoading(false);
          },
          (error) => {
            console.error('Error subscribing to user document:', error);
            setUserDoc({
              uid: user.uid,
              email: user.email || '',
            });
            setLoading(false);
          }
        );

        // Return cleanup function for document subscription
        return () => {
          unsubscribeDoc();
        };
      } else {
        setUserDoc(null);
        setLoading(false);
      }
    });

    // Cleanup auth subscription
    return () => {
      unsubscribeAuth();
    };
  }, []);

  const value: AuthContextType = {
    currentUser,
    userDoc,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
