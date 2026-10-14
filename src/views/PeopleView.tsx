import "../styles/people.css";
import { useState } from "react";
import { Icon, type IconName } from "../components/shared";

function PeopleView() {
  const [view, setView] = useState<"areas" | "times" | "organograma">("areas");
  const teams = [
    { area: "Pessoas & Cultura", description: "Benefícios, políticas e desenvolvimento", color: "bg-[#e9e8ff] text-[#5859d6]", leader: ["CB", "Carla Braga", "People Partner"], members: [["RF", "Rafael Freitas", "Analista de Pessoas"], ["JL", "Joana Lima", "Talent Acquisition"]] },
    { area: "Tecnologia", description: "Acessos, equipamentos e suporte", color: "bg-[#e4f4ff] text-[#287aab]", leader: ["GM", "Gabriel Mendes", "Tech Lead"], members: [["IS", "Isabela Souza", "IT Support"], ["LM", "Lucas Martins", "Software Engineer"]] },
    { area: "Produto", description: "Estratégia, produto e design", color: "bg-[#fff0df] text-[#b56a20]", leader: ["AF", "André Faria", "Head de Produto"], members: [["MR", "Marina Rocha", "Product Designer"], ["AS", "Ana Silva", "Product Analyst"]] },
  ];
  const tabs: { id: "areas" | "times" | "organograma"; label: string; icon: IconName }[] = [
    { id: "areas", label: "Áreas", icon: "grid" },
    { id: "times", label: "Times", icon: "people" },
    { id: "organograma", label: "Organograma", icon: "briefcase" },
  ];

  return (
    <section className="people-directory">
      <p className="eyebrow">Diretório da empresa</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Pessoas & áreas</h1>
      <p className="mt-2 text-[#777a91]">Conheça os times e encontre a pessoa certa para cada assunto.</p>

      <div className="people-directory__tabs mt-7">
        {tabs.map((tab) => (
          <button className={`people-directory__tab ${view === tab.id ? "people-directory__tab--active" : ""}`} key={tab.id} onClick={() => setView(tab.id)}>
            <Icon name={tab.icon} size={17} /> {tab.label}
          </button>
        ))}
      </div>

      {view === "areas" && (
        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          {teams.map((team) => (
            <div className="content-panel" key={team.area}>
              <div className="flex items-start justify-between">
                <div className={`grid size-12 place-items-center rounded-2xl ${team.color}`}><Icon name="people" size={22} /></div>
                <span className="rounded-full bg-[#f5f5f9] px-3 py-1 text-[10px] font-extrabold text-[#888a9d]">{team.members.length + 1} pessoas</span>
              </div>
              <h2 className="mt-5 text-lg font-extrabold">{team.area}</h2><p className="mt-1 text-sm leading-6 text-[#7e8197]">{team.description}</p>
              <div className="mt-5 space-y-3 border-t border-[#eeeeF4] pt-5">
                <PersonRow initials={team.leader[0]} name={team.leader[1]} role={team.leader[2]} leader />
                {team.members.slice(0, 1).map(([initials, name, role]) => <PersonRow initials={initials} name={name} role={role} key={name} />)}
              </div>
              <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e2e2eb] py-2.5 text-sm font-extrabold text-[#5557c9]">Ver área <Icon name="arrow" size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {view === "times" && (
        <div className="mt-6 space-y-4">
          {teams.map((team) => (
            <div className="team-card" key={team.area}>
              <div className="team-card__summary">
                <div className={`grid size-11 place-items-center rounded-xl ${team.color}`}><Icon name="people" size={20} /></div>
                <div><h2>{team.area}</h2><p>{team.description}</p></div>
              </div>
              <div className="team-card__members">
                <PersonRow initials={team.leader[0]} name={team.leader[1]} role={team.leader[2]} leader compact />
                {team.members.map(([initials, name, role]) => <PersonRow initials={initials} name={name} role={role} key={name} compact />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "organograma" && (
        <div className="org-chart mt-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-extrabold">Estrutura organizacional</h2><p className="mt-1 text-xs text-[#8a8da2]">Visão simplificada das lideranças e seus times</p></div>
            <span className="rounded-full bg-[#f0efff] px-3 py-1.5 text-[10px] font-extrabold text-[#5b5cd5]">9 colaboradores</span>
          </div>
          <div className="org-chart__scroll">
            <div className="org-chart__canvas">
              <OrgPerson initials="MC" name="Marcelo Costa" role="CEO" lead />
              <div className="org-chart__trunk" />
              <div className="org-chart__branches">
                {teams.map((team) => {
                  return (
                    <div className="org-chart__branch" key={team.area}>
                      <div className="org-chart__connector" />
                      <p className={`org-chart__area-label ${team.color}`}>{team.area}</p>
                      <OrgPerson initials={team.leader[0]} name={team.leader[1]} role={team.leader[2]} lead />
                      <div className="org-chart__team-line" />
                      <div className="space-y-2">
                        {team.members.map(([initials, name, role]) => <OrgPerson initials={initials} name={name} role={role} small key={name} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PersonRow({ initials, name, role, leader = false, compact = false }: { initials: string; name: string; role: string; leader?: boolean; compact?: boolean }) {
  return (
    <div className={`people-person ${leader ? "people-person--leader" : ""} ${compact ? "people-person--compact" : ""}`}>
      <div className="people-person__avatar">{initials}</div>
      <div className="people-person__details">
        <div className="people-person__heading"><h3>{name}</h3>{leader && <span className="people-person__badge">Líder</span>}</div>
        <p>{role}</p>
      </div>
    </div>
  );
}

function OrgPerson({ initials, name, role, lead = false, small = false }: { initials: string; name: string; role: string; lead?: boolean; small?: boolean }) {
  return (
    <div className={`org-person ${lead ? "org-person--lead" : ""} ${small ? "org-person--small" : ""}`}>
      <div className="org-person__avatar">{initials}</div>
      <div className="org-person__details">
        <div className="org-person__heading"><h3>{name}</h3>{lead && <span className="org-person__badge">Líder</span>}</div>
        <p>{role}</p>
      </div>
    </div>
  );
}
export default PeopleView;
