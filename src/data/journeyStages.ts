import type { IconName } from "../components/shared";

export type StageTask = {
  title: string;
  description: string;
  completed: boolean;
  category: string;
  icon: IconName;
  owner: string;
  required?: boolean;
  overdue?: boolean;
};

export type JourneyStage = {
  code: string;
  label: string;
  date: string;
  status: "done" | "current" | "next";
  description: string;
  duration: string;
  owner: string;
  overviewEyebrow: string;
  overviewTitle: string;
  overviewDescription: string;
  tasks: StageTask[];
  materials: string[];
};

export const journeyStages: JourneyStage[] = [
  {
    code: "pre-entry",
    label: "Pré-entrada",
    date: "Concluído",
    status: "done",
    description: "Prepare tudo antes da sua chegada para começar com tranquilidade.",
    duration: "Antes do primeiro dia",
    owner: "Pessoas & Cultura",
    overviewEyebrow: "Preparação para sua chegada",
    overviewTitle: "Equipamentos, contas e acessos",
    overviewDescription: "Acompanhe o que estará disponível para você antes do primeiro dia.",
    tasks: [],
    materials: ["Checklist de documentos", "Guia de benefícios", "Agenda da primeira semana"],
  },
  {
    code: "first-steps",
    label: "Primeiros passos",
    date: "Concluído",
    status: "done",
    description: "Conheça sua equipe, encontre sua pessoa mentora e inicie as orientações da sua função.",
    duration: "Dias 1 a 5",
    owner: "Liderança direta",
    overviewEyebrow: "Integração com a equipe",
    overviewTitle: "Pessoas, conteúdos e capacitação",
    overviewDescription: "Atividades para localizar os contatos e orientações que apoiam seus primeiros dias.",
    tasks: [
      { title: "Conhecer equipe e áreas", description: "Explore o organograma, os papéis e os contatos da empresa.", completed: true, category: "Equipe", icon: "people", owner: "Liderança direta" },
      { title: "Conversar com sua pessoa mentora", description: "Conheça sua referência para dúvidas sobre a rotina e a empresa.", completed: true, category: "Mentoria", icon: "user", owner: "Marina Rocha" },
      { title: "Acessar conteúdos essenciais", description: "Consulte benefícios, políticas e orientações da sua etapa.", completed: true, category: "Conteúdo", icon: "book", owner: "Pessoas & Cultura" },
      { title: "Iniciar a trilha do seu cargo", description: "Veja os treinamentos recomendados e organize seu aprendizado.", completed: true, category: "Capacitação", icon: "sparkle", owner: "Liderança direta" },
      { title: "Fazer o check-in da primeira semana", description: "Registre como está sua adaptação e se precisa de suporte.", completed: true, category: "Check-in", icon: "calendar", owner: "Pessoas & Cultura" },
    ],
    materials: ["Organograma e áreas", "Manual do novo talento", "Trilha de capacitação"],
  },
  {
    code: "in-progress",
    label: "Em andamento",
    date: "Você está aqui",
    status: "current",
    description: "Avance nas capacitações e acompanhe sua adaptação com check-ins e conversas de apoio.",
    duration: "Semanas 2 a 8",
    owner: "André Faria",
    overviewEyebrow: "Acompanhamento da jornada",
    overviewTitle: "Capacitação e adaptação",
    overviewDescription: "Acompanhe cursos, avaliações, check-ins e entregas previstas para as próximas semanas.",
    tasks: [
      { title: "Avançar na trilha de capacitação", description: "Retome os cursos da sua função e acompanhe o que falta.", completed: true, category: "Capacitação", icon: "book", owner: "André Faria" },
      { title: "Registrar check-in de adaptação", description: "Compartilhe dúvidas, dificuldades e o suporte de que precisa.", completed: true, category: "Check-in", icon: "calendar", owner: "Pessoas & Cultura" },
      { title: "Realizar avaliação dos treinamentos", description: "Valide o que aprendeu nos conteúdos obrigatórios.", completed: false, category: "Avaliação", icon: "check", owner: "Pessoas & Cultura" },
      { title: "Revisar seu progresso com a liderança", description: "Converse sobre expectativas, entregas e pontos de apoio.", completed: false, category: "Acompanhamento", icon: "people", owner: "André Faria" },
      { title: "Pedir ajuda sobre dúvidas pendentes", description: "Direcione cada pergunta à pessoa responsável pelo assunto.", completed: false, category: "Suporte", icon: "help", owner: "Responsável pelo assunto" },
      { title: "Concluir uma entrega acompanhada", description: "Receba feedback e combine os próximos passos.", completed: false, category: "Entrega", icon: "briefcase", owner: "André Faria" },
    ],
    materials: ["Plano de 30 dias", "Trilha da sua área", "Políticas e treinamentos"],
  },
  {
    code: "completion",
    label: "Onboarding concluído",
    date: "Próxima etapa",
    status: "next",
    description: "Revise seu progresso, compartilhe feedback e combine seus próximos objetivos.",
    duration: "Ao final de 90 dias",
    owner: "Pessoas & Cultura",
    overviewEyebrow: "Fechamento do onboarding",
    overviewTitle: "Resultados e próximos passos",
    overviewDescription: "Revise suas capacitações, compartilhe feedback e planeje seu desenvolvimento.",
    tasks: [
      { title: "Revisar sua trilha e resultados", description: "Confira cursos concluídos, avaliações e itens que faltam.", completed: false, category: "Capacitação", icon: "book", owner: "André Faria" },
      { title: "Fazer a conversa de fechamento dos 90 dias", description: "Revise adaptação, aprendizados e próximos passos.", completed: false, category: "Check-in", icon: "calendar", owner: "André Faria" },
      { title: "Enviar feedback sobre o onboarding", description: "Conte o que funcionou e o que podemos melhorar.", completed: false, category: "Feedback", icon: "help", owner: "Pessoas & Cultura" },
      { title: "Definir objetivos do próximo ciclo", description: "Combine metas de desenvolvimento com sua liderança.", completed: false, category: "Desenvolvimento", icon: "briefcase", owner: "André Faria" },
      { title: "Consultar próximos conteúdos e responsáveis", description: "Acesse materiais, contatos e treinamentos recomendados.", completed: false, category: "Conteúdo", icon: "people", owner: "Pessoas & Cultura" },
    ],
    materials: ["Formulário de feedback", "Plano de desenvolvimento", "Contatos e responsáveis"],
  },
];
