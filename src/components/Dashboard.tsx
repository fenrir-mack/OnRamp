import "../styles/dashboard.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Brand, Icon, type IconName, type LibraryResource } from "./shared";
import HomeView from "../views/HomeView";
import ContentView from "../views/ContentView";
import JourneyView from "../views/EmployeeJourneyView";
import PeopleView from "../views/PeopleView";
import HrPlansView from "../views/HrPlansView";
import ProfileView from "../views/ProfileView";
import MessagesView from "../views/MessagesView";
import OverdueTasksView from "../views/OverdueTasksView";
import SupportRequestView from "../views/SupportRequestView";
import OnboardingSupportView from "../views/OnboardingSupportView";
import type { AuthenticatedEmployee } from "./Login";

function Dashboard({ employee, onLogout }: { employee: AuthenticatedEmployee; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState(employee.isHrAdmin ? "Pessoas da empresa" : "Início");
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem(`onramp-profile-photo-${employee.id}`) ?? "");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [requestedSupportRequestId, setRequestedSupportRequestId] = useState<number | null>(null);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [overdueTaskCount, setOverdueTaskCount] = useState(0);
  const [preEntryOverdueCount, setPreEntryOverdueCount] = useState(0);
  const [hrOverdueTaskCount, setHrOverdueTaskCount] = useState(0);
  const updateOverdueCount = useCallback((count: number, preEntryCount: number) => {
    setOverdueTaskCount(count);
    setPreEntryOverdueCount(preEntryCount);
  }, []);
  const openSupportRequestChat = useCallback((requestId: number) => {
    setRequestedSupportRequestId(requestId);
    setActiveNav("Mensagens de suporte");
    setMobileMenu(false);
  }, []);
  const [journeyResetVersion, setJourneyResetVersion] = useState(0);
  const [peopleResetVersion, setPeopleResetVersion] = useState(0);
  const [databaseResources, setDatabaseResources] = useState<LibraryResource[]>([]);
  const [resourceStatus, setResourceStatus] = useState<"loading" | "ready" | "error">("loading");
  const [databaseStages, setDatabaseStages] = useState<{ code: string; name: string; description: string; durationLabel: string | null }[]>([]);
  const [employeePlanTasks, setEmployeePlanTasks] = useState<{ id: number; stageCode: string; title: string; description: string; required: boolean; completed: boolean; dueOffsetDays: number; dueDate: string; overdue: boolean }[]>([]);
  const [planStatus, setPlanStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    async function refreshUnreadCount() {
      try {
        const response = await fetch("/api/support/unread-count");
        if (!response.ok) return;
        const result = await response.json() as { unreadCount: number };
        if (active) setUnreadSupportCount(result.unreadCount);
      } catch { /* Keep the latest known unread count while offline. */ }
    }
    void refreshUnreadCount();
    const interval = window.setInterval(() => void refreshUnreadCount(), 30_000);
    window.addEventListener("focus", refreshUnreadCount);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshUnreadCount);
    };
  }, [employee.id]);

  useEffect(() => {
    if (employee.isHrAdmin) return;
    let active = true;
    async function refreshOverdueCount() {
      try {
        const response = await fetch("/api/me/plan/overdue-count");
        if (!response.ok) return;
        const result = await response.json() as { count: number; preEntryCount: number };
        if (active) {
          setOverdueTaskCount(result.count);
          setPreEntryOverdueCount(result.preEntryCount);
        }
      } catch { /* Keep the latest known overdue count while offline. */ }
    }
    void refreshOverdueCount();
    const interval = window.setInterval(() => void refreshOverdueCount(), 60_000);
    window.addEventListener("focus", refreshOverdueCount);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOverdueCount);
    };
  }, [employee.id, employee.isHrAdmin]);

  useEffect(() => {
    if (!employee.isHrAdmin) return;
    let active = true;
    async function refreshHrOverdueCount() {
      try {
        const response = await fetch("/api/hr/overdue-count");
        if (!response.ok) return;
        const result = await response.json() as { count: number };
        if (active) setHrOverdueTaskCount(result.count);
      } catch { /* Keep the last known HR overdue count if the server is offline. */ }
    }
    void refreshHrOverdueCount();
    const interval = window.setInterval(() => void refreshHrOverdueCount(), 60_000);
    window.addEventListener("focus", refreshHrOverdueCount);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshHrOverdueCount);
    };
  }, [employee.id, employee.isHrAdmin]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    fetch("/api/me/profile-photo")
      .then(async (response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Could not load the profile photo.");
        return response.blob();
      })
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setProfilePhoto(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [employee.id]);

  useEffect(() => {
    if (employee.isHrAdmin) {
      setResourceStatus("ready");
      return;
    }
    setResourceStatus("loading");
    fetch("/api/resources")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load local resources.");
        return response.json();
      })
      .then((rows: {
        title: string;
        description: string | null;
        format: string;
        category: string;
        owner_department: string | null;
        external_url: string | null;
        download_url: string | null;
      }[]) => {
        const categoryPresentation: Record<string, Pick<LibraryResource, "icon" | "tone">> = {
          Benefícios: { icon: "briefcase", tone: "indigo" },
          Cultura: { icon: "people", tone: "purple" },
          Ferramentas: { icon: "tools", tone: "orange" },
          Financeiro: { icon: "briefcase", tone: "orange" },
          Onboarding: { icon: "sparkle", tone: "indigo" },
          Políticas: { icon: "book", tone: "blue" },
        };
        setDatabaseResources(rows.map((row) => {
          const presentation = categoryPresentation[row.category] ?? { icon: "book", tone: "blue" };
          return {
            title: row.title,
            category: row.category,
            meta: row.format,
            description: row.description ?? "",
            owner: row.owner_department ?? "OnRamp",
            ...presentation,
            downloadUrl: row.external_url ?? row.download_url,
            isExternalLink: Boolean(row.external_url),
          };
        }));
        setResourceStatus("ready");
      })
      .catch(() => {
        setDatabaseResources([]);
        setResourceStatus("error");
      });
  }, [employee.isHrAdmin]);

  useEffect(() => {
    if (employee.isHrAdmin) return;
    const controller = new AbortController();
    setPlanStatus("loading");
    Promise.all([
      fetch("/api/stages", { signal: controller.signal }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load onboarding stages.");
        return result as { code: string; name: string; description: string | null; duration_label: string | null }[];
      }),
      fetch("/api/me/plan", { signal: controller.signal }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load employee plan.");
        return result as { tasks: { id: number; stageCode: string; title: string; description: string; required: boolean; completed: boolean; dueOffsetDays: number; dueDate: string; overdue: boolean }[] };
      }),
    ]).then(([stages, plan]) => {
      setDatabaseStages(stages.map((stage) => ({ code: stage.code, name: stage.name, description: stage.description ?? "", durationLabel: stage.duration_label })));
      setEmployeePlanTasks(plan.tasks);
      setPlanStatus("ready");
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setPlanStatus("error");
    });
    return () => controller.abort();
  }, [employee.id, employee.isHrAdmin, activeNav]);

  const filtered = useMemo(
    () => databaseResources.filter((item) => `${item.title} ${item.category} ${item.description} ${item.owner} ${item.meta}`.toLowerCase().includes(query.toLowerCase())),
    [databaseResources, query],
  );
  const navItems: { label: string; icon: IconName }[] = employee.isHrAdmin
    ? [{ label: "Pessoas da empresa", icon: "people" }, { label: "Jornadas", icon: "calendar" }, { label: "Acompanhamento", icon: "chat" }, { label: "Tarefas atrasadas", icon: "clock" }, { label: "Mensagens de suporte", icon: "chat" }]
    : [
        { label: "Início", icon: "home" },
        { label: "Minha jornada", icon: "calendar" },
        { label: "Conteúdos", icon: "book" },
        { label: "Pessoas & áreas", icon: "people" },
        { label: "Pedir suporte", icon: "help" },
        { label: "Mensagens de suporte", icon: "chat" },
      ];

  return (
    <main className="min-h-screen bg-[#f7f7fb] text-[#20223a]">
      <aside className={`sidebar ${mobileMenu ? "sidebar--open" : ""}`}>
        <div className="px-7 py-7"><Brand /></div>
        <nav className="mt-4 space-y-1 px-4">
          <p className="px-3 pb-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a0a2b4]">{employee.isHrAdmin ? "Administração" : "Menu principal"}</p>
          {navItems.map((item) => (
            <button
              className={`sidebar__nav-item ${activeNav === item.label ? "sidebar__nav-item--active" : ""}`}
              key={item.label}
              onClick={() => {
                setActiveNav(item.label);
                setMobileMenu(false);
                if (item.label === "Minha jornada") setJourneyResetVersion((version) => version + 1);
                if (item.label === "Pessoas & áreas") setPeopleResetVersion((version) => version + 1);
              }}
            >
              <span className="relative grid place-items-center">
                <Icon name={item.icon} size={20} />
                {item.label === "Mensagens de suporte" && unreadSupportCount > 0 && <span className="sidebar__unread-badge" role="status" aria-label={`${unreadSupportCount} mensagens não lidas`}>{unreadSupportCount > 99 ? "99+" : unreadSupportCount}</span>}
                {item.label === "Minha jornada" && overdueTaskCount > 0 && <span className="sidebar__overdue-badge" role="status" title={`${preEntryOverdueCount} atrasadas na pré-entrada`} aria-label={`${overdueTaskCount} itens atrasados, ${preEntryOverdueCount} na pré-entrada`}>{overdueTaskCount > 99 ? "99+" : overdueTaskCount}</span>}
                {item.label === "Tarefas atrasadas" && hrOverdueTaskCount > 0 && <span className="sidebar__overdue-badge" role="status" aria-label={`${hrOverdueTaskCount} tarefas atrasadas para revisar`}>{hrOverdueTaskCount > 99 ? "99+" : hrOverdueTaskCount}</span>}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-4 pb-5">
          {!employee.isHrAdmin && <button onClick={() => setActiveNav("Meu perfil")} className="sidebar__nav-item"><Icon name="settings" size={20} /> Configurações</button>}
          <button onClick={onLogout} className="sidebar__nav-item"><Icon name="logout" size={20} /> Sair da conta</button>
        </div>
      </aside>

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#ececf3] bg-white/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <button className="text-[#4c4e66] lg:hidden" onClick={() => setMobileMenu(!mobileMenu)}><Icon name="menu" size={24} /></button>
          {!employee.isHrAdmin && <div className="relative hidden max-w-md flex-1 md:block">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9b9daf]"><Icon name="search" size={19} /></span>
            <input className="search-field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar benefícios, políticas, ferramentas..." />
          </div>}
          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            {!employee.isHrAdmin && <button className="relative grid size-10 place-items-center rounded-xl bg-[#f5f5fa] text-[#61647b]"><Icon name="help" size={20} /></button>}
            <div className="h-8 w-px bg-[#e8e8ef]" />
            <button onClick={() => { setActiveNav("Meu perfil"); setMobileMenu(false); }} className="flex items-center gap-3 text-left" title="Meu perfil" aria-label="Abrir meu perfil">
              {profilePhoto ? <img className="size-10 rounded-xl object-cover" src={profilePhoto} alt="" /> : <div className="grid size-10 place-items-center rounded-xl bg-[#e6e6ff] text-sm font-extrabold text-[#5556d8]">{employee.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>}
              <span className="hidden sm:block"><strong className="block text-sm">{employee.name}</strong><small className="text-xs text-[#85889f]">{employee.department ?? employee.jobTitle ?? employee.email}</small></span>
              <Icon name="chevron" size={14} />
            </button>
          </div>
        </header>

        <div className={`mx-auto w-full ${activeNav === "Mensagens de suporte" ? "max-w-none p-3 sm:p-4 lg:p-5" : "max-w-[1320px] p-5 sm:p-8 lg:p-10"}`}>
          {activeNav === "Meu perfil" ? (
            <ProfileView employee={employee} photo={profilePhoto} onPhotoChange={setProfilePhoto} />
          ) : activeNav === "Mensagens de suporte" ? (
            <MessagesView employee={employee} onUnreadCountChange={setUnreadSupportCount} requestedSupportRequestId={requestedSupportRequestId} onSupportRequestOpened={() => setRequestedSupportRequestId(null)} />
          ) : employee.isHrAdmin && activeNav === "Tarefas atrasadas" ? (
            <OverdueTasksView />
          ) : employee.isHrAdmin && activeNav === "Acompanhamento" ? (
            <OnboardingSupportView onOpenChat={openSupportRequestChat} />
          ) : !employee.isHrAdmin && activeNav === "Pedir suporte" ? (
            <SupportRequestView onOpenChat={openSupportRequestChat} />
          ) : employee.isHrAdmin ? (
            <HrPlansView section={activeNav === "Jornadas" ? "plans" : "people"} />
          ) : activeNav === "Pessoas & áreas" ? (
            <PeopleView resetVersion={peopleResetVersion} />
          ) : activeNav === "Conteúdos" ? (
            <ContentView query={query} setQuery={setQuery} resources={databaseResources} filtered={filtered} status={resourceStatus} />
          ) : activeNav === "Minha jornada" ? (
            <JourneyView resetVersion={journeyResetVersion} employeeId={employee.id} onOverdueCountChange={updateOverdueCount} />
          ) : (
            <HomeView employee={employee} stages={databaseStages} tasks={employeePlanTasks} planStatus={planStatus} query={query} setQuery={setQuery} resources={databaseResources} filtered={filtered} setActiveNav={setActiveNav} />
          )}
        </div>
      </div>
      {mobileMenu && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-[#18192d]/30 lg:hidden" onClick={() => setMobileMenu(false)} />}
    </main>
  );
}

export default Dashboard;
