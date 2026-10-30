import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import "../styles/profile.css";
import type { AuthenticatedEmployee } from "../components/Login";
import { Icon } from "../components/shared";

const maximumPhotoSize = 2 * 1024 * 1024;

function photoStorageKey(employeeId: number) {
  return `onramp-profile-photo-${employeeId}`;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function ProfileView({ employee, photo: savedPhoto, onPhotoChange }: { employee: AuthenticatedEmployee; photo: string; onPhotoChange: (photo: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState(savedPhoto);
  const [message, setMessage] = useState("");
  const [savingPhoto, setSavingPhoto] = useState(false);

  useEffect(() => setPhoto(savedPhoto), [savedPhoto]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > maximumPhotoSize) {
      setMessage("A foto deve ter até 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      void (async () => {
        setSavingPhoto(true);
        try {
          const response = await fetch("/api/me/profile-photo", {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error ?? "Não foi possível salvar a foto.");
          }
          try { localStorage.setItem(photoStorageKey(employee.id), reader.result); } catch { /* Keep the saved Azure photo as the source of truth. */ }
          setPhoto(reader.result);
          onPhotoChange(reader.result);
          setMessage("Foto de perfil atualizada.");
        } catch (saveError) {
          setMessage(saveError instanceof Error ? saveError.message : "Não foi possível salvar a foto.");
        } finally {
          setSavingPhoto(false);
        }
      })();
    };
    reader.onerror = () => setMessage("Não foi possível carregar essa imagem.");
    reader.readAsDataURL(file);
  }

  async function removePhoto() {
    setMessage("");
    setSavingPhoto(true);
    try {
      const response = await fetch("/api/me/profile-photo", { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "Não foi possível remover a foto.");
      }
      localStorage.removeItem(photoStorageKey(employee.id));
      setPhoto("");
      onPhotoChange("");
      setMessage("Foto removida.");
    } catch (removeError) {
      setMessage(removeError instanceof Error ? removeError.message : "Não foi possível remover a foto.");
    } finally {
      setSavingPhoto(false);
    }
  }

  const accountDetails = [
    { label: "Nome completo", value: employee.name, icon: "user" as const },
    { label: "E-mail corporativo", value: employee.email, icon: "mail" as const },
    { label: "Cargo", value: employee.jobTitle || "Não informado", icon: "briefcase" as const },
    { label: "Área", value: employee.department || "Não informada", icon: "people" as const },
  ];

  return (
    <div className="profile-page">
      <div className="profile-page__heading">
        <div>
          <p className="eyebrow">Sua conta</p>
          <h1>Meu perfil</h1>
          <p>Confira seus dados e personalize sua foto de perfil.</p>
        </div>
        <span className="profile-page__status"><span /> Conta ativa</span>
      </div>

      <section className="profile-card" aria-labelledby="profile-card-title">
        <div className="profile-card__cover" />
        <div className="profile-card__body">
          <div className="profile-card__identity">
            <div className="profile-avatar" aria-label={`Foto de ${employee.name}`}>
              {photo ? <img src={photo} alt={`Foto de perfil de ${employee.name}`} /> : <span>{initials(employee.name)}</span>}
              <button className="profile-avatar__edit" type="button" aria-label="Alterar foto de perfil" title="Alterar foto" disabled={savingPhoto} onClick={() => inputRef.current?.click()}>
                <Icon name="user" size={16} />
              </button>
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h2 id="profile-card-title">{employee.name}</h2>
              <p>{employee.jobTitle || "Colaborador(a)"}{employee.department ? ` · ${employee.department}` : ""}</p>
            </div>
            <button className="profile-photo-button" type="button" disabled={savingPhoto} onClick={() => inputRef.current?.click()}>
              <Icon name="user" size={16} /> {savingPhoto ? "Salvando..." : "Alterar foto"}
            </button>
          </div>
          <input ref={inputRef} className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={savingPhoto} onChange={choosePhoto} />
          <div className="profile-photo-help">
            <span>JPG, PNG ou WebP · até 2 MB · salva na sua conta</span>
            {photo && <button type="button" disabled={savingPhoto} onClick={removePhoto}>Remover foto</button>}
          </div>
          {message && <p className="profile-message" role="status">{message}</p>}
        </div>
      </section>

      <section className="profile-details" aria-labelledby="profile-details-title">
        <div className="profile-details__heading">
          <div><p className="eyebrow">Informações pessoais</p><h2 id="profile-details-title">Dados da conta</h2></div>
          <span>Gerenciados pela sua empresa</span>
        </div>
        <div className="profile-details__grid">
          {accountDetails.map((detail) => (
            <div className="profile-detail" key={detail.label}>
              <span className="profile-detail__icon"><Icon name={detail.icon} size={18} /></span>
              <div><span>{detail.label}</span><strong>{detail.value}</strong></div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
