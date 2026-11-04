import "../styles/library.css";
import { useEffect, useState } from "react";
import { Icon, type LibraryResource } from "../components/shared";
import type { AuthenticatedEmployee } from "../components/Login";
import EmployeeAvatar from "../components/EmployeeAvatar";
import ProfileView from "./ProfileView";

type MentorProfile = { id: number; name: string; email: string; jobTitle: string | null; department: string | null };

type JourneyStage = { code: string; name: string; description: string; durationLabel: string | null };
type PlanTask = { id: number; stageCode: string; title: string; description: string; required: boolean; completed: boolean; dueOffsetDays: number; dueDate: string; overdue: boolean };

type HomeViewProps = {
  employee: AuthenticatedEmployee;
  stages: JourneyStage[];
  tasks: PlanTask[];
  planStatus: "loading" | "ready" | "error";
  query: string;
  setQuery: (query: string) => void;
  resources: LibraryResource[];
  filtered: LibraryResource[];
  setActiveNav: (navigationItem: string) => void;
};

export default function HomeView({ employee, stages, tasks, planStatus, query, setQuery, resources, filtered, setActiveNav }: HomeViewProps) {
  const [mentor, setMentor] = useState<MentorProfile | null>(null);
  const [mentorLoaded, setMentorLoaded] = useState(false);
  const [showMentorProfile, setShowMentorProfile] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/mentor", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar a pessoa mentora.");
        return result as MentorProfile | null;
      })
      .then((result) => { setMentor(result); setMentorLoaded(true); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setMentorLoaded(true); });
    return () => controller.abort();
  }, [employee.id]);
  const folders = Array.from(new Map(resources.map((resource) => [resource.category, resources.filter((item) => item.category === resource.category).length])).entries());
  const featuredResource = resources[0];
  const requiredTasks = tasks.filter((task) => task.required);
  const completedCount = requiredTasks.filter((task) => task.completed).length;
  const progress = requiredTasks.length ? Math.round((completedCount / requiredTasks.length) * 100) : 0;
  const nextTasks = tasks.filter((task) => !task.completed).sort((left, right) => Number(right.overdue) - Number(left.overdue)).slice(0, 4);
  const firstIncompleteIndex = stages.findIndex((stage) => {
    const stageTasks = tasks.filter((task) => task.stageCode === stage.code && task.required);
    return stageTasks.length === 0 || stageTasks.some((task) => !task.completed);
  });
  const firstName = employee.name.split(/\s+/)[0];

  return <>
    <section className="welcome-card">
      <div className="relative z-10 max-w-xl">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white"><Icon name="sparkle" size={14} /> Sua jornada</div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">Olá, {firstName}!</h1>
        <p className="mt-3 text-sm leading-6 text-indigo-100 sm:text-base">{planStatus === "loading" ? "Carregando suas atividades..." : planStatus === "error" ? "Não foi possível carregar seu progresso." : requiredTasks.length ? `Você concluiu ${completedCount} de ${requiredTasks.length} atividades atribuídas a você.` : "O RH ainda não configurou as atividades da sua jornada."}</p>
        <div className="mt-6 flex items-center gap-4"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#ffc66b] transition-all" style={{ width: `${progress}%` }} /></div><strong className="text-sm text-white">{progress}%</strong></div>
      </div><div className="welcome-card__art"><div className="welcome-card__illustration"><Icon name="check" size={42} /></div></div>
    </section>

    <section aria-labelledby="mentor-card-title" className="content-panel mt-5 flex flex-wrap items-center gap-4 sm:gap-5">
      {mentor ? <EmployeeAvatar employeeId={mentor.id} name={mentor.name} className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#f1f0ff] text-base font-extrabold text-[#5b5ce2]" /> : <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#f1f0ff] text-[#5b5ce2]"><Icon name="people" size={24} /></span>}
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Apoio na sua integração</p>
        <h2 className="mt-1 text-base font-extrabold text-[#303249]" id="mentor-card-title">Sua pessoa mentora</h2>
        {mentor ? <p className="mt-1 text-sm text-[#777a91]">{mentor.name}{mentor.jobTitle ? ` · ${mentor.jobTitle}` : ""}{mentor.department ? ` · ${mentor.department}` : ""}</p> : <p className="mt-1 text-sm text-[#777a91]">{mentorLoaded ? "O RH ainda não atribuiu uma pessoa mentora à sua integração." : "Carregando..."}</p>}
      </div>
      {mentor && <div className="flex flex-wrap gap-2">
        <button className="rounded-xl border border-[#e4e4ef] px-4 py-2.5 text-xs font-bold text-[#5556d8] hover:bg-[#f8f7ff]" onClick={() => setShowMentorProfile(true)} type="button">Ver perfil</button>
        <a className="inline-flex items-center gap-2 rounded-xl bg-[#5b5ce2] px-4 py-2.5 text-xs font-bold text-white no-underline hover:bg-[#4d4ec9]" href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(mentor.email)}`} rel="noreferrer" target="_blank"><Icon name="chat" size={15} /> Conversar no Teams</a>
      </div>}
    </section>

    {showMentorProfile && mentor && <div className="fixed inset-0 z-50 grid place-items-center bg-[#18192d]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMentorProfile(false); }} role="presentation">
      <section aria-label={`Perfil de ${mentor.name}`} aria-modal="true" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-[#f7f7fb] p-4 shadow-2xl sm:p-6" role="dialog">
        <div className="mb-3 flex justify-end"><button aria-label="Fechar perfil" className="grid size-9 place-items-center rounded-xl bg-white text-lg font-bold text-[#777a91]" onClick={() => setShowMentorProfile(false)} type="button">×</button></div>
        <ProfileView employee={{ ...mentor, isHrAdmin: false }} photo={`/api/employees/${mentor.id}/profile-photo`} onPhotoChange={() => undefined} readOnly />
      </section>
    </div>}

    <div className="mt-7 md:hidden"><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9b9daf]"><Icon name="search" size={19} /></span><input className="search-field bg-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar informações..." /></div></div>

    <section className="mt-9"><div className="section-heading"><div><p className="eyebrow">Sua evolução</p><h2>Etapas da jornada</h2></div><button onClick={() => setActiveNav("Minha jornada")} className="section-heading__link">Ver jornada completa <Icon name="arrow" size={17} /></button></div>
      <div className="journey-timeline mt-5"><div className="journey-timeline__track">{stages.map((stage, index) => {
        const stageTasks = tasks.filter((task) => task.stageCode === stage.code && task.required);
        const done = stageTasks.length > 0 && stageTasks.every((task) => task.completed);
        const status = done ? "done" : index === firstIncompleteIndex ? "current" : "next";
        return <div className="contents" key={stage.code}><div className={`journey-timeline__step journey-stage--${status}`}><div className="journey-stage__number">{done ? <Icon name="check" size={16} /> : index + 1}</div><div className="min-w-0"><h3>{stage.name}</h3><p>{done ? "Concluído" : stage.durationLabel || stage.description}</p></div></div>{index < stages.length - 1 && <div className="journey-timeline__arrow"><Icon name="arrow" size={18} /></div>}</div>;
      })}{stages.length === 0 && <p className="text-sm text-[#85879a]">As etapas cadastradas aparecerão aqui.</p>}</div></div>
    </section>

    <section className="mt-10"><div className="section-heading"><div><p className="eyebrow">Biblioteca</p><h2>Arquivos e documentos</h2></div><button onClick={() => setActiveNav("Conteúdos")} className="section-heading__link">Abrir biblioteca <Icon name="arrow" size={17} /></button></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.35fr]">
        {featuredResource ? <div className="featured-resource text-left"><div className="flex items-start justify-between"><span className="featured-resource__label"><Icon name="sparkle" size={14} /> Em destaque</span><span className="text-xs font-bold text-[#7779db]">{featuredResource.meta}</span></div><div className="mt-auto"><div className={`resource-icon resource-icon--${featuredResource.tone}`}><Icon name={featuredResource.icon} size={22} /></div><h3 className="mt-4 text-lg font-extrabold">{featuredResource.title}</h3><p className="mt-2 text-sm leading-6 text-[#74778f]">{featuredResource.description || "Material disponibilizado pelo RH."}</p>{featuredResource.downloadUrl && <a href={featuredResource.downloadUrl} target="_blank" rel="noreferrer" className="mt-5 flex w-fit items-center gap-2 text-xs font-extrabold text-[#5556d8] no-underline">Abrir material<Icon name="arrow" size={16} /></a>}</div></div> : <div className="featured-resource text-left"><p className="eyebrow">Biblioteca</p><h3 className="mt-4 text-lg font-extrabold">Nenhum material cadastrado</h3><p className="mt-2 text-sm leading-6 text-[#74778f]">Os materiais adicionados pelo RH aparecerão aqui.</p></div>}
        <div className="content-panel"><div className="flex items-center justify-between"><div><h3 className="text-sm font-extrabold">Assuntos</h3><p className="mt-1 text-xs text-[#8a8da2]">Materiais organizados pelo RH</p></div><button onClick={() => setActiveNav("Conteúdos")} className="text-xs font-extrabold text-[#5556d8]">Ver tudo</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{folders.map(([name, count], index) => <button className="folder-list__item" key={name} onClick={() => setActiveNav("Conteúdos")}><span className={`folder-list__icon folder-list__icon--${["indigo", "blue", "purple", "orange"][index % 4]}`}><Icon name="book" size={18} /></span><span className="min-w-0 flex-1 text-left"><strong>{name}</strong><small>{count} {count === 1 ? "material" : "materiais"}</small></span><Icon name="chevron" size={15} /></button>)}{folders.length === 0 && <p className="text-xs text-[#8a8da2]">Os assuntos serão exibidos quando o RH cadastrar materiais.</p>}</div></div>
      </div>{query && filtered.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-[#d9d9e6] bg-white p-8 text-center text-sm text-[#777a91]">Nenhum arquivo encontrado para “{query}”.</div>}
    </section>

    <section className="mt-10"><div className="content-panel"><div className="section-heading"><div><p className="eyebrow">Sua jornada</p><h2>Próximas atividades</h2></div><span className="rounded-full bg-[#f1f0ff] px-3 py-1 text-xs font-bold text-[#595ad8]">{tasks.filter((task) => !task.completed).length} pendentes</span></div>
      {planStatus === "loading" ? <p className="mt-5 text-sm text-[#85879a]">Carregando atividades...</p> : nextTasks.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{nextTasks.map((task) => <button className="activity-list__item text-left" key={task.id} onClick={() => setActiveNav("Minha jornada")}><div className={`grid size-11 shrink-0 place-items-center rounded-xl ${task.overdue ? "bg-red-50 text-red-700" : "bg-[#f3f3f9] text-[#62657e]"}`}><Icon name={task.overdue ? "clock" : "check"} size={20} /></div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-extrabold">{task.title}</h3><p className={`mt-1 flex items-center gap-1.5 text-xs ${task.overdue ? "font-bold text-red-700" : "text-[#898ba0]"}`}><Icon name="clock" size={13} />{task.overdue ? `Atrasada desde ${formatHomeDate(task.dueDate)}` : task.dueOffsetDays ? `Prazo: ${task.dueOffsetDays} dias após início` : "Prazo: no início da jornada"}</p></div><Icon name="chevron" size={16} /></button>)}</div> : <p className="mt-5 text-sm text-[#85879a]">{planStatus === "error" ? "Não foi possível carregar as atividades." : "Nenhuma atividade pendente atribuída a você."}</p>}
    </div></section>
  </>;
}

function formatHomeDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? "no prazo" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date); }
