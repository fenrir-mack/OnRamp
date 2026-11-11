import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import EmployeeAvatar from "../components/EmployeeAvatar";

type PreparationIssue = { id: number; description: string; status: "open" | "in_review" | "resolved"; resolutionNote: string | null; createdAt: string };
type PreparationHistoryEntry = { id: number; actorName: string; action: string; previousValue: string | null; newValue: string | null; comment: string | null; createdAt: string };
type PreparationTask = {
  id: number; employeeId: number; employeeName: string; title: string; description: string; category: string;
  ownerEmployeeId: number | null; ownerName: string | null; ownerRole: string; departmentId: number | null;
  department: string | null; dueOffsetDays: number; startDate: string; dueDate: string;
  status: "not_started" | "in_progress" | "waiting_third_party" | "blocked" | "ready" | "cancelled" | "not_applicable";
  trackingUrl: string | null; openIssueCount: number; issues: PreparationIssue[]; history: PreparationHistoryEntry[];
};

const statusLabels: Record<PreparationTask["status"], string> = {
  not_started: "A iniciar", in_progress: "Em andamento", waiting_third_party: "Aguardando terceiro", blocked: "Bloqueado", ready: "Pronto", cancelled: "Cancelado", not_applicable: "Não se aplica",
};
const preparationCategoryOrder = ["Jurídico", "TI", "Equipamento", "Contas e acessos", "Financeiro", "Pessoas & Cultura", "Geral"];
const closedStatuses = new Set<PreparationTask["status"]>(["ready", "cancelled", "not_applicable"]);

function PreparationView() {
  const [tasks, setTasks] = useState<PreparationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [statusEdits, setStatusEdits] = useState<Record<number, { status: PreparationTask["status"]; comment: string }>>({});
  const [queueView, setQueueView] = useState<"people" | "tasks">("people");
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [taskSort, setTaskSort] = useState<"people" | "urgency">("people");
  const [nameQuery, setNameQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/preparation/tasks").then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result.tasks as PreparationTask[]; })
      .then((queue) => { if (active) setTasks(queue); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a preparação."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function updateStatus(task: PreparationTask, status: PreparationTask["status"], comment: string) {
    setSavingId(task.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/preparation/tasks/${task.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, comment }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o estado.");
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: result.status, history: result.history ? [result.history, ...item.history] : item.history } : item));
      setStatusEdits((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setNotice("Estado do item atualizado.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível atualizar o estado."); }
    finally { setSavingId(null); }
  }

  async function claimTask(task: PreparationTask) {
    setSavingId(task.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/preparation/tasks/${task.id}/claim`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível assumir a tarefa.");
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ownerEmployeeId: result.ownerEmployeeId, ownerName: result.ownerName, history: result.history ? [result.history, ...item.history] : item.history } : item));
      setNotice("Você assumiu esta tarefa.");
    } catch (claimError) { setError(claimError instanceof Error ? claimError.message : "Não foi possível assumir a tarefa."); }
    finally { setSavingId(null); }
  }

  async function saveTrackingLink(event: FormEvent<HTMLFormElement>, task: PreparationTask) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingId(task.id); setError(""); setNotice("");
    try {
      const data = { trackingUrl: String(form.get("trackingUrl") ?? "") };
      const response = await fetch(`/api/preparation/tasks/${task.id}/shipment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o rastreio.");
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...result } : item));
      setNotice("Link de rastreio salvo.");
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

  const today = new Date().toISOString().slice(0, 10);
  function compareUrgency(left: PreparationTask, right: PreparationTask) {
    const leftClosed = closedStatuses.has(left.status);
    const rightClosed = closedStatuses.has(right.status);
    if (leftClosed !== rightClosed) return leftClosed ? 1 : -1;
    const leftOverdue = !leftClosed && left.dueDate.slice(0, 10) < today;
    const rightOverdue = !rightClosed && right.dueDate.slice(0, 10) < today;
    if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
    const leftNotStarted = left.status === "not_started";
    const rightNotStarted = right.status === "not_started";
    if (leftNotStarted !== rightNotStarted) return leftNotStarted ? -1 : 1;
    return left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title, "pt-BR");
  }
  const peopleGroups = [...tasks.reduce((groups, task) => {
    const person = groups.get(task.employeeId) ?? { employeeId: task.employeeId, employeeName: task.employeeName, department: task.department, startDate: task.startDate, tasks: [] as PreparationTask[] };
    person.tasks.push(task);
    groups.set(task.employeeId, person);
    return groups;
  }, new Map<number, { employeeId: number; employeeName: string; department: string | null; startDate: string; tasks: PreparationTask[] }>()).values()]
    .map((person) => {
      const categories = [...new Set(person.tasks.map((task) => task.category.trim() || "Geral"))].map((category) => ({
        category,
        tasks: person.tasks.filter((task) => (task.category.trim() || "Geral") === category).sort(compareUrgency),
      }));
      categories.sort((left, right) => {
        const urgency = compareUrgency(left.tasks[0], right.tasks[0]);
        if (urgency) return urgency;
        const leftOrder = preparationCategoryOrder.indexOf(left.category);
        const rightOrder = preparationCategoryOrder.indexOf(right.category);
        if (leftOrder >= 0 || rightOrder >= 0) return (leftOrder < 0 ? Number.MAX_SAFE_INTEGER : leftOrder) - (rightOrder < 0 ? Number.MAX_SAFE_INTEGER : rightOrder);
        return left.category.localeCompare(right.category, "pt-BR");
      });
      return { ...person, categories, tasks: person.tasks.sort(compareUrgency), nextTask: person.tasks.find((task) => !closedStatuses.has(task.status)) };
    })
    .sort((left, right) => left.nextTask && right.nextTask ? compareUrgency(left.nextTask, right.nextTask) : left.nextTask ? -1 : right.nextTask ? 1 : left.employeeName.localeCompare(right.employeeName, "pt-BR"));
  const selectedPerson = peopleGroups.find((person) => person.employeeId === selectedEmployeeId) ?? null;
  const sharedTaskGroups = [...tasks.reduce((groups, task) => {
    if (closedStatuses.has(task.status)) return groups;
    const key = task.title.trim().toLocaleLowerCase("pt-BR");
    const group = groups.get(key) ?? { title: task.title, category: task.category, tasks: [] as PreparationTask[] };
    group.tasks.push(task);
    groups.set(key, group);
    return groups;
  }, new Map<string, { title: string; category: string; tasks: PreparationTask[] }>()).values()]
    .filter((group) => new Set(group.tasks.map((task) => task.employeeId)).size >= 2)
    .map((group) => {
      const people = [...new Map(group.tasks.map((task) => [task.employeeId, task])).values()];
      const nextTask = [...group.tasks].sort(compareUrgency)[0];
      const overdueCount = group.tasks.filter((task) => task.dueDate.slice(0, 10) < today).length;
      return { ...group, people, nextTask, overdueCount };
    })
    .sort((left, right) => taskSort === "people"
      ? right.people.length - left.people.length || right.overdueCount - left.overdueCount || compareUrgency(left.nextTask, right.nextTask)
      : right.overdueCount - left.overdueCount || compareUrgency(left.nextTask, right.nextTask) || right.people.length - left.people.length);
  const normalizedNameQuery = nameQuery.trim().toLocaleLowerCase("pt-BR");
  const filteredPeopleGroups = peopleGroups.filter((person) => person.employeeName.toLocaleLowerCase("pt-BR").includes(normalizedNameQuery));
  const visiblePeopleGroups = showAllPeople ? filteredPeopleGroups : filteredPeopleGroups.slice(0, 8);
  const visibleSharedTaskGroups = sharedTaskGroups.filter((group) => !normalizedNameQuery || group.people.some((person) => person.employeeName.toLocaleLowerCase("pt-BR").includes(normalizedNameQuery)));

  return <section>
    {!selectedPerson && <h1 className="text-3xl font-extrabold tracking-tight">Novas admissões</h1>}
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
    {notice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">{notice}</p>}
    <div className="mt-6 space-y-5">{loading ? <p className="content-panel text-sm text-[#85879a]">Carregando a fila de preparação...</p> : selectedPerson ? <>
      <button className="rounded-xl border border-[#e3e3ed] bg-white px-4 py-2.5 text-sm font-bold text-[#5556d8] hover:bg-[#fafafe]" onClick={() => setSelectedEmployeeId(null)} type="button">← Voltar</button>
      <article className="content-panel space-y-4" key={selectedPerson.employeeId}>
      <header className="flex flex-wrap items-center gap-3 border-b border-[#eeeeF4] pb-4">
        <EmployeeAvatar employeeId={selectedPerson.employeeId} name={selectedPerson.employeeName} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e9e8ff] text-sm font-extrabold text-[#5859d6]" />
        <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-extrabold text-[#303249]">{selectedPerson.employeeName}</h2><p className="mt-0.5 text-xs text-[#777a91]">{selectedPerson.department ?? "Área não definida"} · Entrada {formatDate(selectedPerson.startDate)}</p></div>
        <div className="flex gap-2 text-xs"><span className="rounded-full bg-[#f5f5f9] px-3 py-1.5 font-bold text-[#55576d]">{selectedPerson.tasks.length} tarefas</span><span className="rounded-full bg-red-50 px-3 py-1.5 font-bold text-red-700">{selectedPerson.tasks.filter((task) => !closedStatuses.has(task.status) && task.dueDate.slice(0, 10) < today).length} atrasadas</span></div>
      </header>
      <div className="space-y-4">{selectedPerson.categories.map((category) => <section aria-label={`${category.category} — ${selectedPerson.employeeName}`} className="space-y-2" key={category.category}>
        <h3 className="flex items-center gap-2 border-b border-[#eeeeF4] pb-2 text-xs font-extrabold uppercase tracking-wide text-[#686a80]"><span className="h-4 w-1 rounded-full bg-[#6566dc]" />{category.category}<span className="rounded-full bg-[#f0efff] px-2 py-0.5 text-[10px] text-[#5556d8]">{category.tasks.length}</span></h3>
        {category.tasks.map((task) => {
          const dueDate = task.dueDate.slice(0, 10);
          const overdue = !closedStatuses.has(task.status) && dueDate < today;
          const dueLabel = overdue ? `Atrasada · ${formatDate(dueDate)}` : dueDate === today ? "Vence hoje" : `Prazo ${formatDate(dueDate)}`;
          return <article className="rounded-xl border border-[#ededf3] bg-white px-3 py-3 sm:px-4" key={task.id}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1"><h4 className="font-bold text-[#303249]">{task.title}</h4><p className={`mt-1 text-xs font-semibold ${overdue ? "text-red-700" : "text-[#85879a]"}`}>{dueLabel} · {task.ownerName ? `Responsável: ${task.ownerName}` : `Sugestão: ${task.ownerRole}`}</p></div>
              <div className="flex flex-wrap items-center gap-2">{!task.ownerEmployeeId && <button className="rounded-lg border border-[#dadaf0] bg-[#f8f8ff] px-2.5 py-2 text-xs font-bold text-[#5556d8] hover:bg-[#efefff]" disabled={savingId === task.id} onClick={() => void claimTask(task)} type="button">Assumir tarefa</button>}<label className="flex items-center gap-2 text-xs font-bold text-[#55576d]">Estado<select aria-label={`Estado: ${task.title}`} className="rounded-lg border border-[#e3e3ed] bg-white px-2.5 py-2 text-xs" disabled={savingId === task.id} value={statusEdits[task.id]?.status ?? task.status} onChange={(event) => setStatusEdits((current) => ({ ...current, [task.id]: { status: event.target.value as PreparationTask["status"], comment: current[task.id]?.comment ?? "" } }))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
              {statusEdits[task.id] && <div className="basis-full rounded-xl border border-[#e8e8f0] bg-[#fafafe] p-3"><label className="block text-xs font-bold text-[#55576d]">Comentário sobre a situação <span className="font-normal text-[#85879a]">(opcional)</span><textarea className="mt-1.5 min-h-16 w-full rounded-lg border border-[#e3e3ed] bg-white p-2.5 text-xs font-normal" maxLength={2000} placeholder="Explique o contexto ou o que falta para avançar." value={statusEdits[task.id].comment} onChange={(event) => setStatusEdits((current) => ({ ...current, [task.id]: { ...current[task.id], comment: event.target.value } }))} /></label><div className="mt-2 flex justify-end gap-2"><button className="rounded-lg px-3 py-2 text-xs font-bold text-[#777a91]" onClick={() => setStatusEdits((current) => { const next = { ...current }; delete next[task.id]; return next; })} type="button">Cancelar</button><button className="rounded-lg bg-[#5556d8] px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={savingId === task.id} onClick={() => void updateStatus(task, statusEdits[task.id].status, statusEdits[task.id].comment)} type="button">Salvar atualização</button></div></div>}
              <details className="basis-full border-t border-[#f0f0f5] pt-2 text-xs text-[#777a91]"><summary className="w-fit cursor-pointer font-bold text-[#5556d8]">Detalhes{task.openIssueCount ? ` · ${task.openIssueCount} problema(s)` : ""}</summary>
                <div className="mt-3 space-y-3">{task.description && <p className="leading-5">{task.description}</p>}
                  {task.category === "Equipamento" && <form className="flex flex-col gap-2 rounded-xl bg-[#fafafe] p-3 sm:flex-row sm:items-end" onSubmit={(event) => void saveTrackingLink(event, task)}><label className="min-w-0 flex-1 font-bold">Link de rastreio<input className="mt-1 w-full rounded-lg border border-[#e3e3ed] bg-white px-2.5 py-2 text-xs font-normal" defaultValue={task.trackingUrl ?? ""} name="trackingUrl" type="url" maxLength={1000} /></label><button className="self-end rounded-lg border border-[#e3e3ed] px-3 py-2 font-bold text-[#5556d8] hover:bg-white" disabled={savingId === task.id} type="submit">Salvar link</button></form>}
                  {task.category === "Equipamento" && task.trackingUrl && <a className="font-bold text-[#5556d8] underline" href={task.trackingUrl} rel="noreferrer" target="_blank">Abrir link de rastreio</a>}
                  {task.issues.length > 0 && <div className="space-y-2"><strong className="text-[#55576d]">Problemas sinalizados ({task.openIssueCount})</strong>{task.issues.map((issue) => <div className="rounded-lg bg-[#fafafe] p-3" key={issue.id}><p className="text-[#45475d]">{issue.description}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span>{issue.status === "resolved" ? `Resolvido: ${issue.resolutionNote ?? ""}` : issue.status === "in_review" ? "Em acompanhamento" : "Aberto"}</span>{issue.status !== "resolved" && <><button className="font-bold text-[#5556d8]" onClick={() => void updateIssue(issue, "in_review")} type="button">Acompanhar</button><button className="font-bold text-emerald-700" onClick={() => void updateIssue(issue, "resolved")} type="button">Marcar resolvido</button></>}</div></div>)}</div>}
                </div>
              </details>
              <details className="basis-full rounded-lg border-t border-[#f0f0f5] pt-2 text-xs text-[#777a91]"><summary className="w-fit cursor-pointer font-bold text-[#5556d8]">Ver histórico de atualizações ({task.history.length})</summary>{task.history.length ? <div className="mt-2 space-y-2">{task.history.map((entry) => <div className="rounded-lg bg-[#fafafe] px-3 py-2" key={entry.id}><p>{formatDate(entry.createdAt)} · {entry.actorName} · {historyActionLabel(entry.action)}{historyValue(entry) ? `: ${historyValue(entry)}` : ""}</p>{entry.comment && <p className="mt-1 whitespace-pre-wrap text-[#55576d]">{entry.comment}</p>}</div>)}</div> : <p className="mt-2">Nenhuma atualização registrada ainda.</p>}</details>
            </div>
          </article>;
        })}
      </section>)}</div>
      </article>
    </> : peopleGroups.length ? <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="Modo da fila" className="inline-flex rounded-xl bg-[#eeedf5] p-1" role="group">
            <button aria-pressed={queueView === "people"} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${queueView === "people" ? "bg-white text-[#5556d8] shadow-sm" : "text-[#777a91] hover:text-[#303249]"}`} onClick={() => setQueueView("people")} type="button">Por pessoa</button>
            <button aria-pressed={queueView === "tasks"} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${queueView === "tasks" ? "bg-white text-[#5556d8] shadow-sm" : "text-[#777a91] hover:text-[#303249]"}`} onClick={() => setQueueView("tasks")} type="button">Tarefas compartilhadas</button>
          </div>
          <label className="sr-only" htmlFor="preparation-name-search">Buscar por nome</label>
          <input autoComplete="off" className="w-full rounded-xl border border-[#e3e3ed] bg-white px-3 py-2.5 text-xs text-[#303249] outline-none transition placeholder:text-[#999bad] focus:border-[#a9a8e7] focus:ring-2 focus:ring-[#eeeeff] sm:w-56" id="preparation-name-search" onChange={(event) => setNameQuery(event.target.value)} placeholder="Buscar por nome" type="search" value={nameQuery} />
        </div>
        <span className="text-xs font-semibold text-[#85879a]">{queueView === "people" ? `${filteredPeopleGroups.length} pessoas` : `${sharedTaskGroups.filter((group) => !normalizedNameQuery || group.people.some((person) => person.employeeName.toLocaleLowerCase("pt-BR").includes(normalizedNameQuery))).length} tarefas compartilhadas`}</span>
      </div>
      {queueView === "people" ? <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{visiblePeopleGroups.map((person) => {
          const urgentTask = person.nextTask;
          const urgentDate = urgentTask?.dueDate.slice(0, 10) ?? "";
          const urgentLabel = urgentTask ? urgentDate < today ? `Mais urgente: atrasada · ${formatDate(urgentDate)}` : urgentDate === today ? "Mais urgente: vence hoje" : `Próximo prazo: ${formatDate(urgentDate)}` : "Todas as tarefas concluídas";
          return <button className="content-panel flex min-h-[92px] w-full flex-wrap items-center gap-2.5 !p-3 text-left transition hover:border-[#c9c8ed] hover:bg-[#fcfbff] sm:!p-3.5" key={person.employeeId} onClick={() => setSelectedEmployeeId(person.employeeId)} type="button">
            <EmployeeAvatar employeeId={person.employeeId} name={person.employeeName} className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e9e8ff] text-xs font-extrabold text-[#5859d6]" />
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[#303249]">{person.employeeName}</strong><small className="block truncate text-[11px] text-[#85879a]">{person.department ?? "Área não definida"} · Entrada {formatDate(person.startDate)}</small><small className={`block text-[11px] font-semibold ${urgentTask && urgentDate < today ? "text-red-700" : "text-[#777a91]"}`}>{urgentLabel}</small></span>
            <span className="rounded-full bg-[#f5f5f9] px-2.5 py-1 text-[11px] font-bold text-[#55576d]">{person.tasks.length} tarefas</span><span className="shrink-0 text-base text-[#8b8da0]">›</span>
          </button>;
        })}</div>
        {filteredPeopleGroups.length > 8 && <button className="w-full rounded-xl border border-[#e3e3ed] bg-white px-4 py-3 text-sm font-bold text-[#5556d8] transition hover:border-[#c9c8ed] hover:bg-[#fcfbff]" onClick={() => setShowAllPeople((current) => !current)} type="button">{showAllPeople ? "Mostrar menos" : `Mostrar todas as pessoas (${filteredPeopleGroups.length})`}</button>}
        {filteredPeopleGroups.length === 0 && <p className="content-panel text-sm text-[#85879a]">Nenhuma pessoa encontrada com esse nome.</p>}
      </> : <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e9e8f0] bg-white p-3">
          <p className="text-xs text-[#777a91]">Tarefas abertas que aparecem nas jornadas de pelo menos duas pessoas.</p>
          <div aria-label="Ordenar tarefas compartilhadas" className="inline-flex rounded-lg bg-[#f4f4f8] p-1" role="group">
            <button aria-pressed={taskSort === "people"} className={`rounded-md px-3 py-1.5 text-xs font-bold ${taskSort === "people" ? "bg-white text-[#5556d8] shadow-sm" : "text-[#777a91]"}`} onClick={() => setTaskSort("people")} type="button">Mais pessoas</button>
            <button aria-pressed={taskSort === "urgency"} className={`rounded-md px-3 py-1.5 text-xs font-bold ${taskSort === "urgency" ? "bg-white text-[#5556d8] shadow-sm" : "text-[#777a91]"}`} onClick={() => setTaskSort("urgency")} type="button">Mais urgente</button>
          </div>
        </div>
        {visibleSharedTaskGroups.length ? visibleSharedTaskGroups.map((group) => {
          const dueDate = group.nextTask.dueDate.slice(0, 10);
          const visibleGroupPeople = group.people.filter((person) => !normalizedNameQuery || person.employeeName.toLocaleLowerCase("pt-BR").includes(normalizedNameQuery));
          return <article className="content-panel space-y-3 !p-4" key={`${group.category}-${group.title}`}>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-[#85879a]">{group.category || "Geral"}</p><h3 className="mt-1 font-extrabold text-[#303249]">{group.title}</h3></div>
              <div className="flex shrink-0 gap-2"><span className="rounded-full bg-[#f0efff] px-3 py-1 text-xs font-bold text-[#5556d8]">{normalizedNameQuery ? `${visibleGroupPeople.length} de ${group.people.length} pessoas` : `${group.people.length} pessoas`}</span>{group.overdueCount > 0 && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">{group.overdueCount} atrasadas</span>}</div>
            </header>
            <p className={`text-xs font-semibold ${group.overdueCount ? "text-red-700" : "text-[#777a91]"}`}>{group.overdueCount ? `${group.overdueCount} pessoa(s) estão com esta tarefa atrasada` : dueDate === today ? "Próximo prazo: hoje" : `Próximo prazo: ${formatDate(dueDate)}`}</p>
            <div className="flex flex-wrap gap-2">{visibleGroupPeople.map((personTask) => <button className="inline-flex items-center gap-2 rounded-full border border-[#e7e6ef] bg-white py-1 pl-1 pr-3 text-xs font-semibold text-[#55576d] transition hover:border-[#c9c8ed] hover:text-[#5556d8]" key={personTask.employeeId} onClick={() => setSelectedEmployeeId(personTask.employeeId)} type="button"><EmployeeAvatar employeeId={personTask.employeeId} name={personTask.employeeName} className="grid size-7 place-items-center rounded-full bg-[#e9e8ff] text-[9px] font-extrabold text-[#5859d6]" />{personTask.employeeName}</button>)}</div>
          </article>;
        }) : <p className="content-panel text-sm text-[#85879a]">{normalizedNameQuery ? "Nenhuma tarefa compartilhada encontrada para esse nome." : "Ainda não há tarefas abertas compartilhadas por mais de uma pessoa."}</p>}
      </section>}
      </> : <p className="content-panel text-sm text-[#85879a]">Ainda não há tarefas de preparação que você possa acompanhar.</p>}</div>
  </section>;
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function historyActionLabel(action: string) {
  if (action === "status") return "alterou o estado";
  if (action === "owner") return "assumiu a tarefa";
  if (action === "shipment") return "atualizou o link de rastreio";
  if (action === "employee_confirmation") return "confirmou como pronto";
  if (action === "issue_reported") return "registrou um problema";
  if (action === "issue_status") return "atualizou um problema";
  return action;
}

function historyValue(entry: PreparationHistoryEntry) {
  if (!entry.newValue || entry.action === "shipment" || entry.action === "owner") return "";
  if (entry.action === "status") {
    const previous = statusLabels[entry.previousValue as PreparationTask["status"]] ?? entry.previousValue ?? "A iniciar";
    const next = statusLabels[entry.newValue as PreparationTask["status"]] ?? entry.newValue;
    return `de ${previous} para ${next}`;
  }
  if (entry.action === "issue_status") return entry.newValue === "in_review" ? "Em acompanhamento" : entry.newValue === "resolved" ? "Resolvido" : entry.newValue;
  return entry.newValue;
}

export default PreparationView;
