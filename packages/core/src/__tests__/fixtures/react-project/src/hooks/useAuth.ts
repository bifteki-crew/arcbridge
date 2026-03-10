import { useState, useEffect } from "react";

interface AuthUser {
  id: string;
  name: string;
  role: string;
}

/** Custom hook for authentication state */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate auth check
    setUser({ id: "1", name: "Test", role: "admin" });
    setLoading(false);
  }, []);

  const logout = () => {
    setUser(null);
  };

  return { user, loading, logout };
}
