import "../styles/task-card.css";
import { Icon, type IconName } from "./shared";

export type TaskStatus = "Concluído" | "Pendente" | "Atrasado" | "Resolvido";

type TaskCardProps = {
  title: string;
  detail: string;
  category: string;
  owner: string;
  required?: boolean;
  icon: IconName;
  status: TaskStatus;
  statusLabel?: string;
  onReport: () => void;
  onResolve?: () => void;
};

const statusDetails: Record<TaskStatus, { modifier: string; icon: IconName }> = {
  "Concluído": { modifier: "concluido", icon: "check" },
  "Pendente": { modifier: "pendente", icon: "clock" },
  "Atrasado": { modifier: "atrasado", icon: "help" },
  "Resolvido": { modifier: "resolvido", icon: "check" },
};

function TaskCard({ title, detail, category, owner, icon, status, statusLabel, required, onReport, onResolve }: TaskCardProps) {
  const currentStatus = statusDetails[status];
  const label = statusLabel ?? status;

  return (
    <article className="task-card">
      <span className="task-card__icon"><Icon name={icon} size={19} /></span>
      <div className="task-card__content">
        <div className="task-card__heading">
          <h3 className="task-card__title">{title}</h3>
          <span className="task-card__category">{category}</span>
          {required !== undefined && <span className={`task-card__requirement ${required ? "task-card__requirement--required" : ""}`}>{required ? "Obrigatória" : "Opcional"}</span>}
        </div>
        <p className="task-card__description">{detail}</p>
      </div>
      <div className="task-card__owner">
        <small>Responsável</small>
        <strong>{owner}</strong>
      </div>
      <span className={`status-badge status-badge--${currentStatus.modifier}`}>
        <Icon name={currentStatus.icon} size={13} />
        {label}
      </span>
      <div className="task-card__actions">
        <button className="task-card__report" onClick={onReport} type="button">Informar problema</button>
        {onResolve && <button className="task-card__resolve" onClick={onResolve} type="button"><Icon name="check" size={13} /> Resolver</button>}
      </div>
    </article>
  );
}

export default TaskCard;
