import "../styles/preparation.css";
import { useState } from "react";
import type { FormEvent } from "react";
import StageSummary from "../components/StageSummary";
import TaskCard from "../components/TaskCard";
import { Icon, type IconName } from "../components/shared";
import { journeyStages } from "../data/journeyStages";
import type { StageTask } from "../data/journeyStages";
import { useLocalStorageState } from "../hooks/useLocalStorageState";

type PreparationItem = {
  name: string;
  detail: string;
  category: string;
  owner: string;
  status: "Concluído" | "Pendente" | "Atrasado";
  icon: IconName;
};

export const preparationItems: PreparationItem[] = [
  { name: "Notebook corporativo", detail: "MacBook Pro 14” · Retirado em 01/10/2026", category: "Equipamento", owner: "Tecnologia", status: "Concluído", icon: "tools" },
  { name: "Conta Google Workspace", detail: "E-mail e calendário corporativo", category: "Conta", owner: "Tecnologia", status: "Concluído", icon: "mail" },
  { name: "Conta Slack", detail: "Conta criada com seu e-mail corporativo", category: "Conta", owner: "Tecnologia", status: "Concluído", icon: "mail" },
  { name: "Acesso Slack", detail: "Entrada nos canais internos · Prazo: 03/10/2026", category: "Acesso", owner: "Tecnologia", status: "Pendente", icon: "people" },
];

const preEntryOverview = journeyStages[0];

function PreOnboardingPanel({ onProgressChange, employeeId, plannedTasks, useCustomPlan }: { onProgressChange: (completed: number, total: number) => void; employeeId: number; plannedTasks: StageTask[]; useCustomPlan: boolean }) {
  const items: PreparationItem[] = useCustomPlan
    ? plannedTasks.map((task) => ({
        name: task.title,
        detail: task.description,
        category: task.category,
        owner: task.owner,
        status: task.completed ? "Concluído" : task.overdue ? "Atrasado" : "Pendente",
        icon: task.icon,
      }))
    : preparationItems;
  const [reporting, setReporting] = useState<string | null>(null);
  const [sentIssues, setSentIssues] = useLocalStorageState<string[]>(`onramp.preparationIssues.${employeeId}`, []);
  const [resolvedItems, setResolvedItems] = useLocalStorageState<string[]>(`onramp.resolvedPreparationItems.${employeeId}`, []);
  const [confirmResolution, setConfirmResolution] = useState<string | null>(null);
  const preparedCount = items.filter((item) => item.status === "Concluído" || resolvedItems.includes(item.name)).length;
  const pendingCount = items.filter((item) => item.status === "Pendente" && !resolvedItems.includes(item.name)).length;
  const delayedCount = items.filter((item) => item.status === "Atrasado" && !resolvedItems.includes(item.name)).length;

  function sendIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reporting) setSentIssues((issues) => [...issues, reporting]);
    setReporting(null);
  }

  return (
    <section className="preparation mt-6">
      <StageSummary
        eyebrow={preEntryOverview.overviewEyebrow}
        title={preEntryOverview.overviewTitle}
        description={preEntryOverview.overviewDescription}
        stats={[
          { value: preparedCount, label: "Preparados", tone: "success" },
          { value: pendingCount, label: "No prazo", tone: "warning" },
          { value: delayedCount, label: "Prazo vencido", tone: "danger" },
        ]}
      />

      <div className="task-card-list preparation__list">
        {items.length ? items.map((item) => {
          const resolved = resolvedItems.includes(item.name);
          const currentStatus = resolved ? "Resolvido" : item.status;
          const statusLabel = currentStatus === "Pendente"
            ? "Pendente · no prazo"
            : currentStatus === "Atrasado"
              ? "Atrasado · prazo vencido"
              : currentStatus;
          return <TaskCard
            key={item.name}
            title={item.name}
            detail={item.detail}
            category={item.category}
            owner={item.owner}
            icon={item.icon}
            status={currentStatus}
            statusLabel={statusLabel}
            onReport={() => setReporting(item.name)}
            onResolve={item.status !== "Concluído" && !resolved ? () => setConfirmResolution(item.name) : undefined}
          />;
        }) : <p className="rounded-xl border border-dashed border-[#dedeeb] bg-[#fafafe] p-6 text-center text-sm text-[#85879a]">O RH ainda não adicionou tarefas para esta etapa.</p>}
      </div>

      {(sentIssues.length > 0 || reporting) && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {reporting && (
            <form className="issue-report" onSubmit={sendIssue}>
              <div className="flex items-start justify-between gap-4">
                <div><p className="eyebrow">Novo problema</p><h3 className="mt-1 font-extrabold">{reporting}</h3></div>
                <button className="text-xs font-bold text-[#85879a]" onClick={() => setReporting(null)} type="button">Cancelar</button>
              </div>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-bold text-[#55576d]">O que aconteceu?</span>
                <textarea required placeholder="Descreva o problema ou o que está faltando..." />
              </label>
              <button className="button-primary mt-3 h-11 w-full" type="submit">Enviar para o responsável <Icon name="arrow" size={16} /></button>
            </form>
          )}
          {sentIssues.length > 0 && (
            <div className="issue-report__history">
              <p className="eyebrow">Problemas informados</p>
              {sentIssues.map((issue, index) => (
                <div className="mt-3 flex items-center gap-3" key={`${issue}-${index}`}>
                  <span className="grid size-9 place-items-center rounded-xl bg-[#fff1dc] text-[#b87927]"><Icon name="clock" size={16} /></span>
                  <div className="flex-1"><h3 className="text-xs font-extrabold">{issue}</h3><p className="mt-1 text-[10px] text-[#9193a5]">Enviado para o responsável</p></div>
                  <span className="status-badge status-badge--pendente">Em análise</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirmResolution && (
        <div className="modal__backdrop" role="presentation" onMouseDown={() => setConfirmResolution(null)}>
          <div className="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="resolution-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="grid size-12 place-items-center rounded-2xl bg-[#e7f7ef] text-[#288b65]"><Icon name="check" size={23} /></div>
            <h2 id="resolution-title">Marcar como resolvido?</h2>
            <p>Você confirma que o item <strong>{confirmResolution}</strong> já foi regularizado e está pronto para uso?</p>
            <div className="mt-6 flex gap-3">
              <button className="modal__secondary" onClick={() => setConfirmResolution(null)}>Cancelar</button>
              <button
                className="modal__confirm"
                onClick={() => {
                  const nextResolvedItems = [...resolvedItems, confirmResolution];
                  const completed = items.filter((item) => item.status === "Concluído" || nextResolvedItems.includes(item.name)).length;
                  setResolvedItems(nextResolvedItems);
                  onProgressChange(completed, items.length);
                  setConfirmResolution(null);
                }}
              >
                <Icon name="check" size={16} /> Sim, está resolvido
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
export default PreOnboardingPanel;
