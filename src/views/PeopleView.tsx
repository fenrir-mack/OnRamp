import "../styles/people.css";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "../components/shared";

type DirectoryPerson = { id: number; name: string; jobTitle: string | null; isLeader?: boolean };
type Department = { id: number; name: string; description: string | null; members: DirectoryPerson[] };
type Team = { id: number; name: string; description: string | null; parentTeamId: number | null; parentTeamName: string | null; members: DirectoryPerson[]; leaders: DirectoryPerson[] };
type Directory = { departments: Department[]; teams: Team[] };
type View = "areas" | "times" | "organograma";

function buildTeamTree(teams: Team[]) {
  const children = new Map<number | null, Team[]>();
  teams.forEach((team) => children.set(team.parentTeamId, [...(children.get(team.parentTeamId) ?? []), team]));
  children.forEach((rows) => rows.sort((left, right) => left.name.localeCompare(right.name)));
  const rows: { team: Team; depth: number }[] = [];
  const visited = new Set<number>();
  function visit(parentId: number | null, depth: number) {
    (children.get(parentId) ?? []).forEach((team) => {
      if (visited.has(team.id)) return;
      visited.add(team.id);
      rows.push({ team, depth });
      visit(team.id, depth + 1);
    });
  }
  visit(null, 0);
  teams.forEach((team) => { if (!visited.has(team.id)) rows.push({ team, depth: 0 }); });
  return rows;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function PeopleView() {
  const [view, setView] = useState<View>("areas");
  const [directory, setDirectory] = useState<Directory>({ departments: [], teams: [] });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/organization", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar o diretório.");
        return result as Directory;
      })
      .then((result) => { setDirectory(result); setStatus("ready"); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("error"); });
    return () => controller.abort();
  }, []);

  const teamRows = buildTeamTree(directory.teams);
  const tabs: { id: View; label: string; icon: IconName }[] = [
    { id: "areas", label: "Áreas", icon: "grid" },
    { id: "times", label: "Equipes", icon: "people" },
    { id: "organograma", label: "Estrutura de equipes", icon: "briefcase" },
  ];
  const empty = status === "loading" ? "Carregando dados da empresa..." : status === "error" ? "Não foi possível carregar o diretório. Atualize a página para tentar novamente." : "O RH ainda não cadastrou itens nesta seção.";

  return <section className="people-directory">
    <p className="eyebrow">Diretório da empresa</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Pessoas & áreas</h1>
    <p className="mt-2 text-[#777a91]">Veja as áreas, equipes e pessoas cadastradas pela empresa.</p>
    <div className="people-directory__tabs mt-7">{tabs.map((tab) => <button className={`people-directory__tab ${view === tab.id ? "people-directory__tab--active" : ""}`} key={tab.id} onClick={() => setView(tab.id)} type="button"><Icon name={tab.icon} size={17} /> {tab.label}</button>)}</div>

    {view === "areas" && (directory.departments.length ? <div className="mt-6 grid gap-5 xl:grid-cols-3">{directory.departments.map((department, index) => <article className="content-panel" key={department.id}>
      <div className="flex items-start justify-between"><div className={`grid size-12 place-items-center rounded-2xl ${["bg-[#e9e8ff] text-[#5859d6]", "bg-[#e4f4ff] text-[#287aab]", "bg-[#fff0df] text-[#b56a20]"][index % 3]}`}><Icon name="people" size={22} /></div><span className="rounded-full bg-[#f5f5f9] px-3 py-1 text-[10px] font-extrabold text-[#888a9d]">{department.members.length} {department.members.length === 1 ? "pessoa" : "pessoas"}</span></div>
      <h2 className="mt-5 text-lg font-extrabold">{department.name}</h2><p className="mt-1 text-sm leading-6 text-[#7e8197]">{department.description || "Área da empresa"}</p>
      <div className="mt-5 space-y-2 border-t border-[#eeeeF4] pt-4">{department.members.length ? department.members.map((person) => <PersonRow key={person.id} person={person} />) : <p className="text-xs text-[#85879a]">Nenhuma pessoa associada a esta área.</p>}</div>
    </article>)}</div> : <EmptyState text={empty} />)}

    {view === "times" && (teamRows.length ? <div className="mt-6 space-y-4">{teamRows.map(({ team, depth }) => <article className="team-card" key={team.id} style={{ marginLeft: `${Math.min(depth, 3) * 18}px` }}>
      <div className="team-card__summary"><div className="grid size-11 place-items-center rounded-xl bg-[#e9e8ff] text-[#5859d6]"><Icon name="people" size={20} /></div><div><h2>{team.name}</h2><p>{team.parentTeamName ? `Subequipe de ${team.parentTeamName}` : team.description || "Equipe da empresa"}</p></div><span className="ml-auto rounded-full bg-[#f5f5f9] px-3 py-1 text-[10px] font-extrabold text-[#888a9d]">{team.members.length} {team.members.length === 1 ? "pessoa" : "pessoas"}</span></div>
      <div className="team-card__members">{team.members.length ? team.members.map((person) => <PersonRow key={person.id} person={person} compact />) : <p className="text-xs text-[#85879a]">Nenhuma pessoa associada a esta equipe.</p>}</div>
    </article>)}</div> : <EmptyState text={empty} />)}

    {view === "organograma" && <div className="org-chart mt-6"><div className="mb-6"><h2 className="text-lg font-extrabold">Hierarquia das equipes</h2><p className="mt-1 text-xs text-[#8a8da2]">A organização segue as equipes superiores e subequipes definidas pelo RH.</p></div>
      {teamRows.length ? <div className="space-y-3">{teamRows.map(({ team, depth }) => <article className="rounded-xl border border-[#e8e8f0] bg-white p-4" key={team.id} style={{ marginLeft: `${Math.min(depth, 4) * 24}px` }}>
        <div className="flex flex-wrap items-center gap-2"><Icon name="people" size={17} /><h3 className="font-extrabold">{team.name}</h3>{team.parentTeamName && <span className="rounded-full bg-[#f3f3f8] px-2 py-1 text-[10px] text-[#777a91]">Subequipe de {team.parentTeamName}</span>}</div>
        {team.leaders.length > 0 && <p className="mt-2 text-xs text-[#777a91]">Liderança: <strong className="text-[#45475d]">{team.leaders.map(({ name }) => name).join(" · ")}</strong></p>}
        <div className="mt-3 flex flex-wrap gap-2">{team.members.map((person) => <span className="rounded-full bg-[#f5f5f9] px-3 py-1.5 text-xs text-[#55576d]" key={person.id}>{person.name}{person.isLeader ? " · Líder" : ""}</span>)}</div>
      </article>)}</div> : <EmptyState text={empty} />}
    </div>}
  </section>;
}

function PersonRow({ person, compact = false }: { person: DirectoryPerson; compact?: boolean }) {
  return <div className={`people-person ${person.isLeader ? "people-person--leader" : ""} ${compact ? "people-person--compact" : ""}`}>
    <div className="people-person__avatar">{initials(person.name)}</div><div className="people-person__details"><div className="people-person__heading"><h3>{person.name}</h3>{person.isLeader && <span className="people-person__badge">Líder</span>}</div><p>{person.jobTitle || "Cargo não informado"}</p></div>
  </div>;
}

function EmptyState({ text }: { text: string }) { return <div className="mt-6 rounded-2xl border border-dashed border-[#d9d9e6] bg-white p-8 text-center text-sm text-[#777a91]">{text}</div>; }

export default PeopleView;
