import "../styles/people.css";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "../components/shared";
import EmployeeAvatar from "../components/EmployeeAvatar";

type DirectoryPerson = { id: number; name: string; jobTitle: string | null; isLeader?: boolean };
type Department = { id: number; name: string; description: string | null; members: DirectoryPerson[] };
type Team = { id: number; name: string; description: string | null; parentTeamId: number | null; parentTeamName: string | null; members: DirectoryPerson[]; leaders: DirectoryPerson[] };
type TeamNode = { team: Team; children: TeamNode[] };
type Directory = { departments: Department[]; teams: Team[] };
type View = "areas" | "times" | "organograma";

function buildTeamTree(teams: Team[]): TeamNode[] {
  const children = new Map<number | null, Team[]>();
  teams.forEach((team) => children.set(team.parentTeamId, [...(children.get(team.parentTeamId) ?? []), team]));
  children.forEach((rows) => rows.sort((left, right) => left.name.localeCompare(right.name)));
  const roots: TeamNode[] = [];
  const visited = new Set<number>();
  function createNode(team: Team): TeamNode {
    visited.add(team.id);
    const node: TeamNode = { team, children: [] };
    node.children = (children.get(team.id) ?? []).filter((child) => !visited.has(child.id)).map(createNode);
    return node;
  }
  (children.get(null) ?? []).forEach((team) => { if (!visited.has(team.id)) roots.push(createNode(team)); });
  teams.forEach((team) => { if (!visited.has(team.id)) roots.push(createNode(team)); });
  return roots;
}

function flattenTeamTree(nodes: TeamNode[], depth = 0): { team: Team; depth: number }[] {
  return nodes.flatMap((node) => [
    { team: node.team, depth },
    ...flattenTeamTree(node.children, depth + 1),
  ]);
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

  const teamTree = buildTeamTree(directory.teams);
  const teamRows = flattenTeamTree(teamTree);
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

    {view === "organograma" && <div className="org-chart mt-6"><div className="org-chart__heading"><div><h2>Organograma de equipes</h2><p>Equipes superiores aparecem acima das equipes subordinadas.</p></div><span className="org-chart__count">{directory.teams.length} {directory.teams.length === 1 ? "equipe" : "equipes"}</span></div>
      {teamTree.length ? <div className="org-chart__forest">{teamTree.map((node) => <OrgTeamNode key={node.team.id} node={node} />)}</div> : <EmptyState text={empty} />}
    </div>}
  </section>;
}

function OrgTeamNode({ node }: { node: TeamNode }) {
  const { team, children } = node;
  const individualContributors = team.members.filter((person) => !team.leaders.some((leader) => leader.id === person.id));
  return <div className="org-tree__node">
    <article className="org-team-card">
      <div className="org-team-card__heading"><span className="org-team-card__icon"><Icon name="people" size={18} /></span><div className="min-w-0 flex-1"><h3>{team.name}</h3><p>{team.description || "Equipe da empresa"}</p></div><span className="org-team-card__count">{team.members.length} {team.members.length === 1 ? "pessoa" : "pessoas"}</span></div>
      {team.leaders.length > 0 && <div className="org-team-card__leaders"><span className="org-team-card__label">{team.leaders.length === 1 ? "Liderança" : "Lideranças"}</span>{team.leaders.map((leader) => <div className="org-team-person org-team-person--leader" key={leader.id}><EmployeeAvatar employeeId={leader.id} name={leader.name} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e7e6ff] text-[10px] font-extrabold text-[#5556d8]" /><span><strong>{leader.name}</strong><small>{leader.jobTitle || "Cargo não informado"}</small></span><span className="org-team-person__badge">Líder</span></div>)}</div>}
      {individualContributors.length > 0 && <div className="org-team-card__members"><span className="org-team-card__label">Integrantes · {individualContributors.length}</span><div className="org-team-card__people">{individualContributors.map((person) => <div className="org-team-person" key={person.id}><EmployeeAvatar employeeId={person.id} name={person.name} className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f0f0f7] text-[9px] font-extrabold text-[#595c75]" /><span><strong>{person.name}</strong><small>{person.jobTitle || "Cargo não informado"}</small></span></div>)}</div></div>}
      {team.members.length === 0 && team.leaders.length === 0 && <p className="org-team-card__empty">Ainda não há pessoas nesta equipe.</p>}
    </article>
    {children.length > 0 && <div className="org-tree__children">{children.map((child) => <OrgTeamNode key={child.team.id} node={child} />)}</div>}
  </div>;
}

function PersonRow({ person, compact = false }: { person: DirectoryPerson; compact?: boolean }) {
  return <div className={`people-person ${person.isLeader ? "people-person--leader" : ""} ${compact ? "people-person--compact" : ""}`}>
    <EmployeeAvatar employeeId={person.id} name={person.name} className="grid place-items-center rounded-[11px] bg-[#f1f1f7] text-[11px] font-extrabold text-[#595c75] people-person__avatar" /><div className="people-person__details"><div className="people-person__heading"><h3>{person.name}</h3>{person.isLeader && <span className="people-person__badge">Líder</span>}</div><p>{person.jobTitle || "Cargo não informado"}</p></div>
  </div>;
}

function EmptyState({ text }: { text: string }) { return <div className="mt-6 rounded-2xl border border-dashed border-[#d9d9e6] bg-white p-8 text-center text-sm text-[#777a91]">{text}</div>; }

export default PeopleView;
