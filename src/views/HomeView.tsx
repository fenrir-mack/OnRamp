import "../styles/library.css";
import { Icon, resources, folders, type IconName } from "../components/shared";
import { journeyStages } from "../data/journeyStages";

type HomeViewProps = {
  query: string;
  setQuery: (query: string) => void;
  filtered: typeof resources;
  setActiveNav: (navigationItem: string) => void;
};

export default function HomeView({ query, setQuery, filtered, setActiveNav }: HomeViewProps) {
  return (
    <>
      <section className="welcome-card">
        <div className="relative z-10 max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white"><Icon name="sparkle" size={14} /> Primeira semana</div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">Olá, Ana! Como está sendo sua chegada?</h1>
          <p className="mt-3 text-sm leading-6 text-indigo-100 sm:text-base">Você já completou 6 de 10 atividades desta etapa. Continue assim!</p>
          <div className="mt-6 flex items-center gap-4">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/20"><div className="h-full w-3/5 rounded-full bg-[#ffc66b]" /></div>
            <strong className="text-sm text-white">60%</strong>
          </div>
        </div>
        <div className="welcome-card__art"><div className="welcome-card__illustration"><Icon name="check" size={42} /></div></div>
      </section>

      <div className="mt-7 md:hidden">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9b9daf]"><Icon name="search" size={19} /></span>
          <input className="search-field bg-white" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar informações..." />
        </div>
      </div>

      <section className="mt-9">
        <div className="section-heading">
          <div><p className="eyebrow">Sua evolução</p><h2>Etapas da jornada</h2></div>
          <button onClick={() => setActiveNav("Minha jornada")} className="section-heading__link">Ver jornada completa <Icon name="arrow" size={17} /></button>
        </div>
        <div className="journey-timeline mt-5">
          <div className="journey-timeline__track">
            {journeyStages.map((stage, index) => (
              <div className="contents" key={stage.label}>
                <div className={`journey-timeline__step journey-stage--${stage.status}`}>
                  <div className="journey-stage__number">{stage.status === "done" ? <Icon name="check" size={16} /> : index + 1}</div>
                  <div className="min-w-0"><h3>{stage.label}</h3><p>{stage.date}</p></div>
                </div>
                {index < journeyStages.length - 1 && <div className="journey-timeline__arrow"><Icon name="arrow" size={18} /></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="section-heading">
          <div><p className="eyebrow">Biblioteca</p><h2>Arquivos e documentos</h2></div>
          <button onClick={() => setActiveNav("Conteúdos")} className="section-heading__link">Abrir biblioteca <Icon name="arrow" size={17} /></button>
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.35fr]">
          <div className="featured-resource text-left">
            <div className="flex items-start justify-between">
              <span className="featured-resource__label"><Icon name="sparkle" size={14} /> Em destaque</span>
              <span className="text-xs font-bold text-[#7779db]">PDF</span>
            </div>
            <div className="mt-auto">
              <div className="resource-icon resource-icon--indigo"><Icon name="book" size={22} /></div>
              <h3 className="mt-4 text-lg font-extrabold">Manual do novo talento</h3>
              <p className="mt-2 text-sm leading-6 text-[#74778f]">O guia essencial para os seus primeiros dias na empresa.</p>
              <a
                  href="/materiais/manual-novo-talento.pdf"
                  download="manual-novo-talento.pdf"
                  className="mt-5 flex w-fit items-center gap-2 text-xs font-extrabold text-[#5556d8] no-underline"
              >
                Abrir arquivo
                <Icon name="arrow" size={16}/>
              </a>
            </div>
          </div>
          <div className="content-panel">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-extrabold">Pastas</h3><p className="mt-1 text-xs text-[#8a8da2]">23 arquivos organizados por assunto</p></div>
              <button onClick={() => setActiveNav("Conteúdos")} className="text-xs font-extrabold text-[#5556d8]">Ver tudo</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {folders.map((folder) => <button className="folder-list__item" key={folder.name}><span className={`folder-list__icon folder-list__icon--${folder.tone}`}><Icon name="book" size={18} /></span><span className="min-w-0 flex-1 text-left"><strong>{folder.name}</strong><small>{folder.count} arquivos</small></span><Icon name="chevron" size={15} /></button>)}
            </div>
          </div>
        </div>
        {query && filtered.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-[#d9d9e6] bg-white p-8 text-center text-sm text-[#777a91]">Nenhum arquivo encontrado para “{query}”.</div>}
      </section>

      <section className="mt-10">
        <div className="content-panel">
          <div className="section-heading"><div><p className="eyebrow">Para esta semana</p><h2>Próximas atividades</h2></div><span className="rounded-full bg-[#f1f0ff] px-3 py-1 text-xs font-bold text-[#595ad8]">3 pendentes</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[["Conhecer o time de Produto", "Hoje, 14:00", "people"], ["Configurar acessos essenciais", "Até amanhã", "tools"], ["Ler guia de cultura", "Até sexta-feira", "book"]].map(([title, date, icon]) => (
              <div className="activity-list__item" key={title}>
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3f3f9] text-[#62657e]"><Icon name={icon as IconName} size={20} /></div>
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-extrabold">{title}</h3><p className="mt-1 flex items-center gap-1.5 text-xs text-[#898ba0]"><Icon name="clock" size={13} /> {date}</p></div>
                <button className="grid size-9 place-items-center rounded-lg border border-[#e5e5ee] text-[#686a81] hover:bg-[#f6f6fa]"><Icon name="chevron" size={16} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="support-card mt-5">
          <div className="flex items-center gap-4"><div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#7778eb] font-extrabold text-white">MR</div><div><p className="support-card__eyebrow">Seu ponto de apoio</p><h2 className="mt-1 text-lg font-extrabold text-white">Marina Rocha</h2><p className="mt-1 text-sm text-[#b9bbcf]">Product Designer</p></div></div>
          <p className="max-w-xl text-sm leading-6 text-[#d0d1df]">Marina está aqui para orientar você nos primeiros passos e ajudar a encontrar as respostas certas.</p>
          <button className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#292b48]"><Icon name="mail" size={17} /> Enviar mensagem</button>
        </div>
      </section>
    </>
  );
}
