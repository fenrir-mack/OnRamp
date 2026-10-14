import { Icon, resources } from "./shared";

type Resource = (typeof resources)[number];

function ResourceCard({ resource }: { resource: Resource }) {
  const [format] = resource.meta.split(" • ");

  return (
    <article className="library-resource">
      <span className={`library-resource__icon resource-icon resource-icon--${resource.tone}`}><Icon name={resource.icon} size={19} /></span>
      <div className="library-resource__body">
        <div className="library-resource__topline">
          <span className="library-resource__category">{resource.category}</span>
          <span className="library-resource__format">{format}</span>
        </div>
        <h3 className="library-resource__title">{resource.title}</h3>
        <p className="library-resource__description" title={resource.description}>{resource.description}</p>
      </div>
    </article>
  );
}

export default ResourceCard;
