import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type PreparationIssue = { id: number; description: string; status: "open" | "in_review" | "resolved"; resolutionNote: string | null; createdAt: string };
type PreparationHistoryEntry = { id: number; actorName: string; action: string; newValue: string | null; createdAt: string };
type PreparationTask = {
  id: number; employeeId: number; employeeName: string; title: string; description: string; category: string;
  ownerEmployeeId: number | null; ownerName: string | null; ownerRole: string; departmentId: number | null;
  department: string | null; dueOffsetDays: number; startDate: string; dueDate: string;
  status: "not_started" | "in_progress" | "waiting_third_party" | "ready";
  carrier: string | null; trackingCode: string | null; trackingUrl: string | null; openIssueCount: number; issues: PreparationIssue[]; history: PreparationHistoryEntry[];
};

const statusLabels: Record<PreparationTask["status"], string> = {
  not_started: "A iniciar", in_progress: "Em andamento", waiting_third_party: "Aguardando terceiro", ready: "Pronto",
};

function PreparationView() {
  const [tasks, setTasks] = useState<PreparationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/preparation/tasks").then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result.tasks as PreparationTask[]; })
      .then((queue) => { if (active) setTasks(queue); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a preparação."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function updateStatus(task: PreparationTask, status: PreparationTask["status"]) {
    setSavingId(task.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/preparation/tasks/${task.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o estado.");
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: result.status } : item));
      setNotice("Estado do item atualizado.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível atualizar o estado."); }
    finally { setSavingId(null); }
  }

  async function saveShipment(event: FormEvent<HTMLFormElement>, task: PreparationTask) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingId(task.id); setError(""); setNotice("");
    try {
      const data = { carrier: String(form.get("carrier") ?? ""), trackingCode: String(form.get("trackingCode") ?? ""), trackingUrl: String(form.get("trackingUrl") ?? "") };
      const response = await fetch(`/api/preparation/tasks/${task.id}/shipment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o rastreio.");
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...result } : item));
      setNotice("Dados de entrega salvos.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o rastreio."); }
    finally { setSavingId(null); }
  }

  async function updateIssue(issue: PreparationIssue, status: "in_review" | "resolved") {
    setError(""); setNotice("");
    try {
      const resolutionNote = status === "resolved" ? window.prompt("Como o problema foi resolvido?", issue.resolutionNote ?? "") : issue.resolutionNote ?? "";
      if (status === "resolved" && resolutionNote === null) return;
      const response = await fetch(`/api/preparation/issues/${issue.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, resolutionNote }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o problema.");
      setTasks((current) => current.map((task) => ({ ...task, issues: task.issues.map((item) => item.id === issue.id ? { ...item, ...result } : item), openIssueCount: task.issues.filter((item) => item.id !== issue.id && item.status !== "resolved").length + (status === "resolved" ? 0 : 1) })));
      setNotice("Acompanhamento do problema atualizado.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível atualizar o problema."); }
  }

  return <section>
    <p className="eyebrow">Preparação da chegada</p>
    <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Novas admissões</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#777a91]">Acompanhe os itens da empresa, os prazos, os problemas sinalizados e as entregas em trânsito.</p>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
    {notice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">{notice}</p>}
    <div className="mt-6 space-y-4">{loading ? <p className="content-panel text-sm text-[#85879a]">Carregando a fila de preparação...</p> : tasks.map((task) => {
      const overdue = task.status !== "ready" && task.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
      return <article className="content-panel space-y-4" key={task.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold text-[#303249]">{task.title}</h2><span className="rounded-full bg-[#f0efff] px-2.5 py-1 text-[10px] font-bold text-[#5556d8]">{task.category}</span>{overdue && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700">Atrasado</span>}</div><p className="mt-1 text-sm font-semibold text-[#55576d]">{task.employeeName} · {task.department ?? "Área não definida"}</p><p className="mt-1 text-xs text-[#85879a]">Entrada: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${task.startDate.slice(0, 10)}T00:00:00`))} · Prazo: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${task.dueDate.slice(0, 10)}T00:00:00`))} · Responsável: {task.ownerName ?? task.ownerRole}</p>{task.description && <p className="mt-2 text-sm leading-5 text-[#777a91]">{task.description}</p>}</div>
          <label className="text-xs font-bold text-[#55576d]">Estado<select aria-label={`Estado: ${task.title}`} className="mt-1 block rounded-lg border border-[#e3e3ed] bg-white px-3 py-2 text-sm" disabled={savingId === task.id} value={task.status} onChange={(event) => void updateStatus(task, event.target.value as PreparationTask["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <form className="grid gap-2 rounded-xl bg-[#fafafe] p-3 sm:grid-cols-4" onSubmit={(event) => void saveShipment(event, task)}><label className="text-[10px] font-bold text-[#777a91]">Transportadora<input className="mt-1 w-full rounded-lg border border-[#e3e3ed] bg-white px-2.5 py-2 text-xs" defaultValue={task.carrier ?? ""} name="carrier" maxLength={120} /></label><label className="text-[10px] font-bold text-[#777a91]">Código de rastreio<input className="mt-1 w-full rounded-lg border border-[#e3e3ed] bg-white px-2.5 py-2 text-xs" defaultValue={task.trackingCode ?? ""} name="trackingCode" maxLength={180} /></label><label className="text-[10px] font-bold text-[#777a91]">Link de rastreio<input className="mt-1 w-full rounded-lg border border-[#e3e3ed] bg-white px-2.5 py-2 text-xs" defaultValue={task.trackingUrl ?? ""} name="trackingUrl" type="url" maxLength={1000} /></label><button className="self-end rounded-lg border border-[#e3e3ed] px-3 py-2 text-xs font-bold text-[#5556d8] hover:bg-white" disabled={savingId === task.id} type="submit">Salvar entrega</button></form>
        {task.trackingUrl && <a className="text-xs font-bold text-[#5556d8] underline" href={task.trackingUrl} rel="noreferrer" target="_blank">Acompanhar entrega {task.trackingCode ? `· ${task.trackingCode}` : ""}</a>}
        {task.history.length > 0 && <details className="border-t border-[#eeeeF4] pt-3"><summary className="cursor-pointer text-xs font-bold text-[#5556d8]">Histórico de atualizações ({task.history.length})</summary><div className="mt-2 space-y-1">{task.history.map((entry) => <p className="text-xs text-[#777a91]" key={entry.id}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))} · {entry.actorName} · {historyActionLabel(entry.action)}{historyValue(entry) ? `: ${historyValue(entry)}` : ""}</p>)}</div></details>}
        {task.issues.length > 0 && <div className="space-y-2 border-t border-[#eeeeF4] pt-3"><strong className="text-sm">Problemas sinalizados ({task.openIssueCount})</strong>{task.issues.map((issue) => <div className="rounded-lg bg-[#fafafe] p-3" key={issue.id}><p className="text-sm text-[#45475d]">{issue.description}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-xs text-[#85879a]">{issue.status === "resolved" ? `Resolvido: ${issue.resolutionNote ?? ""}` : issue.status === "in_review" ? "Em acompanhamento" : "Aberto"}</span>{issue.status !== "resolved" && <><button className="text-xs font-bold text-[#5556d8]" onClick={() => void updateIssue(issue, "in_review")} type="button">Acompanhar</button><button className="text-xs font-bold text-emerald-700" onClick={() => void updateIssue(issue, "resolved")} type="button">Marcar resolvido</button></>}</div></div>)}</div>}
      </article>;
    })}{!loading && tasks.length === 0 && <p className="content-panel text-sm text-[#85879a]">Ainda não há itens de preparação para as áreas que você pode acompanhar.</p>}</div>
  </section>;
}

function historyActionLabel(action: string) {
  if (action === "status") return "alterou o estado";
  if (action === "shipment") return "atualizou a entrega";
  if (action === "employee_confirmation") return "confirmou como pronto";
  if (action === "issue_reported") return "registrou um problema";
  if (action === "issue_status") return "atualizou um problema";
  return action;
}

function historyValue(entry: PreparationHistoryEntry) {
  if (!entry.newValue || entry.action === "shipment") return "";
  if (entry.action === "status") return statusLabels[entry.newValue as PreparationTask["status"]] ?? entry.newValue;
  if (entry.action === "issue_status") return entry.newValue === "in_review" ? "Em acompanhamento" : entry.newValue === "resolved" ? "Resolvido" : entry.newValue;
  return entry.newValue;
}

export default PreparationView;
