import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/shared";
import EmployeeAvatar from "../components/EmployeeAvatar";
import type { AuthenticatedEmployee } from "../components/Login";
import ProfileView from "./ProfileView";

type OverdueTask = {
  employeeId: number;
  employeeName: string;
  stageTemplateId: number;
  stageCode: string;
  stageName: string;
  taskId: number;
  taskTitle: string;
  dueDate: string;
  overdueDays: number;
  totalCount: number;
};

type TaskGroup = {
  key: string;
  title: string;
  stageCode: string;
  stageName: string;
  employees: OverdueTask[];
};

export default function OverdueTasksView() {
  const [tasks, setTasks] = useState<OverdueTask[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedEmployee, setSelectedEmployee] = useState<AuthenticatedEmployee | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function refresh(showLoading = false) {
      if (showLoading) setStatus("loading");
      try {
        const response = await fetch("/api/hr/overdue-tasks", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as tarefas atrasadas.");
        if (active) {
          setTasks(result as OverdueTask[]);
          setStatus("ready");
        }
      } catch (loadError) {
        if (!active || (loadError instanceof DOMException && loadError.name === "AbortError")) return;
        setStatus("error");
      }
    }
    void refresh(true);
    const interval = window.setInterval(() => void refresh(), 60_000);
    const refreshOnFocus = () => void refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  const groups = useMemo(() => {
    const grouped = new Map<string, TaskGroup>();
    for (const task of tasks) {
      const key = `${task.stageTemplateId}:${task.taskTitle.toLocaleLowerCase("pt-BR")}`;
      const group = grouped.get(key);
      if (group) group.employees.push(task);
      else grouped.set(key, { key, title: task.taskTitle, stageCode: task.stageCode, stageName: task.stageName, employees: [task] });
    }
    return Array.from(grouped.values());
  }, [tasks]);

  async function openProfile(employeeId: number) {
    setProfileLoading(true);
    setProfileError("");
    try {
      const response = await fetch(`/api/employees/${employeeId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível abrir o perfil.");
      setSelectedEmployee(result as AuthenticatedEmployee);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Não foi possível abrir o perfil.");
    } finally {
      setProfileLoading(false);
    }
  }

  if (selectedEmployee) return <section className="people-directory">
    <button className="people-back-button" onClick={() => setSelectedEmployee(null)} type="button"><Icon name="chevron" size={15} /> Voltar para tarefas atrasadas</button>
    <div className="mt-5"><ProfileView employee={selectedEmployee} photo={`/api/employees/${selectedEmployee.id}/profile-photo`} onPhotoChange={() => undefined} readOnly /></div>
  </section>;

  const totalCount = tasks[0]?.totalCount ?? tasks.length;
  const preEntryCount = tasks.filter((task) => task.stageCode === "pre-entry").length;

  return <section>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">Acompanhamento de prazos</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Tarefas atrasadas</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#777a91]">Veja as pendências por tarefa e abra o perfil de cada pessoa para falar com ela.</p></div>
      {status === "ready" && totalCount > 0 && <div className="flex gap-2"><span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-700">{totalCount} {totalCount === 1 ? "atrasada" : "atrasadas"}</span><span className="rounded-full bg-[#fff1dc] px-3 py-1.5 text-xs font-extrabold text-[#a9681c]">{preEntryCount} na Pré-entrada</span></div>}
    </header>

    {profileLoading && <p className="mt-5 text-sm text-[#777a91]" role="status">Carregando perfil...</p>}
    {profileError && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{profileError}</p>}
    {status === "loading" ? <div className="mt-6 rounded-2xl border border-[#e8e8f0] bg-white p-6 text-sm text-[#85879a]">Verificando prazos das jornadas...</div>
      : status === "error" ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Não foi possível carregar as tarefas atrasadas. Atualize a página para tentar novamente.</div>
        : groups.length ? <div className="mt-6 space-y-4">{groups.map((group) => <article className="content-panel" key={group.key}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eeeeF4] pb-4">
            <div><p className="eyebrow">{group.stageName}</p><h2 className="mt-1 text-lg font-extrabold text-[#303249]">{group.title}</h2></div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-[#f5f5f9] px-3 py-1 text-xs font-bold text-[#777a91]">{group.employees.length} {group.employees.length === 1 ? "pessoa" : "pessoas"}</span>{group.stageCode === "pre-entry" && <span className="rounded-full bg-[#fff1dc] px-3 py-1 text-xs font-extrabold text-[#a9681c]">Pré-entrada</span>}</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {group.employees.map((task) => <button aria-label={`Abrir perfil de ${task.employeeName}, tarefa atrasada há ${task.overdueDays} dias`} className="flex min-w-[190px] items-center gap-3 rounded-xl border border-[#ededf3] bg-white px-3 py-2.5 text-left transition hover:border-[#c9c8ed] hover:bg-[#fafafe]" key={`${task.taskId}:${task.employeeId}`} onClick={() => void openProfile(task.employeeId)} title={task.employeeName} type="button">
              <EmployeeAvatar employeeId={task.employeeId} name={task.employeeName} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f1f0ff] text-xs font-extrabold text-[#5b5ce2]" />
              <span className="min-w-0"><strong className="block truncate text-sm text-[#303249]">{firstName(task.employeeName)}</strong><small className="mt-0.5 block text-xs font-semibold text-red-700">{formatOverdueDuration(task.overdueDays)}</small></span>
              <Icon name="chevron" size={15} />
            </button>)}
          </div>
        </article>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-[#d9d9e6] bg-white p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e7f7ef] text-[#288b65]"><Icon name="check" size={22} /></span><h2 className="mt-4 text-lg font-extrabold text-[#303249]">Tudo em dia</h2><p className="mt-1 text-sm text-[#777a91]">Nenhuma tarefa atrasada nas jornadas ativas.</p></div>}
    {profileLoading && <div className="fixed inset-0 z-40 grid place-items-center bg-white/55"><p className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#55576d] shadow-lg">Carregando perfil...</p></div>}
    {totalCount > tasks.length && <p className="mt-4 text-xs text-[#85879a]">Mostrando as 100 tarefas mais antigas; as da Pré-entrada aparecem primeiro.</p>}
  </section>;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function formatOverdueDuration(days: number) {
  return `Atrasada há ${days} ${days === 1 ? "dia" : "dias"}`;
}
