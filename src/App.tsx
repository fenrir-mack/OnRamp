import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import Login, { type AuthenticatedEmployee } from "./components/Login";

export default function App() {
  const [employee, setEmployee] = useState<AuthenticatedEmployee | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) return null;
        const result = await response.json();
        return result.employee as AuthenticatedEmployee;
      })
      .then(setEmployee)
      .catch(() => setEmployee(null))
      .finally(() => setCheckingSession(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    setEmployee(null);
  }

  if (checkingSession) return <main className="grid min-h-screen place-items-center text-sm text-[#70738e]">Verificando sua sessão...</main>;
  return employee ? <Dashboard employee={employee} onLogout={logout} /> : <Login onLogin={setEmployee} />;
}
