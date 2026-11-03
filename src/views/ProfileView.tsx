import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent } from "react";
import "../styles/profile.css";
import type { AuthenticatedEmployee } from "../components/Login";
import { Icon } from "../components/shared";

const maximumPhotoSize = 2 * 1024 * 1024;
const cropViewportSize = 320;
const outputPhotoSize = 512;

function photoStorageKey(employeeId: number) {
  return `onramp-profile-photo-${employeeId}`;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function ProfileView({ employee, photo: savedPhoto, onPhotoChange, readOnly = false }: { employee: AuthenticatedEmployee; photo: string; onPhotoChange: (photo: string) => void; readOnly?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState(savedPhoto);
  const [message, setMessage] = useState("");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const [cropSource, setCropSource] = useState("");
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const [cropCenter, setCropCenter] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropDisplaySize, setCropDisplaySize] = useState(cropViewportSize);
  const dragStart = useRef<{ pointerX: number; pointerY: number; centerX: number; centerY: number } | null>(null);

  useEffect(() => { setPhoto(savedPhoto); setPhotoUnavailable(false); }, [savedPhoto]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setMessage("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Escolha uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("A imagem original deve ter até 10 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setCropSource(reader.result);
      setCropImageSize({ width: 0, height: 0 });
      setCropZoom(1);
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

  async function savePhotoCrop() {
    if (!cropSource || !cropImageSize.width || !cropImageSize.height) return;
    setSavingPhoto(true);
    setMessage("");
    try {
      const cropSize = Math.min(cropImageSize.width, cropImageSize.height) / cropZoom;
      const centerX = Math.max(cropSize / 2, Math.min(cropImageSize.width - cropSize / 2, cropCenter.x));
      const centerY = Math.max(cropSize / 2, Math.min(cropImageSize.height - cropSize / 2, cropCenter.y));
      const canvas = document.createElement("canvas");
      canvas.width = outputPhotoSize;
      canvas.height = outputPhotoSize;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar o recorte da foto.");
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Não foi possível ler a imagem escolhida."));
        image.src = cropSource;
      });
      context.drawImage(image, centerX - cropSize / 2, centerY - cropSize / 2, cropSize, cropSize, 0, 0, outputPhotoSize, outputPhotoSize);
      let blob: Blob | null = null;
      for (const quality of [0.9, 0.8, 0.7, 0.6]) {
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Não foi possível gerar o recorte da foto.")), "image/jpeg", quality));
        if (blob.size <= maximumPhotoSize) break;
      }
      if (!blob || blob.size > maximumPhotoSize) throw new Error("Não foi possível compactar o recorte da foto para salvar.");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const resultReader = new FileReader();
        resultReader.onload = () => typeof resultReader.result === "string" ? resolve(resultReader.result) : reject(new Error("Não foi possível preparar a foto."));
        resultReader.onerror = () => reject(new Error("Não foi possível preparar a foto."));
        resultReader.readAsDataURL(blob);
      });
      const response = await fetch("/api/me/profile-photo", { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error ?? "Não foi possível salvar a foto.");
      }
      try { localStorage.setItem(photoStorageKey(employee.id), dataUrl); } catch { /* Keep the saved Azure photo as the source of truth. */ }
      setPhoto(dataUrl);
      setPhotoUnavailable(false);
      onPhotoChange(dataUrl);
      setCropSource("");
      setMessage("Foto de perfil atualizada.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Não foi possível salvar a foto.");
    } finally {
      setSavingPhoto(false);
    }
  }

  function startCropDrag(event: PointerEvent<HTMLDivElement>) {
    if (!cropImageSize.width || !cropImageSize.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerX: event.clientX, pointerY: event.clientY, centerX: cropCenter.x, centerY: cropCenter.y };
  }

  function moveCrop(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const cropSize = Math.min(cropImageSize.width, cropImageSize.height) / cropZoom;
    const scale = cropDisplaySize / cropSize;
    const centerX = dragStart.current.centerX - (event.clientX - dragStart.current.pointerX) / scale;
    const centerY = dragStart.current.centerY - (event.clientY - dragStart.current.pointerY) / scale;
    setCropCenter({ x: Math.max(cropSize / 2, Math.min(cropImageSize.width - cropSize / 2, centerX)), y: Math.max(cropSize / 2, Math.min(cropImageSize.height - cropSize / 2, centerY)) });
  }

  const accountDetails = [
    { label: "Nome completo", value: employee.name, icon: "user" as const },
    { label: "E-mail corporativo", value: employee.email, icon: "mail" as const },
    { label: "Cargo", value: employee.jobTitle || "Não informado", icon: "briefcase" as const },
    { label: "Área", value: employee.department || "Não informada", icon: "people" as const },
  ];

  return (
    <div className="profile-page">
      {!readOnly && <div className="profile-page__heading">
        <div>
          <p className="eyebrow">Sua conta</p>
          <h1>Meu perfil</h1>
          <p>Confira seus dados e personalize sua foto de perfil.</p>
        </div>
        <span className="profile-page__status"><span /> Conta ativa</span>
      </div>}

      <section className="profile-card" aria-labelledby="profile-card-title">
        <div className="profile-card__cover" />
        <div className="profile-card__body">
          <div className="profile-card__identity">
            <div className="profile-avatar" aria-label={`Foto de ${employee.name}`}>
              {photo && !photoUnavailable ? <img src={photo} alt={`Foto de perfil de ${employee.name}`} onError={() => setPhotoUnavailable(true)} /> : <span>{initials(employee.name)}</span>}
              {!readOnly && <button className="profile-avatar__edit" type="button" aria-label="Alterar foto de perfil" title="Alterar foto" disabled={savingPhoto} onClick={() => inputRef.current?.click()}>
                <Icon name="user" size={16} />
              </button>}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h2 id="profile-card-title">{employee.name}</h2>
              <p>{employee.jobTitle || "Colaborador(a)"}{employee.department ? ` · ${employee.department}` : ""}</p>
            </div>
            {!readOnly && <button className="profile-photo-button" type="button" disabled={savingPhoto} onClick={() => inputRef.current?.click()}>
              <Icon name="user" size={16} /> {savingPhoto ? "Salvando..." : "Alterar foto"}
            </button>}
            {readOnly && <a className="profile-photo-button" href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(employee.email)}`} rel="noreferrer" target="_blank"><Icon name="chat" size={16} /> Conversar no Teams</a>}
          </div>
          {!readOnly && <><input ref={inputRef} className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={savingPhoto} onChange={choosePhoto} />
            <div className="profile-photo-help">
              <span>JPG, PNG ou WebP · recorte quadrado salvo na sua conta</span>
              {photo && <button type="button" disabled={savingPhoto} onClick={removePhoto}>Remover foto</button>}
            </div>
            {message && <p className="profile-message" role="status">{message}</p>}
          </>}
        </div>
      </section>

      {cropSource && <div className="profile-crop-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingPhoto) setCropSource(""); }}>
        <section aria-labelledby="profile-crop-title" aria-modal="true" className="profile-crop-dialog" role="dialog">
          <div className="profile-crop-dialog__heading"><div><p className="eyebrow">Foto de perfil</p><h2 id="profile-crop-title">Ajuste o recorte</h2><p>Arraste a imagem para escolher a área quadrada.</p></div><button aria-label="Fechar" className="profile-crop-dialog__close" disabled={savingPhoto} onClick={() => setCropSource("")} type="button">×</button></div>
          <div className="profile-crop-frame" onPointerDown={startCropDrag} onPointerMove={moveCrop} onPointerUp={() => { dragStart.current = null; }} onPointerCancel={() => { dragStart.current = null; }}>
            <img alt="Prévia do recorte" draggable="false" onLoad={(event) => { const { naturalWidth, naturalHeight } = event.currentTarget; setCropDisplaySize(event.currentTarget.parentElement?.clientWidth || cropViewportSize); if (!cropImageSize.width) { setCropImageSize({ width: naturalWidth, height: naturalHeight }); setCropCenter({ x: naturalWidth / 2, y: naturalHeight / 2 }); } }} src={cropSource} style={cropImageSize.width ? (() => { const cropSize = Math.min(cropImageSize.width, cropImageSize.height) / cropZoom; const scale = cropDisplaySize / cropSize; return { height: cropImageSize.height * scale, left: cropDisplaySize / 2 - cropCenter.x * scale, top: cropDisplaySize / 2 - cropCenter.y * scale, width: cropImageSize.width * scale }; })() : { display: "none" }} />
          </div>
          <label className="profile-crop-zoom">Zoom<input aria-label="Zoom do recorte" max="3" min="1" onChange={(event) => setCropZoom(Number(event.target.value))} step="0.01" type="range" value={cropZoom} /></label>
          <div className="profile-crop-dialog__actions"><button className="profile-crop-cancel" disabled={savingPhoto} onClick={() => setCropSource("")} type="button">Cancelar</button><button className="button-primary h-11 px-5" disabled={savingPhoto || !cropImageSize.width} onClick={() => void savePhotoCrop()} type="button">{savingPhoto ? "Salvando..." : "Salvar recorte"}</button></div>
        </section>
      </div>}

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
