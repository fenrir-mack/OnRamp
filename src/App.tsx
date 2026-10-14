import { useState } from "react";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  return loggedIn ? <Dashboard onLogout={() => setLoggedIn(false)} /> : <Login onLogin={() => setLoggedIn(true)} />;
}