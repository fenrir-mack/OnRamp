import { Icon, type LibraryResource } from "./shared";

function ResourceCard({ resource }: { resource: LibraryResource }) {
  const [format] = resource.meta.split(" • ");

  const downloadUrl = resource.downloadUrl;

  return (
    <article className="library-resource">
      <span className={`library-resource__icon resource-icon resource-icon--${resource.tone}`}><Icon name={resource.icon} size={19} /></span>
      <div className="library-resource__body">
        <div className="library-resource__topline">
          <div className="flex flex-wrap items-center gap-2"><span className="library-resource__category">{resource.category}</span>{resource.audience && <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${resource.audience === "personal" ? "bg-[#fff1dc] text-[#a9681c]" : "bg-[#eaf7f0] text-[#288b65]"}`}>{resource.audience === "personal" ? "Só para você" : "Compartilhado"}</span>}</div>
          <div className="library-resource__actions">
            <span className="library-resource__format">
              {format}
            </span>

            {downloadUrl && (
              <a
                href={downloadUrl}
                download={resource.isExternalLink ? undefined : true}
                target={resource.isExternalLink ? "_blank" : undefined}
                rel={resource.isExternalLink ? "noreferrer" : undefined}
                className="library-resource__download"
                aria-label={`${resource.isExternalLink ? "Abrir" : "Baixar"} ${resource.title}`}
                title={`${resource.isExternalLink ? "Abrir" : "Baixar"} ${resource.title}`}
              >
                <Icon name="download" size={18} />
              </a>
            )}
          </div>
        </div>
        <h3 className="library-resource__title">{resource.title}</h3>
        <p className="library-resource__description" title={resource.description}>{resource.description}</p>
      </div>
    </article>
  );
}

export default ResourceCard;
