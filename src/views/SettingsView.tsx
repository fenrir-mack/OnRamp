import { useState } from "react";
import type { FormEvent } from "react";
import "../styles/profile.css";
import { Icon } from "../components/shared";

export default function SettingsView() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [saving, setSaving] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (newPassword !== confirmPassword) {
      setMessageType("error");
      setMessage("A confirmação não corresponde à nova senha.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar sua senha.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessageType("success");
      setMessage(result.message ?? "Senha atualizada com sucesso.");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar sua senha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-page__heading">
        <div>
          <h1>Configurações</h1>
          <p>Gerencie a segurança do seu acesso.</p>
        </div>
      </div>

      <section className="profile-security" aria-labelledby="profile-security-title">
        <div className="profile-security__heading">
          <span className="profile-security__icon"><Icon name="lock" size={19} /></span>
          <div><p className="eyebrow">Acesso e segurança</p><h2 id="profile-security-title">Alterar senha</h2><p>Confirme sua senha atual para criar uma nova.</p></div>
        </div>
        <form className="profile-security__form" onSubmit={(event) => void changePassword(event)}>
          <label className="profile-security__field"><span>Senha atual</span><input autoComplete="current-password" maxLength={1024} minLength={1} onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} /></label>
          <div className="profile-security__row">
            <label className="profile-security__field"><span>Nova senha</span><input autoComplete="new-password" maxLength={1024} minLength={8} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} /></label>
            <label className="profile-security__field"><span>Confirmar nova senha</span><input autoComplete="new-password" maxLength={1024} minLength={8} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} /></label>
          </div>
          <div className="profile-security__footer">
            <p>A senha deve ter pelo menos 8 caracteres. As outras sessões serão encerradas após a alteração.</p>
            <button className="button-primary h-11 px-5" disabled={saving || !currentPassword || !newPassword || !confirmPassword} type="submit">{saving ? "Atualizando..." : "Atualizar senha"}</button>
          </div>
          {message && <p className={`profile-security__message profile-security__message--${messageType}`} role={messageType === "error" ? "alert" : "status"}>{message}</p>}
        </form>
      </section>
    </div>
  );
}
