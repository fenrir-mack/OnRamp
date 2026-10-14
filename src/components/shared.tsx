import type { ReactNode } from "react";

export type IconName =
  | "arrow"
  | "book"
  | "briefcase"
  | "calendar"
  | "check"
  | "chevron"
  | "clock"
  | "grid"
  | "help"
  | "home"
  | "lock"
  | "mail"
  | "menu"
  | "people"
  | "search"
  | "settings"
  | "sparkle"
  | "tools"
  | "user";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    book: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9a2.6 2.6 0 1 1 4.5 1.8c-1.1.9-2.1 1.3-2.1 3.2M12 18h.01" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
        <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14ZM5 13l.7 2.3L8 16l-2.3.7L5 19l-.7-2.3L2 16l2.3-.7L5 13Z" />
      </>
    ),
    tools: (
      <>
        <path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L20 16.4a2.1 2.1 0 0 1-3 3l-7.7-7.7" />
        <path d="m5 21 4.5-4.5M3 19l2 2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

export const resources = [
  { title: "Guia de benefícios", category: "Benefícios", meta: "PDF • 8 min", description: "Conheça seus benefícios, critérios de elegibilidade e canais de atendimento.", owner: "Pessoas & Cultura", icon: "briefcase" as IconName, tone: "indigo" },
  { title: "Políticas da empresa", category: "Políticas", meta: "Documento • 12 min", description: "Consulte as principais diretrizes e os acordos que orientam nosso dia a dia.", owner: "Pessoas & Cultura", icon: "book" as IconName, tone: "blue" },
  { title: "Acessos e ferramentas", category: "Ferramentas", meta: "Checklist • 6 min", description: "Veja quais ferramentas usamos e como começar a acessar cada uma delas.", owner: "Tecnologia", icon: "tools" as IconName, tone: "orange" },
  { title: "Manual do novo talento", category: "Onboarding", meta: "PDF • 15 min", description: "Um guia prático para conhecer a empresa e se organizar nos primeiros dias.", owner: "Pessoas & Cultura", icon: "sparkle" as IconName, tone: "purple" },
  { title: "Política de trabalho remoto", category: "Políticas", meta: "PDF • 4 min", description: "Entenda os combinados para trabalhar de forma remota ou híbrida.", owner: "Pessoas & Cultura", icon: "home" as IconName, tone: "blue" },
  { title: "Guia de reembolso", category: "Financeiro", meta: "PDF • 5 min", description: "Confira quais despesas podem ser reembolsadas e como enviar uma solicitação.", owner: "Financeiro", icon: "briefcase" as IconName, tone: "orange" },
  { title: "Código de conduta", category: "Cultura", meta: "PDF • 9 min", description: "Conheça os princípios de respeito, ética e colaboração que compartilhamos.", owner: "Pessoas & Cultura", icon: "book" as IconName, tone: "purple" },
  { title: "Agenda da primeira semana", category: "Onboarding", meta: "Agenda • 3 min", description: "Veja os principais encontros e atividades planejados para a sua primeira semana.", owner: "Pessoas & Cultura", icon: "calendar" as IconName, tone: "indigo" },
];

export const folders = [
  { name: "Onboarding", count: 6, tone: "indigo" },
  { name: "Benefícios", count: 4, tone: "blue" },
  { name: "Políticas", count: 8, tone: "purple" },
  { name: "Ferramentas", count: 5, tone: "orange" },
];

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid size-10 place-items-center rounded-xl ${light ? "bg-white/15 text-white" : "bg-[#5b5ce2] text-white"}`}>
        <Icon name="sparkle" size={22} />
      </div>
      <span className={`text-xl font-extrabold tracking-tight ${light ? "text-white" : "text-[#20223a]"}`}>OnRamp</span>
    </div>
  );
}
