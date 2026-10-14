import "../styles/stage-summary.css";

export type SummaryTone = "success" | "warning" | "danger";

export type SummaryStat = {
  value: number;
  label: string;
  tone: SummaryTone;
};

type StageSummaryProps = {
  eyebrow: string;
  title: string;
  description: string;
  stats: SummaryStat[];
};

function StageSummary({ eyebrow, title, description, stats }: StageSummaryProps) {
  return (
    <header className="stage-summary">
      <div className="stage-summary__copy">
        <p className="stage-summary__eyebrow">{eyebrow}</p>
        <h2 className="stage-summary__title">{title}</h2>
        <p className="stage-summary__description">{description}</p>
      </div>
      <div className="stage-summary__stats">
        {stats.map((stat) => (
          <div className="stage-summary__stat" key={stat.label}>
            <strong className={`stage-summary__value stage-summary__value--${stat.tone}`}>{stat.value}</strong>
            <span className="stage-summary__label">{stat.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

export default StageSummary;
