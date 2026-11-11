import { useCallback, useEffect, useState } from "react";
import ProfileView from "./ProfileView";
import type { AuthenticatedEmployee } from "../components/Login";

type PersonFields = { id: number; employeeId: number; employeeName: string; employeeEmail: string; jobTitle: string | null; department: string | null; submittedAt: string };
type CheckIn = PersonFields & { taskTitle: string | null; feeling: string | null; comment: string | null; difficulties: string | null; supportRequest: string | null; needsSupport: boolean; hasChat: boolean; followUpStatus: "not_needed" | "open" | "in_progress" | "resolved" };
type SupportRequest = PersonFields & { category: "question" | "support"; subject: string; description: string; status: "open" | "in_progress" | "resolved"; followUpNote: string | null; hasChat: boolean };
type Feedback = PersonFields & { rating: number; whatWentWell: string | null; whatToImprove: string | null };
type Data = { checkIns: CheckIn[]; requests: SupportRequest[]; feedback: Feedback[] };
type Tab = "checkins" | "requests" | "feedback";

function OnboardingSupportView({ onOpenChat }: { onOpenChat: (checkInId: number) => void }) {
  const [data, setData] = useState<Data>({ checkIns: [], requests: [], feedback: [] });
  const [tab, setTab] = useState<Tab>("checkins");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<AuthenticatedEmployee | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/hr/onboarding-support");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os acompanhamentos.");
    setData(result as Data);
  }, []);
  useEffect(() => { load().catch((loadError) => setError(loadError.message)).finally(() => setLoading(false)); }, [load]);

  async function updateCheckIn(id: number, status: CheckIn["followUpStatus"]) {
    const response = await fetch(`/api/hr/check-ins/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o acompanhamento.");
    setData((current) => ({ ...current, checkIns: current.checkIns.map((item) => item.id === id ? { ...item, followUpStatus: result.status } : item) }));
  }
  async function startCheckInChat(item: CheckIn) {
    try {
      const response = await fetch(`/api/hr/check-ins/${item.id}/start-chat`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível iniciar o chat.");
      setData((current) => ({ ...current, checkIns: current.checkIns.map((checkIn) => checkIn.id === item.id ? { ...checkIn, hasChat: true, needsSupport: true, followUpStatus: result.status } : checkIn) }));
      setError("");
      onOpenChat(item.id);
    } catch (chatError) { setError(chatError instanceof Error ? chatError.message : "Não foi possível iniciar o chat."); }
  }
  async function updateRequest(id: number, status: SupportRequest["status"], followUpNote: string) {
    const response = await fetch(`/api/hr/support-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, followUpNote }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o pedido.");
    setData((current) => ({ ...current, requests: current.requests.map((item) => item.id === id ? { ...item, status: result.status, followUpNote: result.followUpNote } : item) }));
  }
  async function replyToRequest(item: SupportRequest) {
    const reply = (document.getElementById(`support-note-${item.id}`) as HTMLTextAreaElement | null)?.value.trim() ?? "";
    if (!reply) { setError("Escreva uma resposta antes de enviar ao funcionário."); return; }
    try { await updateRequest(item.id, "in_progress", reply); setError(""); }
    catch (replyError) { setError(replyError instanceof Error ? replyError.message : "Não foi possível enviar a resposta."); }
  }
  async function startRequestChat(item: SupportRequest) {
    const field = document.getElementById(`support-note-${item.id}`) as HTMLTextAreaElement | null;
    const draft = field?.value.trim() ?? "";
    try {
      if (draft) {
        const response = await fetch(`/api/support/requests/${item.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível iniciar o chat.");
        if (field) field.value = "";
        setData((current) => ({ ...current, requests: current.requests.map((request) => request.id === item.id ? { ...request, hasChat: true, status: "in_progress", followUpNote: request.followUpNote === draft ? null : request.followUpNote } : request) }));
      } else {
        const response = await fetch(`/api/support/requests/${item.id}/start`, { method: "POST" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível iniciar o chat.");
        setData((current) => ({ ...current, requests: current.requests.map((request) => request.id === item.id ? { ...request, hasChat: true, status: "in_progress" } : request) }));
      }
      setError("");
    } catch (chatError) { setError(chatError instanceof Error ? chatError.message : "Não foi possível iniciar o chat."); return; }
    onOpenChat(item.id);
  }
  async function viewPerson(id: number) {
    try { const response = await fetch(`/api/employees/${id}`); const person = await response.json(); if (!response.ok) throw new Error(person.error); setSelectedPerson(person as AuthenticatedEmployee); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Não foi possível abrir o perfil."); }
  }
  const pendingFollowUps = data.checkIns.filter((item) => item.needsSupport && item.followUpStatus !== "resolved").length;
  const openRequests = data.requests.filter((item) => item.status !== "resolved").length;

  if (selectedPerson) return <section><button className="mb-5 rounded-lg px-3 py-2 text-sm font-bold text-[#5556d8] hover:bg-white" onClick={() => setSelectedPerson(null)} type="button">← Voltar ao acompanhamento</button><ProfileView employee={selectedPerson} photo={`/api/employees/${selectedPerson.id}/profile-photo`} onPhotoChange={() => undefined} readOnly /></section>;

  return <section className="space-y-6">
    <header><p className="eyebrow">Onboarding</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Acompanhamento</h1><p className="mt-2 text-[#777a91]">Consulte check-ins, pedidos de ajuda e avaliações para identificar quem precisa de atenção.</p></header>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><Summary label="Check-ins para acompanhar" value={pendingFollowUps} tone={pendingFollowUps ? "amber" : "green"} /><Summary label="Pedidos em aberto" value={openRequests} tone={openRequests ? "amber" : "green"} /><Summary label="Feedbacks recebidos" value={data.feedback.length} tone="purple" /></div>
    <nav className="flex flex-wrap gap-2" aria-label="Tipo de acompanhamento">{([ ["checkins", `Check-ins (${data.checkIns.length})`], ["requests", `Pedidos de suporte (${data.requests.length})`], ["feedback", `Feedbacks (${data.feedback.length})`] ] as [Tab, string][]).map(([key, label]) => <button className={`rounded-xl px-4 py-2.5 text-sm font-extrabold ${tab === key ? "bg-[#5556d8] text-white" : "border border-[#e5e5ee] bg-white text-[#66687d]"}`} key={key} onClick={() => setTab(key)} type="button">{label}</button>)}</nav>
    {loading ? <p className="rounded-xl bg-white p-6 text-sm text-[#777a91]">Carregando...</p> : tab === "checkins" ? <div className="space-y-3">{data.checkIns.map((item) => <article className={`rounded-2xl border bg-white p-5 ${item.needsSupport && item.followUpStatus !== "resolved" ? "border-amber-300 shadow-sm" : "border-[#ececf3]"}`} key={item.id}><Person person={item} onClick={() => void viewPerson(item.employeeId)} /><div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#f3f3f8] px-3 py-1 text-xs font-bold">{item.taskTitle ?? "Check-in"}</span>{item.feeling && <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.feeling === "struggling" ? "bg-red-50 text-red-700" : "bg-[#f3f3f8] text-[#67697d]"}`}>{feelingLabel(item.feeling)}</span>}<span className={`rounded-full px-3 py-1 text-xs font-bold ${item.followUpStatus === "resolved" || item.followUpStatus === "not_needed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{checkInStatus(item.followUpStatus)}</span></div>{item.comment && <Response label="Adaptação" text={item.comment} />}{item.difficulties && <Response label="Dificuldades" text={item.difficulties} />}{item.supportRequest && <Response label="Suporte pedido" text={item.supportRequest} />}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><small className="text-xs text-[#999bad]">Enviado {dateLabel(item.submittedAt)}</small>{item.needsSupport && item.followUpStatus !== "resolved" && <button className="rounded-lg bg-[#5556d8] px-3 py-2 text-xs font-bold text-white" onClick={() => void startCheckInChat(item)} type="button">{item.hasChat ? "Abrir conversa no chat" : "Iniciar conversa no chat"}</button>}{item.needsSupport && item.followUpStatus !== "resolved" && <button className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700" onClick={() => updateCheckIn(item.id, "resolved").catch((e) => setError(e.message))} type="button">Concluir acompanhamento</button>}</div></article>)}{!data.checkIns.length && <Empty text="Ainda não há check-ins enviados." />}</div> : tab === "requests" ? <div className="space-y-3">{data.requests.map((item) => <article className="rounded-2xl border border-[#ececf3] bg-white p-5" key={item.id}>
      <Person person={item} onClick={() => void viewPerson(item.employeeId)} />
      <div className="mt-4 flex items-center gap-2"><span className="rounded-full bg-[#f3f3f8] px-3 py-1 text-xs font-bold">{item.category === "question" ? "Dúvida" : "Pedido de ajuda"}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{requestStatus(item.status)}</span></div>
      <h3 className="mt-3 font-extrabold">{item.subject}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-[#686a80]">{item.description}</p>
      {item.followUpNote && <Response label="Última resposta ao funcionário" text={item.followUpNote} />}
      <label className="mt-4 block text-xs font-bold text-[#66687d]">Resposta para o funcionário<textarea className="mt-1 min-h-20 w-full rounded-xl border border-[#dedee8] p-3 text-sm font-normal" maxLength={1000} defaultValue="" id={"support-note-" + item.id} placeholder="Escreva uma resposta clara para o funcionário..." /></label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><small className="text-xs text-[#999bad]">Enviado {dateLabel(item.submittedAt)}</small><div className="flex flex-wrap gap-2"><button className="rounded-lg border border-[#e5e5ee] px-3 py-2 text-xs font-bold text-[#5556d8]" onClick={() => void replyToRequest(item)} type="button">Responder ao pedido</button><button className="rounded-lg bg-[#5556d8] px-3 py-2 text-xs font-bold text-white" onClick={() => void startRequestChat(item)} type="button">{item.hasChat ? "Abrir chat" : "Iniciar chat"}</button></div></div>
    </article>)}{!data.requests.length && <Empty text="Ainda não há pedidos gerais de suporte." />}</div> : <div className="space-y-3">{data.feedback.map((item) => <article className="rounded-2xl border border-[#ececf3] bg-white p-5" key={item.id}><Person person={item} onClick={() => void viewPerson(item.employeeId)} /><div className="mt-3 text-sm font-extrabold text-[#9a6b00]">Avaliação: {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)} <span className="text-[#777a91]">({item.rating}/5)</span></div>{item.whatWentWell && <Response label="O que funcionou bem" text={item.whatWentWell} />}{item.whatToImprove && <Response label="O que pode melhorar" text={item.whatToImprove} />}<small className="mt-4 block text-xs text-[#999bad]">Enviado {dateLabel(item.submittedAt)}</small></article>)}{!data.feedback.length && <Empty text="Ainda não há avaliações de onboarding." />}</div>}
  </section>;
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "amber" | "green" | "purple" }) { const style = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-violet-200 bg-violet-50 text-violet-800"; return <div className={`rounded-2xl border p-4 ${style}`}><strong className="block text-2xl font-extrabold">{value}</strong><span className="mt-1 block text-xs font-bold">{label}</span></div>; }
function Person({ person, onClick }: { person: PersonFields; onClick: () => void }) { return <div className="flex items-center justify-between gap-3"><button className="min-w-0 text-left" onClick={onClick} type="button"><strong className="block truncate text-sm text-[#282a42] hover:text-[#5556d8]">{person.employeeName}</strong><span className="mt-1 block truncate text-xs text-[#85879a]">{[person.jobTitle, person.department, person.employeeEmail].filter(Boolean).join(" · ")}</span></button><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e9e9ff] text-xs font-extrabold text-[#5556d8]">{person.employeeName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span></div>; }
function Response({ label, text }: { label: string; text: string }) { return <div className="mt-3 rounded-xl bg-[#f8f8fc] p-3"><strong className="text-xs text-[#55576d]">{label}</strong><p className="mt-1 whitespace-pre-wrap text-sm text-[#686a80]">{text}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-[#dedee8] bg-white p-6 text-sm text-[#777a91]">{text}</p>; }
function dateLabel(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function feelingLabel(value: string) { return ({ great: "Muito bem", good: "Bem", neutral: "Mais ou menos", struggling: "Com dificuldades" } as Record<string, string>)[value] ?? value; }
function checkInStatus(value: CheckIn["followUpStatus"]) { return ({ not_needed: "Sem acompanhamento", open: "Precisa de contato", in_progress: "Em acompanhamento", resolved: "Acompanhamento concluído" })[value]; }
function requestStatus(value: SupportRequest["status"]) { return ({ open: "Aguardando RH", in_progress: "Em acompanhamento", resolved: "Concluído" })[value]; }
export default OnboardingSupportView;
