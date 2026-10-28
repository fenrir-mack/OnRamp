import { useMemo, useState } from "react";
import "../styles/library.css";
import { Icon, type IconName, type LibraryResource } from "../components/shared";
import ResourceCard from "../components/ResourceCard";

function ContentView({ query, setQuery, resources, filtered, status }: { query: string; setQuery: (q: string) => void; resources: LibraryResource[]; filtered: LibraryResource[]; status: "loading" | "ready" | "error" }) {
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [activeFormat, setActiveFormat] = useState("Todos");

  const categories = useMemo(() => Array.from(new Set(resources.map((resource) => resource.category))), [resources]);
  const formats = useMemo(() => Array.from(new Set(resources.map((resource) => resource.meta.split(" • ")[0]))), [resources]);
  const categoryIcons: Record<string, IconName> = {
    Benefícios: "briefcase",
    Cultura: "people",
    Ferramentas: "tools",
    Financeiro: "briefcase",
    Onboarding: "sparkle",
    Políticas: "book",
  };
  const visibleResources = filtered.filter((resource) => {
    const matchesCategory = activeCategory === "Todos" || resource.category === activeCategory;
    const matchesFormat = activeFormat === "Todos" || resource.meta.startsWith(activeFormat);
    return matchesCategory && matchesFormat;
  });

  function clearFilters() {
    setActiveCategory("Todos");
    setActiveFormat("Todos");
    setQuery("");
  }

  return (
    <section className="library-page">
      <header className="library-page__header">
        <div>
          <p className="eyebrow">Central de informações</p>
          <h1 className="library-page__title">Conteúdos para sua jornada</h1>
          <p className="library-page__intro">Encontre orientações, documentos e pessoas responsáveis por cada assunto.</p>
        </div>
        <div className="library-page__count"><Icon name="book" size={18} /><span><strong>{resources.length}</strong> materiais disponíveis</span></div>
      </header>

      <div className="library-search">
        <Icon name="search" size={21} />
        <input aria-label="Buscar conteúdos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque por título, assunto ou palavra-chave" />
        {query && <button className="library-search__clear" onClick={() => setQuery("")} type="button">Limpar</button>}
      </div>

      <section className="library-section" aria-labelledby="library-topics-title">
        <div className="library-section__heading">
          <div><p className="eyebrow">Navegue pela biblioteca</p><h2 id="library-topics-title">Explore por assunto</h2></div>
          {activeCategory !== "Todos" && <button className="library-section__reset" onClick={() => setActiveCategory("Todos")} type="button">Ver todos os assuntos</button>}
        </div>
        <div className="library-topics">
          {categories.map((category) => {
            const count = resources.filter((resource) => resource.category === category).length;
            const selected = activeCategory === category;
            return (
              <button
                aria-pressed={selected}
                className={`library-topic ${selected ? "library-topic--active" : ""}`}
                key={category}
                onClick={() => setActiveCategory(selected ? "Todos" : category)}
                type="button"
              >
                <span className="library-topic__icon"><Icon name={categoryIcons[category] ?? "book"} size={20} /></span>
                <span className="library-topic__text"><strong>{category}</strong><small>{count} {count === 1 ? "material" : "materiais"}</small></span>
                <Icon name="chevron" size={16} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="library-section library-section--resources" aria-labelledby="library-resources-title">
        <div className="library-section__heading library-section__heading--resources">
          <div><p className="eyebrow">Materiais de apoio</p><h2 id="library-resources-title">Biblioteca de conteúdos</h2></div>
          <span className="library-section__result-count">{visibleResources.length} {visibleResources.length === 1 ? "material" : "materiais"}</span>
        </div>

        <div className="library-filters" aria-label="Filtrar por formato">
          {["Todos", ...formats].map((format) => (
            <button
              aria-pressed={activeFormat === format}
              className={`content-filter__pill ${activeFormat === format ? "content-filter__pill--active" : ""}`}
              key={format}
              onClick={() => setActiveFormat(format)}
              type="button"
            >
              {format === "Todos" ? "Todos os formatos" : format}
            </button>
          ))}
        </div>

        {status === "loading" ? (
          <div className="library-empty"><h3>Carregando materiais...</h3></div>
        ) : status === "error" ? (
          <div className="library-empty"><h3>Não foi possível carregar a biblioteca</h3><p>Confira sua conexão e atualize a página para tentar novamente.</p></div>
        ) : visibleResources.length > 0 ? (
          <div className="library-resource-grid">
            {visibleResources.map((resource) => <ResourceCard key={resource.title} resource={resource} />)}
          </div>
        ) : (
          <div className="library-empty">
            <span className="library-empty__icon"><Icon name="search" size={23} /></span>
            <h3>{resources.length === 0 ? "Ainda não há materiais na biblioteca" : "Nenhum conteúdo encontrado"}</h3>
            <p>{resources.length === 0 ? "O RH poderá adicionar materiais para as pessoas da empresa." : "Tente mudar os filtros ou buscar por outro termo."}</p>
            {resources.length > 0 && <button className="library-empty__reset" onClick={clearFilters} type="button">Limpar busca e filtros</button>}
          </div>
        )}
      </section>
    </section>
  );
}

export default ContentView;
