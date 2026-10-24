import "../styles/journey.css";
import { useEffect, useState } from "react";
import { Icon } from "../components/shared";
import TaskCard from "../components/TaskCard";
import StageSummary from "../components/StageSummary";
import { journeyStages as defaultJourneyStages } from "../data/journeyStages";
import type { StageTask } from "../data/journeyStages";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import PreOnboardingPanel, { preparationItems } from "./PreOnboardingPanel";

type EmployeePlanTask = { stageCode: string; title: string; description: string; category: string; taskType: "task" | "preparation" | "training" | "checkin"; ownerRole: string; ownerName?: string | null; dueOffsetDays: number; required: boolean };
type EmployeePlanResource = { stageCode: string; resourceId: number; title: string; description: string | null; format: string; blobName: string | null; externalUrl: string | null; downloadUrl: string | null };

function JourneyView({ resetVersion, employeeId }: { resetVersion: number; employeeId: number }) {
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [taskOverrides, setTaskOverrides] = useLocalStorageState<Record<string, boolean>>(`onramp.taskOverrides.${employeeId}`, {});
  const [resolvedTasks, setResolvedTasks] = useLocalStorageState<string[]>(`onramp.resolvedTasks.${employeeId}`, []);
  const [confirmingTask, setConfirmingTask] = useState<string | null>(null);
  const [reportingTask, setReportingTask] = useState<string | null>(null);
  const [issueText, setIssueText] = useState("");
  const [reportedIssues, setReportedIssues] = useLocalStorageState<{ title: string; description: string }[]>(`onramp.reportedIssues.${employeeId}`, []);
  useEffect(() => setSelectedStage(null), [resetVersion]);
  const initialPreparationProgress = Math.round(
    (preparationItems.filter((item) => item.status === "Concluído").length / preparationItems.length) * 100,
  );
  const [preparationProgress, setPreparationProgress] = useLocalStorageState(`onramp.preparationProgress.${employeeId}`, initialPreparationProgress);
  const [accountPlan, setAccountPlan] = useState<{ configured: boolean; tasks: EmployeePlanTask[]; resources: EmployeePlanResource[] }>({ configured: false, tasks: [], resources: [] });
  useEffect(() => {
    fetch("/api/me/plan")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load this employee plan.");
        return response.json();
      })
      .then((result: { configured: boolean; tasks: EmployeePlanTask[]; resources: EmployeePlanResource[] }) => setAccountPlan(result))
      .catch(() => setAccountPlan({ configured: false, tasks: [], resources: [] }));
  }, [employeeId]);

  const journeyStages = defaultJourneyStages.map((stage) => {
    const assignedTasks = accountPlan.tasks.filter((task) => task.stageCode === stage.code);
    const assignedResources = accountPlan.resources.filter((resource) => resource.stageCode === stage.code);
    return {
      ...stage,
      tasks: accountPlan.configured ? assignedTasks.map((task): StageTask => ({
        title: task.title,
        description: task.dueOffsetDays ? `${task.description} Prazo: até o dia ${task.dueOffsetDays}.` : task.description,
        completed: false,
        category: task.category,
        icon: task.taskType === "training" ? "book" : task.taskType === "checkin" ? "calendar" : task.taskType === "preparation" ? "tools" : "check",
        owner: task.ownerName ?? task.ownerRole,
        required: task.required,
      })) : stage.tasks,
      materials: accountPlan.configured ? assignedResources.map((resource) => resource.title) : stage.materials,
    };
  });
  useEffect(() => {
    if (!accountPlan.configured) return;
    const requiredTasks = accountPlan.tasks.filter((task) => task.stageCode === "pre-entry" && task.required);
    const completed = requiredTasks.filter((task) => taskOverrides[`0:${task.title}`]).length;
    setPreparationProgress(requiredTasks.length ? Math.round((completed / requiredTasks.length) * 100) : 100);
  }, [accountPlan, employeeId]);
  const getCurrentStageProgress = (stageIndex: number) => {
    const tasks = journeyStages[stageIndex].tasks.filter(({ required }) => required !== false);
    const completed = tasks.filter(({ title, completed: initialState }) => taskOverrides[`${stageIndex}:${title}`] ?? initialState).length;
    return tasks.length ? Math.round((completed / tasks.length) * 100) : journeyStages[stageIndex].tasks.length ? 100 : 0;
  };

  if (selectedStage !== null) {
    const stage = journeyStages[selectedStage];
    const detail = stage;
    const taskKey = (title: string) => `${selectedStage}:${title}`;
    const isTaskDone = (task: (typeof detail.tasks)[number]) => taskOverrides[taskKey(task.title)] ?? task.completed;
    const doneTasks = detail.tasks.filter(isTaskDone).length;
    const overdueTasks = detail.tasks.filter((task) => task.overdue && !isTaskDone(task)).length;
    const pendingTasks = detail.tasks.length - doneTasks - overdueTasks;
    const progress = selectedStage === 0 ? preparationProgress : getCurrentStageProgress(selectedStage);
    return (
      <section>
        <button className="journey-detail__back" onClick={() => setSelectedStage(null)}><Icon name="arrow" size={17} /> Voltar para minha jornada</button>
        <div className="journey-detail__hero mt-5">
          <div>
            <span className="journey-detail__step-label">Etapa {selectedStage + 1} de {journeyStages.length}</span>
            <h1>{stage.label}</h1>
            <p>{detail.description}</p>
            <div className="journey-detail__meta">
              <div className="journey-detail__meta-item">
                <span><Icon name="clock" size={19} /></span>
                <div><small>Período</small><strong>{detail.duration}</strong></div>
              </div>
              <div className="journey-detail__meta-item">
                <span><Icon name="user" size={19} /></span>
                <div><small>Responsável</small><strong>{detail.owner}</strong></div>
              </div>
            </div>
          </div>
          <div className="journey-detail__progress">
            <strong>{progress}%</strong>
            <span>concluído</span>
          </div>
        </div>

        <div className="mt-6 grid gap-5">
          <div className="content-panel">
            <p className="eyebrow">Materiais de apoio</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {detail.materials.map((material) => {
                const resource = accountPlan.resources.find((item) => item.stageCode === detail.code && item.title === material);
                const resourceUrl = resource?.externalUrl ?? resource?.downloadUrl ?? (resource?.blobName ? `/${resource.blobName}` : null);
                const content = <><span><Icon name="book" size={16} /></span><strong>{material}</strong><Icon name="chevron" size={14} /></>;
                return resourceUrl
                  ? <a className="journey-detail__material" href={resourceUrl} key={material} rel="noreferrer" target="_blank">{content}</a>
                  : <button className="journey-detail__material" key={material} type="button">{content}</button>;
              })}
              {detail.materials.length === 0 && <p className="col-span-2 rounded-xl bg-[#fafafe] p-4 text-sm text-[#85879a]">Nenhum material foi associado a esta etapa.</p>}
            </div>
          </div>

          {selectedStage !== 0 && <div className="content-panel">
            <StageSummary
              eyebrow={detail.overviewEyebrow}
              title={detail.overviewTitle}
              description={detail.overviewDescription}
              stats={[
                { value: doneTasks, label: "Concluídas", tone: "success" },
                { value: pendingTasks, label: "Pendentes", tone: "warning" },
                { value: overdueTasks, label: "Atrasadas", tone: "danger" },
              ]}
            />
            <div className="task-card-list journey-detail__task-list">
              {detail.tasks.length ? detail.tasks.map((task) => {
                const { title, description, completed: initiallyDone, category, icon, owner, required } = task;
                const key = taskKey(title);
                const done = taskOverrides[key] ?? initiallyDone;
                const resolved = resolvedTasks.includes(key);
                const status = resolved ? "Resolvido" : done ? "Concluído" : task.overdue ? "Atrasado" : "Pendente";
                return <TaskCard
                  key={title}
                  title={title}
                  detail={description}
                  category={category}
                  owner={owner}
                  required={required}
                  icon={icon}
                  status={status}
                  onReport={() => { setReportingTask(key); setIssueText(""); }}
                  onResolve={!done && !resolved ? () => setConfirmingTask(key) : undefined}
                />;
              }) : <p className="rounded-xl border border-dashed border-[#dedeeb] bg-[#fafafe] p-6 text-center text-sm text-[#85879a]">Nenhuma tarefa foi associada a esta etapa.</p>}
            </div>
            {reportingTask && (
              <form className="journey-issue" onSubmit={(event) => {
                event.preventDefault();
                const task = detail.tasks.find(({ title }) => taskKey(title) === reportingTask);
                if (task) setReportedIssues((current) => [...current, { title: task.title, description: issueText }]);
                setReportingTask(null);
                setIssueText("");
              }}>
                <div className="journey-issue__heading"><div><p className="eyebrow">Novo problema</p><strong>{detail.tasks.find(({ title }) => taskKey(title) === reportingTask)?.title}</strong></div><button type="button" onClick={() => setReportingTask(null)}>Cancelar</button></div>
                <textarea required value={issueText} onChange={(event) => setIssueText(event.target.value)} placeholder="Descreva o problema ou o que está faltando..." />
                <button className="journey-issue__submit" type="submit">Enviar para o responsável</button>
              </form>
            )}
            {reportedIssues.length > 0 && <div className="journey-issue__history">
              <p className="eyebrow">Problemas informados</p>
              {reportedIssues.map((issue, index) => <div className="journey-issue__item" key={`${issue.title}-${index}`}><span><Icon name="clock" size={15} /></span><div><strong>{issue.title}</strong><small>{issue.description}</small></div><em>Em análise</em></div>)}
            </div>}
          </div>}
        </div>

        <div className={selectedStage === 0 ? "" : "hidden"}>
          <PreOnboardingPanel
            employeeId={employeeId}
            useCustomPlan={accountPlan.configured}
            plannedTasks={detail.tasks}
            onProgressChange={(completed, total) => setPreparationProgress(Math.round((completed / total) * 100))}
          />
        </div>
        {confirmingTask && (
          <div className="modal__backdrop" role="presentation" onMouseDown={() => setConfirmingTask(null)}>
            <div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="journey-resolution-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="grid size-12 place-items-center rounded-2xl bg-[#e7f7ef] text-[#288b65]"><Icon name="check" size={23} /></div>
              <h2 id="journey-resolution-title">Marcar como resolvido?</h2>
              <p>Você confirma que a tarefa <strong>{detail.tasks.find(({ title }) => taskKey(title) === confirmingTask)?.title}</strong> já foi concluída?</p>
              <div className="mt-6 flex gap-3">
                <button className="modal__secondary" onClick={() => setConfirmingTask(null)}>Cancelar</button>
                <button className="modal__confirm" onClick={() => {
                  setTaskOverrides((current) => ({ ...current, [confirmingTask]: true }));
                  setResolvedTasks((current) => [...current, confirmingTask]);
                  setConfirmingTask(null);
                }}><Icon name="check" size={16} /> Sim, está resolvido</button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">Seu onboarding</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Minha jornada</h1>
      <p className="mt-2 text-[#777a91]">Acompanhe seu progresso e acesse as atividades de cada etapa.</p>
      <div className="mt-8 max-w-4xl space-y-4">
        {journeyStages.map((stage, index) => (
          <button className={`journey-stage-card ${stage.status === "current" ? "journey-stage-card--current" : ""}`} key={stage.label} onClick={() => setSelectedStage(index)}>
            <div className={`journey-stage__number ${stage.status === "done" ? "bg-[#e6f7ef] text-[#239766]" : ""}`}>{stage.status === "done" ? <Icon name="check" size={17} /> : index + 1}</div>
            <div className="min-w-0 flex-1 text-left"><h2 className="font-extrabold">{stage.label}</h2><p className="mt-1 text-sm text-[#81849a]">{stage.description}</p></div>
            <div className="hidden text-right sm:block"><strong className="block text-sm text-[#5556d8]">{index === 0 ? preparationProgress : getCurrentStageProgress(index)}%</strong><small className="text-[10px] text-[#9698aa]">{stage.date}</small></div>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
    </section>
  );
}
export default JourneyView;
