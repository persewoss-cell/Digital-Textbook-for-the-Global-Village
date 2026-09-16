import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "@/firebase";
import { watchUser } from "@/lib/firestore";
import type { UserDoc } from "@/types";

interface AuthState {
  firebaseUser: FirebaseUser | null;
  userDoc: UserDoc | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  firebaseUser: null,
  userDoc: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      if (!u) {
        setUserDoc(null);
        setLoading(false);
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoading(true);
    const unsub = watchUser(firebaseUser.uid, (doc) => {
      setUserDoc(doc);
      setLoading(false);
    });
    return unsub;
  }, [firebaseUser]);

  const value = useMemo(
    () => ({ firebaseUser, userDoc, loading }),
    [firebaseUser, userDoc, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
