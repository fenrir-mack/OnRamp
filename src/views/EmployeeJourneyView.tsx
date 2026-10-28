import "../styles/journey.css";
import "../styles/preparation.css";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Icon, type IconName } from "../components/shared";
import TaskCard from "../components/TaskCard";
import StageSummary from "../components/StageSummary";

type Issue = { id: number; description: string; createdAt: string };
type EmployeeTask = { id: number; stageCode: string; title: string; description: string; category: string; taskType: "task" | "preparation" | "training" | "checkin"; ownerRole: string; ownerName: string | null; dueOffsetDays: number; required: boolean; completed: boolean; issues: Issue[] };
type EmployeeResource = { stageCode: string; resourceId: number; title: string; description: string | null; format: string; externalUrl: string | null; downloadUrl: string | null };
type Stage = { id: number; code: string; name: string; description: string; durationLabel: string | null; ownerDepartment: string | null };
type Plan = { configured: boolean; tasks: EmployeeTask[]; resources: EmployeeResource[] };

function EmployeeJourneyView({ resetVersion, employeeId }: { resetVersion: number; employeeId: number }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [plan, setPlan] = useState<Plan>({ configured: false, tasks: [], resources: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [confirmingTask, setConfirmingTask] = useState<EmployeeTask | null>(null);
  const [reportingTaskId, setReportingTaskId] = useState<number | null>(null);
  const [issueText, setIssueText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelectedCode(null), [resetVersion]);

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
    }).catch((loadError: unknown) => { if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar sua jornada."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [employeeId]);

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
  const resources = stage ? plan.resources.filter((resource) => resource.stageCode === stage.code) : [];

  async function completeTask(task: EmployeeTask) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/me/plan/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar a conclusão.");
      setPlan((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, completed: true } : item) }));
      setConfirmingTask(null);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a conclusão."); }
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

  if (stage) {
    const doneCount = tasks.filter((task) => task.completed).length;
    const stageIssues = tasks.flatMap((task) => task.issues.map((issue) => ({ ...issue, taskTitle: task.title })));
    return <section>
      <button className="journey-detail__back" onClick={() => setSelectedCode(null)} type="button"><Icon name="arrow" size={17} /> Voltar para minha jornada</button>
      <div className="journey-detail__hero mt-5"><div><span className="journey-detail__step-label">Etapa {stages.findIndex((item) => item.code === stage.code) + 1} de {stages.length}</span><h1>{stage.name}</h1><p>{stage.description}</p><div className="journey-detail__meta"><div className="journey-detail__meta-item"><span><Icon name="clock" size={19} /></span><div><small>Período</small><strong>{stage.durationLabel || "Não definido"}</strong></div></div><div className="journey-detail__meta-item"><span><Icon name="user" size={19} /></span><div><small>Responsável</small><strong>{stage.ownerDepartment || "Não definido"}</strong></div></div></div></div><div className="journey-detail__progress"><strong>{stageProgress(stage.code)}%</strong><span>concluído</span></div></div>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-6 grid gap-5">
        <div className="content-panel"><p className="eyebrow">Materiais de apoio</p><div className="mt-4 grid grid-cols-2 gap-2">{resources.map((resource) => { const href = resource.externalUrl ?? resource.downloadUrl; return href ? <a className="journey-detail__material" href={href} key={resource.resourceId} rel="noreferrer" target="_blank"><span><Icon name="book" size={16} /></span><strong>{resource.title}</strong><Icon name="chevron" size={14} /></a> : <div className="journey-detail__material" key={resource.resourceId}><span><Icon name="book" size={16} /></span><strong>{resource.title}</strong></div>; })}{resources.length === 0 && <p className="col-span-2 rounded-xl bg-[#fafafe] p-4 text-sm text-[#85879a]">Nenhum material foi associado a esta etapa.</p>}</div></div>
        <div className="content-panel"><StageSummary eyebrow="Atividades da etapa" title="Tarefas e orientações" description="Acompanhe as atividades que o RH atribuiu à sua jornada." stats={[{ value: doneCount, label: "Concluídas", tone: "success" }, { value: tasks.length - doneCount, label: "Pendentes", tone: "warning" }, { value: stageIssues.length, label: "Problemas informados", tone: "danger" }]} />
          <div className="task-card-list journey-detail__task-list">{tasks.length ? tasks.map((task) => <TaskCard key={task.id} title={task.title} detail={task.description} category={task.category} owner={task.ownerName ?? task.ownerRole} required={task.required} icon={taskIcon(task.taskType)} status={task.completed ? "Concluído" : "Pendente"} onReport={() => { setReportingTaskId(task.id); setIssueText(""); }} onResolve={!task.completed ? () => setConfirmingTask(task) : undefined} />) : <p className="rounded-xl border border-dashed border-[#dedeeb] bg-[#fafafe] p-6 text-center text-sm text-[#85879a]">O RH ainda não adicionou tarefas a esta etapa.</p>}</div>
          {reportingTaskId !== null && <form className="journey-issue" onSubmit={reportIssue}><div className="journey-issue__heading"><div><p className="eyebrow">Novo problema</p><strong>{tasks.find(({ id }) => id === reportingTaskId)?.title}</strong></div><button type="button" onClick={() => setReportingTaskId(null)}>Cancelar</button></div><textarea required maxLength={2000} value={issueText} onChange={(event) => setIssueText(event.target.value)} placeholder="Descreva o problema ou o que está faltando..." /><button className="journey-issue__submit" disabled={saving} type="submit">{saving ? "Enviando..." : "Enviar para o responsável"}</button></form>}
          {stageIssues.length > 0 && <div className="journey-issue__history"><p className="eyebrow">Problemas informados</p>{stageIssues.map((issue) => <div className="journey-issue__item" key={issue.id}><span><Icon name="clock" size={15} /></span><div><strong>{issue.taskTitle}</strong><small>{issue.description}</small></div><em>Enviado</em></div>)}</div>}
        </div>
      </div>
      {confirmingTask && <div className="modal__backdrop" role="presentation" onMouseDown={() => setConfirmingTask(null)}><div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="journey-resolution-title" onMouseDown={(event) => event.stopPropagation()}><div className="grid size-12 place-items-center rounded-2xl bg-[#e7f7ef] text-[#288b65]"><Icon name="check" size={23} /></div><h2 id="journey-resolution-title">Marcar como concluída?</h2><p>Você confirma que a tarefa <strong>{confirmingTask.title}</strong> já foi concluída?</p><div className="mt-6 flex gap-3"><button className="modal__secondary" disabled={saving} onClick={() => setConfirmingTask(null)} type="button">Cancelar</button><button className="modal__confirm" disabled={saving} onClick={() => void completeTask(confirmingTask)} type="button"><Icon name="check" size={16} /> {saving ? "Salvando..." : "Sim, está concluída"}</button></div></div></div>}
    </section>;
  }

  return <section><p className="eyebrow">Seu onboarding</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Minha jornada</h1><p className="mt-2 text-[#777a91]">Acompanhe o progresso das atividades e os materiais da sua jornada.</p>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    {!plan.configured && <p className="mt-5 rounded-xl border border-[#e8e8f0] bg-white p-4 text-sm text-[#777a91]">O RH ainda não configurou seu padrão de onboarding. As atividades aparecerão aqui quando estiver pronto.</p>}
    <div className="mt-8 max-w-4xl space-y-4">{stages.map((item, index) => { const stageTasks = tasksByStage.get(item.code) ?? []; const progress = stageProgress(item.code); const done = stageTasks.length > 0 && progress === 100; return <button className={`journey-stage-card ${firstIncomplete === item.code ? "journey-stage-card--current" : ""}`} key={item.code} onClick={() => setSelectedCode(item.code)} type="button"><div className={`journey-stage__number ${done ? "bg-[#e6f7ef] text-[#239766]" : ""}`}>{done ? <Icon name="check" size={17} /> : index + 1}</div><div className="min-w-0 flex-1 text-left"><h2 className="font-extrabold">{item.name}</h2><p className="mt-1 text-sm text-[#81849a]">{item.description}</p></div><div className="hidden text-right sm:block"><strong className="block text-sm text-[#5556d8]">{progress}%</strong><small className="text-[10px] text-[#9698aa]">{stageTasks.length} {stageTasks.length === 1 ? "tarefa" : "tarefas"}</small></div><Icon name="chevron" size={18} /></button>; })}{stages.length === 0 && <p className="rounded-xl bg-white p-5 text-sm text-[#85879a]">Não há etapas disponíveis.</p>}</div>
  </section>;
}

function taskIcon(type: EmployeeTask["taskType"]): IconName { return type === "training" ? "book" : type === "checkin" ? "calendar" : type === "preparation" ? "tools" : "check"; }
export default EmployeeJourneyView;
