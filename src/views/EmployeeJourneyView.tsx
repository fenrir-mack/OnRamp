import "../styles/journey.css";
import "../styles/preparation.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon, type IconName } from "../components/shared";
import TaskCard from "../components/TaskCard";
import StageSummary from "../components/StageSummary";
import ProfileView from "./ProfileView";
import type { AuthenticatedEmployee } from "../components/Login";

type Issue = { id: number; description: string; status: "open" | "in_review" | "resolved"; resolutionNote: string | null; createdAt: string };
type EmployeeTaskHistory = { id: number; actorName: string; action: string; newValue: string | null; createdAt: string };
type EmployeeTask = { id: number; stageCode: string; title: string; description: string; category: string; taskType: "task" | "preparation" | "training" | "checkin"; ownerRole: string; ownerName: string | null; ownerEmployeeId: number | null; dueOffsetDays: number; dueDate: string; overdue: boolean; required: boolean; completed: boolean; status: "not_started" | "in_progress" | "waiting_third_party" | "blocked" | "ready" | "cancelled" | "not_applicable"; trackingUrl: string | null; issues: Issue[]; history: EmployeeTaskHistory[] };
type EmployeeResource = { stageCode: string; resourceId: number; title: string; description: string | null; format: string; externalUrl: string | null; downloadUrl: string | null };
type Stage = { id: number; code: string; name: string; description: string; durationLabel: string | null; ownerDepartment: string | null };
type Plan = { configured: boolean; tasks: EmployeeTask[]; resources: EmployeeResource[] };
const preparationCategoryOrder = ["Jurídico", "TI", "Equipamento", "Contas e acessos", "Financeiro", "Pessoas & Cultura", "Geral"];

function EmployeeJourneyView({ resetVersion, employeeId, onOverdueCountChange }: { resetVersion: number; employeeId: number; onOverdueCountChange: (count: number, preEntryCount: number) => void }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [plan, setPlan] = useState<Plan>({ configured: false, tasks: [], resources: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [confirmingTask, setConfirmingTask] = useState<EmployeeTask | null>(null);
  const [formTask, setFormTask] = useState<EmployeeTask | null>(null);
  const [feeling, setFeeling] = useState("good");
  const [checkInComment, setCheckInComment] = useState("");
  const [difficulties, setDifficulties] = useState("");
  const [supportRequest, setSupportRequest] = useState("");
  const [needsSupport, setNeedsSupport] = useState(false);
  const [rating, setRating] = useState(5);
  const [whatWentWell, setWhatWentWell] = useState("");
  const [whatToImprove, setWhatToImprove] = useState("");
  const [reportingTaskId, setReportingTaskId] = useState<number | null>(null);
  const [issueText, setIssueText] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<AuthenticatedEmployee | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState("");
  const issueFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => setSelectedCode(null), [resetVersion]);
  useEffect(() => {
    if (reportingTaskId === null) return;
    requestAnimationFrame(() => issueFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [reportingTaskId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/stages", { signal: controller.signal }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as etapas."); return result as { id: number; code: string; name: string; description: string | null; duration_label: string | null; owner_department: string | null }[]; }),
      fetch("/api/me/plan", { signal: controller.signal }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar sua jornada."); return result as Plan; }),
    ]).then(([stageRows, currentPlan]) => {
      setStages(stageRows.map((stage) => ({ id: stage.id, code: stage.code, name: stage.name, description: stage.description ?? "", durationLabel: stage.duration_label, ownerDepartment: stage.owner_department })));
      setPlan(currentPlan);
      onOverdueCountChange(currentPlan.tasks.filter((task) => task.overdue).length, currentPlan.tasks.filter((task) => task.overdue && task.stageCode === "pre-entry").length);
    }).catch((loadError: unknown) => { if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar sua jornada."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [employeeId, onOverdueCountChange]);

  const tasksByStage = useMemo(() => {
    const grouped = new Map<string, EmployeeTask[]>();
    plan.tasks.forEach((task) => grouped.set(task.stageCode, [...(grouped.get(task.stageCode) ?? []), task]));
    return grouped;
  }, [plan.tasks]);
  const stageProgress = (code: string) => {
    const tasks = tasksByStage.get(code) ?? [];
    const required = tasks.filter((task) => task.required);
    const tracked = required.length ? required : tasks;
    return tracked.length ? Math.round((tracked.filter((task) => task.completed).length / tracked.length) * 100) : 0;
  };
  const firstIncomplete = stages.find(({ code }) => stageProgress(code) < 100)?.code ?? null;
  const stage = stages.find(({ code }) => code === selectedCode) ?? null;
  const tasks = stage ? tasksByStage.get(stage.code) ?? [] : [];
  const categorySortedTasks = useMemo(() => {
    if (stage?.code !== "pre-entry") return tasks;
    return [...tasks].sort((left, right) => {
      const leftCategory = left.category.trim() || "Geral";
      const rightCategory = right.category.trim() || "Geral";
      const leftOrder = preparationCategoryOrder.indexOf(leftCategory);
      const rightOrder = preparationCategoryOrder.indexOf(rightCategory);
      if (leftOrder >= 0 || rightOrder >= 0) {
        if (leftOrder < 0) return 1;
        if (rightOrder < 0) return -1;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      }
      return leftCategory.localeCompare(rightCategory, "pt-BR");
    });
  }, [stage?.code, tasks]);
  const resources = stage ? plan.resources.filter((resource) => resource.stageCode === stage.code) : [];

  async function viewOwnerProfile(ownerId: number) {
    setOwnerLoading(true);
    setOwnerError("");
    try {
      const response = await fetch(`/api/employees/${ownerId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar o perfil.");
      setSelectedOwner(result as AuthenticatedEmployee);
    } catch (profileError) {
      setOwnerError(profileError instanceof Error ? profileError.message : "Não foi possível carregar o perfil.");
    } finally {
      setOwnerLoading(false);
    }
  }

  async function completeTask(task: EmployeeTask) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/me/plan/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar a conclusão.");
      const updatedTasks = plan.tasks.map((item) => item.id === task.id ? { ...item, completed: true, overdue: false } : item);
      setPlan((current) => ({ ...current, tasks: updatedTasks }));
      onOverdueCountChange(updatedTasks.filter((item) => item.overdue).length, updatedTasks.filter((item) => item.overdue && item.stageCode === "pre-entry").length);
      setConfirmingTask(null);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a conclusão."); }
    finally { setSaving(false); }
  }

  async function submitJourneyForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formTask) return;
    const isFeedback = isFeedbackTask(formTask);
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/me/plan/tasks/${formTask.id}/${isFeedback ? "feedback" : "check-in"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isFeedback
          ? { rating, whatWentWell, whatToImprove }
          : { feeling, comment: checkInComment, difficulties, supportRequest, needsSupport }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar sua resposta.");
      const updatedTasks = plan.tasks.map((item) => item.id === formTask.id ? { ...item, completed: true, overdue: false } : item);
      setPlan((current) => ({ ...current, tasks: updatedTasks }));
      onOverdueCountChange(updatedTasks.filter((item) => item.overdue).length, updatedTasks.filter((item) => item.overdue && item.stageCode === "pre-entry").length);
      setFormTask(null);
      setCheckInComment(""); setDifficulties(""); setSupportRequest(""); setNeedsSupport(false);
      setWhatWentWell(""); setWhatToImprove(""); setRating(5);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível enviar sua resposta."); }
    finally { setSaving(false); }
  }

  async function reportIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reportingTaskId === null) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/me/plan/tasks/${reportingTaskId}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: issueText }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível enviar o problema.");
      setPlan((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === reportingTaskId ? { ...task, issues: [result, ...task.issues] } : task) }));
      setReportingTaskId(null); setIssueText("");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível enviar o problema."); }
    finally { setSaving(false); }
  }

  if (loading) return <section><p className="eyebrow">Seu onboarding</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Minha jornada</h1><p className="mt-6 text-sm text-[#777a91]">Carregando suas etapas e atividades...</p></section>;

  if (selectedOwner) return <section className="people-directory">
    <button className="people-back-button" onClick={() => setSelectedOwner(null)} type="button"><Icon name="chevron" size={15} /> Voltar para as tarefas</button>
    <div className="mt-5"><ProfileView employee={selectedOwner} photo={`/api/employees/${selectedOwner.id}/profile-photo`} onPhotoChange={() => undefined} readOnly /></div>
  </section>;

  if (stage) {
    const doneCount = tasks.filter((task) => task.completed).length;
    const overdueCount = tasks.filter((task) => task.overdue).length;
    const pendingCount = tasks.filter((task) => !task.completed && !task.overdue).length;
    const stageIssues = tasks.flatMap((task) => task.issues.map((issue) => ({ ...issue, taskTitle: task.title })));
    return <section>
      <button className="journey-detail__back" onClick={() => setSelectedCode(null)} type="button"><Icon name="arrow" size={17} /> Voltar para minha jornada</button>
      <div className="journey-detail__hero mt-5"><div><span className="journey-detail__step-label">Etapa {stages.findIndex((item) => item.code === stage.code) + 1} de {stages.length}</span><h1>{stage.name}</h1><p>{stage.description}</p><div className="journey-detail__meta"><div className="journey-detail__meta-item"><span><Icon name="clock" size={19} /></span><div><small>Período</small><strong>{stage.durationLabel || "Não definido"}</strong></div></div><div className="journey-detail__meta-item"><span><Icon name="user" size={19} /></span><div><small>Responsável</small><strong>{stage.ownerDepartment || "Não definido"}</strong></div></div></div></div><div className="journey-detail__progress"><strong>{stageProgress(stage.code)}%</strong><span>concluído</span></div></div>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-6 grid gap-5">
        <div className="content-panel"><p className="eyebrow">Materiais de apoio</p><div className="mt-4 grid grid-cols-2 gap-2">{resources.map((resource) => { const href = resource.externalUrl ?? resource.downloadUrl; return href ? <a className="journey-detail__material" href={href} key={resource.resourceId} rel="noreferrer" target="_blank"><span><Icon name="book" size={16} /></span><strong>{resource.title}</strong><Icon name="chevron" size={14} /></a> : <div className="journey-detail__material" key={resource.resourceId}><span><Icon name="book" size={16} /></span><strong>{resource.title}</strong></div>; })}{resources.length === 0 && <p className="col-span-2 rounded-xl bg-[#fafafe] p-4 text-sm text-[#85879a]">Nenhum material foi associado a esta etapa.</p>}</div></div>
        <div className="content-panel"><StageSummary eyebrow="Atividades da etapa" title="Tarefas e orientações" description="Acompanhe as atividades que o RH atribuiu à sua jornada." stats={[{ value: doneCount, label: "Concluídas", tone: "success" }, { value: overdueCount, label: "Atrasadas", tone: "danger" }, { value: pendingCount, label: "Pendentes", tone: "warning" }, { value: stageIssues.length, label: "Problemas informados", tone: "danger" }]} />
          <div className="task-card-list journey-detail__task-list">{tasks.length ? categorySortedTasks.map((task, index) => { const formTaskType = task.taskType === "checkin"; const feedbackTask = isFeedbackTask(task); const statusLabel = task.completed ? "Pronto" : task.overdue ? `Atrasado desde ${formatDueDate(task.dueDate)}` : employeeStatusLabels[task.status]; const category = task.category.trim() || "Geral"; const previousCategory = index > 0 ? categorySortedTasks[index - 1].category.trim() || "Geral" : null; const showCategoryHeading = stage.code === "pre-entry" && category !== previousCategory; const categoryCount = categorySortedTasks.filter((item) => (item.category.trim() || "Geral") === category).length; return <div key={task.id}>{showCategoryHeading && <header className="mb-3 mt-5 flex items-center gap-3 border-b border-[#e7e7f0] pb-2 first:mt-0"><span aria-hidden="true" className="h-5 w-1 rounded-full bg-[#6566dc]" /><h3 className="text-sm font-extrabold text-[#303249]">{category}</h3><span className="rounded-full bg-[#f0efff] px-2.5 py-1 text-[10px] font-bold text-[#5556d8]">{categoryCount} {categoryCount === 1 ? "item" : "itens"}</span></header>}<TaskCard title={task.title} detail={task.description} category={task.category} owner={task.ownerName ?? task.ownerRole} ownerEmployeeId={task.ownerEmployeeId} onOwnerClick={(ownerId) => void viewOwnerProfile(ownerId)} required={task.required} icon={taskIcon(task.taskType)} status={task.completed ? "Concluído" : task.overdue ? "Atrasado" : "Pendente"} statusLabel={statusLabel} onReport={() => { setReportingTaskId(task.id); setIssueText(""); }} onResolve={!task.completed ? () => formTaskType ? setFormTask(task) : setConfirmingTask(task) : undefined} resolveLabel={formTaskType ? feedbackTask ? "Dar feedback" : "Fazer check-in" : undefined} />{stage.code === "pre-entry" && task.category === "Equipamento" && task.trackingUrl && <a className="ml-3 mt-2 inline-flex text-xs font-bold text-[#5556d8] underline" href={task.trackingUrl} rel="noreferrer" target="_blank">Link de rastreio</a>}{task.history.length > 0 && <details className="ml-3 mt-2"><summary className="cursor-pointer text-xs font-bold text-[#5556d8]">Histórico</summary>{task.history.map((entry) => <p className="mt-1 text-xs text-[#777a91]" key={entry.id}>{formatDateTime(entry.createdAt)} · {entry.actorName} · {employeeHistoryActionLabel(entry.action)}</p>)}</details>}</div>; }) : <p className="rounded-xl border border-dashed border-[#dedeeb] bg-[#fafafe] p-6 text-center text-sm text-[#85879a]">O RH ainda não adicionou tarefas a esta etapa.</p>}</div>
          {ownerLoading && <p className="mt-3 text-sm text-[#777a91]" role="status">Carregando perfil...</p>}
          {ownerError && <p className="mt-3 text-sm text-red-700" role="alert">{ownerError}</p>}
          {reportingTaskId !== null && <form ref={issueFormRef} className="journey-issue" onSubmit={reportIssue}><div className="journey-issue__heading"><div><p className="eyebrow">Novo problema</p><strong>{tasks.find(({ id }) => id === reportingTaskId)?.title}</strong></div><button type="button" onClick={() => setReportingTaskId(null)}>Cancelar</button></div><textarea required maxLength={2000} value={issueText} onChange={(event) => setIssueText(event.target.value)} placeholder="Descreva o problema ou o que está faltando..." /><button className="journey-issue__submit" disabled={saving} type="submit">{saving ? "Enviando..." : "Enviar para o responsável"}</button></form>}
          {stageIssues.length > 0 && <div className="journey-issue__history"><p className="eyebrow">Problemas informados</p>{stageIssues.map((issue) => <div className="journey-issue__item" key={issue.id}><span><Icon name={issue.status === "resolved" ? "check" : "clock"} size={15} /></span><div><strong>{issue.taskTitle}</strong><small>{issue.description}{issue.resolutionNote ? ` · ${issue.resolutionNote}` : ""}</small></div><em>{issue.status === "resolved" ? "Resolvido" : issue.status === "in_review" ? "Em acompanhamento" : "Enviado"}</em></div>)}</div>}
        </div>
      </div>
      {formTask && <div className="modal__backdrop" role="presentation" onMouseDown={() => !saving && setFormTask(null)}><form className="modal__dialog max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="journey-form-title" onSubmit={submitJourneyForm} onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">{isFeedbackTask(formTask) ? "Avaliação do onboarding" : "Check-in de adaptação"}</p><h2 id="journey-form-title" className="mt-1">{formTask.title}</h2>{isFeedbackTask(formTask) ? <><label className="mt-4 block text-sm font-bold text-[#55576d]">Como você avalia seu onboarding? <span className="text-[#5556d8]">{rating}/5</span><input className="mt-2 w-full accent-[#5556d8]" type="range" min="1" max="5" value={rating} onChange={(event) => setRating(Number(event.target.value))} /></label><label className="mt-4 block text-sm font-bold text-[#55576d]">O que funcionou bem?<textarea className="mt-2 min-h-24 w-full rounded-xl border border-[#dedee8] p-3 text-sm font-normal" maxLength={2000} value={whatWentWell} onChange={(event) => setWhatWentWell(event.target.value)} /></label><label className="mt-4 block text-sm font-bold text-[#55576d]">O que podemos melhorar?<textarea className="mt-2 min-h-24 w-full rounded-xl border border-[#dedee8] p-3 text-sm font-normal" maxLength={2000} value={whatToImprove} onChange={(event) => setWhatToImprove(event.target.value)} /></label></> : <><label className="mt-4 block text-sm font-bold text-[#55576d]">Como está se sentindo?<select className="mt-2 w-full rounded-xl border border-[#dedee8] bg-white p-3 text-sm font-normal" value={feeling} onChange={(event) => setFeeling(event.target.value)}><option value="great">Muito bem</option><option value="good">Bem</option><option value="neutral">Mais ou menos</option><option value="struggling">Com dificuldades</option></select></label><label className="mt-4 block text-sm font-bold text-[#55576d]">Como está sendo sua adaptação?<textarea className="mt-2 min-h-20 w-full rounded-xl border border-[#dedee8] p-3 text-sm font-normal" maxLength={2000} value={checkInComment} onChange={(event) => setCheckInComment(event.target.value)} /></label><label className="mt-4 block text-sm font-bold text-[#55576d]">Está enfrentando alguma dificuldade?<textarea className="mt-2 min-h-20 w-full rounded-xl border border-[#dedee8] p-3 text-sm font-normal" maxLength={2000} value={difficulties} onChange={(event) => setDifficulties(event.target.value)} /></label><label className="mt-4 block text-sm font-bold text-[#55576d]">Que suporte ajudaria?</label><textarea className="mt-2 min-h-20 w-full rounded-xl border border-[#dedee8] p-3 text-sm" maxLength={2000} value={supportRequest} onChange={(event) => setSupportRequest(event.target.value)} /><label className="mt-3 flex items-center gap-2 text-sm text-[#55576d]"><input type="checkbox" checked={needsSupport} onChange={(event) => setNeedsSupport(event.target.checked)} /> Quero que o RH entre em contato comigo</label></>}<div className="mt-6 flex gap-3"><button className="modal__secondary" disabled={saving} onClick={() => setFormTask(null)} type="button">Cancelar</button><button className="modal__confirm" disabled={saving} type="submit">{saving ? "Enviando..." : "Enviar resposta"}</button></div></form></div>}
      {confirmingTask && <div className="modal__backdrop" role="presentation" onMouseDown={() => setConfirmingTask(null)}><div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="journey-resolution-title" onMouseDown={(event) => event.stopPropagation()}><div className="grid size-12 place-items-center rounded-2xl bg-[#e7f7ef] text-[#288b65]"><Icon name="check" size={23} /></div><h2 id="journey-resolution-title">Marcar como concluída?</h2><p>Você confirma que a tarefa <strong>{confirmingTask.title}</strong> já foi concluída?</p><div className="mt-6 flex gap-3"><button className="modal__secondary" disabled={saving} onClick={() => setConfirmingTask(null)} type="button">Cancelar</button><button className="modal__confirm" disabled={saving} onClick={() => void completeTask(confirmingTask)} type="button"><Icon name="check" size={16} /> {saving ? "Salvando..." : "Sim, está concluída"}</button></div></div></div>}
    </section>;
  }

  return <section><p className="eyebrow">Seu onboarding</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Minha jornada</h1><p className="mt-2 text-[#777a91]">Acompanhe o progresso das atividades e os materiais da sua jornada.</p>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    {!plan.configured && <p className="mt-5 rounded-xl border border-[#e8e8f0] bg-white p-4 text-sm text-[#777a91]">O RH ainda não configurou seu padrão de onboarding. As atividades aparecerão aqui quando estiver pronto.</p>}
    <div className="mt-8 max-w-4xl space-y-4">{stages.map((item, index) => { const stageTasks = tasksByStage.get(item.code) ?? []; const overdueCount = stageTasks.filter((task) => task.overdue).length; const progress = stageProgress(item.code); const done = stageTasks.length > 0 && progress === 100; return <button className={`journey-stage-card ${firstIncomplete === item.code ? "journey-stage-card--current" : ""}`} key={item.code} onClick={() => setSelectedCode(item.code)} type="button"><div className={`journey-stage__number ${done ? "bg-[#e6f7ef] text-[#239766]" : ""}`}>{done ? <Icon name="check" size={17} /> : index + 1}</div><div className="min-w-0 flex-1 text-left"><h2 className="font-extrabold">{item.name}</h2><p className="mt-1 text-sm text-[#81849a]">{item.description}</p></div><div className="hidden text-right sm:block">{overdueCount > 0 && <span className="mb-1 inline-flex rounded-full bg-red-50 px-2 py-1 text-[10px] font-extrabold text-red-700">{overdueCount} {overdueCount === 1 ? "atrasada" : "atrasadas"}</span>}<strong className="block text-sm text-[#5556d8]">{progress}%</strong><small className="text-[10px] text-[#9698aa]">{stageTasks.length} {stageTasks.length === 1 ? "tarefa" : "tarefas"}</small></div><Icon name="chevron" size={18} /></button>; })}{stages.length === 0 && <p className="rounded-xl bg-white p-5 text-sm text-[#85879a]">Não há etapas disponíveis.</p>}</div>
  </section>;
}

function taskIcon(type: EmployeeTask["taskType"]): IconName { return type === "training" ? "book" : type === "checkin" ? "calendar" : type === "preparation" ? "tools" : "check"; }
const employeeStatusLabels: Record<EmployeeTask["status"], string> = { not_started: "A iniciar", in_progress: "Em andamento", waiting_third_party: "Aguardando terceiro", blocked: "Bloqueado", ready: "Pronto", cancelled: "Cancelado", not_applicable: "Não se aplica" };
function isFeedbackTask(task: EmployeeTask) { return `${task.category} ${task.title}`.toLowerCase().includes("feedback"); }
function formatDueDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? "no prazo" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date); }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date); }
function employeeHistoryActionLabel(action: string) { if (action === "status") return "atualizou o estado"; if (action === "shipment") return "atualizou o link de rastreio"; if (action === "employee_confirmation") return "confirmou como pronto"; if (action === "issue_reported") return "registrou um problema"; if (action === "issue_status") return "atualizou um problema"; return action; }
export default EmployeeJourneyView;
