/* Default catalogs and task templates for the current OnRamp prototype. */

INSERT INTO public.Departments (Name, Description)
SELECT source.Name, source.Description
FROM (VALUES
  ('Pessoas & Cultura', 'Benefícios, políticas, desenvolvimento e acompanhamento.'),
  ('Tecnologia', 'Equipamentos, contas, acessos e suporte técnico.'),
  ('Produto', 'Estratégia, produto e design.'),
  ('Financeiro', 'Reembolsos e orientações financeiras.'),
  ('Liderança', 'Liderança executiva e acompanhamento das equipes.')
) AS source(Name, Description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.Departments AS existing WHERE existing.Name = source.Name
);

/* Test accounts for local development only. Passwords are stored as scrypt hashes. */
INSERT INTO public.Employees (Email, Full_Name, Job_Title, Department_Id, Password_Hash, Is_HR_Admin)
SELECT source.Email, source.Full_Name, source.Job_Title, department.Department_Id, source.Password_Hash, source.Is_HR_Admin
FROM (VALUES
  ('fenrir1@gmail.com', 'Fenrir Teste 1', 'Product Analyst', 'Produto', 'scrypt$ad5274939831c532dde70cea2ddb59fe$8d4facf18c8f0cde72b0598d0acff3ad7ba820f3b14bc9874bb9a3349ce1ff8d0fa22f8251e1afaeea4a27589291ddadb3685ca417064bfa35832cbfea755eba', FALSE),
  ('fenrir2@gmail.com', 'Fenrir Teste 2', 'Software Engineer', 'Tecnologia', 'scrypt$8354c10e74308344a37041c807ed8d9f$0aae51cce89f8de8ac0cbdc07f41eddb2e16141a729ab22f3772e653e9657543de289349996578a1b9e1e2dd9ee4c5ae86019b5bf29cce41ddc9f3de403e443f', FALSE),
  ('fenrir3@gmail.com', 'Fenrir Teste 3', 'People Analyst', 'Pessoas & Cultura', 'scrypt$04fccac1c5181837f7560683f26bf1e3$cac9f7835b7d06819f0274d397546160abb76de2ae9c0e073a099f0d3bab5f6fd45f78fd5bb698423129208e703d77068c348b37b332a354b018e75f6f0b7bb4', TRUE)
) AS source(Email, Full_Name, Job_Title, Department_Name, Password_Hash, Is_HR_Admin)
INNER JOIN public.Departments AS department ON department.Name = source.Department_Name
ON CONFLICT (Email) DO UPDATE
SET Full_Name = EXCLUDED.Full_Name,
    Job_Title = EXCLUDED.Job_Title,
    Department_Id = EXCLUDED.Department_Id,
    Password_Hash = EXCLUDED.Password_Hash,
    Is_HR_Admin = EXCLUDED.Is_HR_Admin,
    Is_Active = TRUE;

INSERT INTO public.Stage_Templates (Stage_Code, Name, Description, Display_Order, Duration_Label, Owner_Department_Id)
SELECT source.Stage_Code, source.Name, source.Description, source.Display_Order, source.Duration_Label, department.Department_Id
FROM (VALUES
  ('pre-entry', 'Pré-entrada', 'Prepare tudo antes da chegada para começar com tranquilidade.', 1, 'Antes do primeiro dia', 'Pessoas & Cultura'),
  ('first-steps', 'Primeiros passos', 'Conheça a equipe, a pessoa mentora e as orientações da função.', 2, 'Dias 1 a 5', 'Liderança'),
  ('in-progress', 'Em andamento', 'Avance nas capacitações e acompanhe sua adaptação.', 3, 'Semanas 2 a 8', 'Liderança'),
  ('completion', 'Onboarding concluído', 'Revise o progresso, compartilhe feedback e combine próximos objetivos.', 4, 'Ao final de 90 dias', 'Pessoas & Cultura')
) AS source(Stage_Code, Name, Description, Display_Order, Duration_Label, Department_Name)
INNER JOIN public.Departments AS department ON department.Name = source.Department_Name
WHERE NOT EXISTS (
  SELECT 1 FROM public.Stage_Templates AS existing WHERE existing.Stage_Code = source.Stage_Code
);

INSERT INTO public.Resource_Categories (Slug, Name)
SELECT source.Slug, source.Name
FROM (VALUES
  ('benefits', 'Benefícios'),
  ('policies', 'Políticas'),
  ('tools', 'Ferramentas'),
  ('onboarding', 'Onboarding'),
  ('finance', 'Financeiro'),
  ('culture', 'Cultura')
) AS source(Slug, Name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.Resource_Categories AS existing WHERE existing.Slug = source.Slug
);

INSERT INTO public.Task_Templates (
  Stage_Template_Id, Title, Description, Category, Task_Type, Owner_Department_Id, Owner_Role, Due_Offset_Days, Display_Order
)
SELECT stage.Stage_Template_Id, source.Title, source.Description, source.Category, source.Task_Type,
  department.Department_Id, source.Owner_Role, source.Due_Offset_Days, source.Display_Order
FROM (VALUES
  ('pre-entry', 'Notebook corporativo', 'Equipamento preparado para o primeiro dia.', 'Equipamento', 'preparation', 'Tecnologia', 'Tecnologia', 0, 1),
  ('pre-entry', 'Conta Google Workspace', 'E-mail e calendário corporativo.', 'Conta', 'preparation', 'Tecnologia', 'Tecnologia', 0, 2),
  ('pre-entry', 'Conta Slack', 'Conta criada com o e-mail corporativo.', 'Conta', 'preparation', 'Tecnologia', 'Tecnologia', 0, 3),
  ('pre-entry', 'Acesso Slack', 'Entrada nos canais internos.', 'Acesso', 'preparation', 'Tecnologia', 'Tecnologia', 2, 4),
  ('first-steps', 'Conhecer equipe e áreas', 'Explore o organograma, os papéis e os contatos da empresa.', 'Equipe', 'task', 'Liderança', 'Liderança direta', 1, 1),
  ('first-steps', 'Conversar com sua pessoa mentora', 'Conheça sua referência para dúvidas sobre a rotina e a empresa.', 'Mentoria', 'task', 'Liderança', 'Mentoria', 2, 2),
  ('first-steps', 'Acessar conteúdos essenciais', 'Consulte benefícios, políticas e orientações da sua etapa.', 'Conteúdo', 'task', 'Pessoas & Cultura', 'Pessoas & Cultura', 3, 3),
  ('first-steps', 'Iniciar a trilha do seu cargo', 'Veja os treinamentos recomendados e organize seu aprendizado.', 'Capacitação', 'training', 'Liderança', 'Liderança direta', 4, 4),
  ('first-steps', 'Fazer o check-in da primeira semana', 'Registre como está sua adaptação e se precisa de suporte.', 'Check-in', 'checkin', 'Pessoas & Cultura', 'Pessoas & Cultura', 5, 5),
  ('in-progress', 'Avançar na trilha de capacitação', 'Retome os cursos da sua função e acompanhe o que falta.', 'Capacitação', 'training', 'Liderança', 'Liderança direta', 14, 1),
  ('in-progress', 'Registrar check-in de adaptação', 'Compartilhe dúvidas, dificuldades e o suporte de que precisa.', 'Check-in', 'checkin', 'Pessoas & Cultura', 'Pessoas & Cultura', 21, 2),
  ('in-progress', 'Realizar avaliação dos treinamentos', 'Valide o que aprendeu nos conteúdos obrigatórios.', 'Avaliação', 'training', 'Pessoas & Cultura', 'Pessoas & Cultura', 30, 3),
  ('in-progress', 'Revisar seu progresso com a liderança', 'Converse sobre expectativas, entregas e pontos de apoio.', 'Acompanhamento', 'task', 'Liderança', 'Liderança direta', 30, 4),
  ('in-progress', 'Pedir ajuda sobre dúvidas pendentes', 'Direcione cada pergunta à pessoa responsável pelo assunto.', 'Suporte', 'task', 'Pessoas & Cultura', 'Responsável pelo assunto', 30, 5),
  ('in-progress', 'Concluir uma entrega acompanhada', 'Receba feedback e combine os próximos passos.', 'Entrega', 'task', 'Liderança', 'Liderança direta', 45, 6),
  ('completion', 'Revisar sua trilha e resultados', 'Confira cursos concluídos, avaliações e itens que faltam.', 'Capacitação', 'training', 'Liderança', 'Liderança direta', 75, 1),
  ('completion', 'Fazer a conversa de fechamento dos 90 dias', 'Revise adaptação, aprendizados e próximos passos.', 'Check-in', 'checkin', 'Liderança', 'Liderança direta', 85, 2),
  ('completion', 'Enviar feedback sobre o onboarding', 'Conte o que funcionou e o que podemos melhorar.', 'Feedback', 'checkin', 'Pessoas & Cultura', 'Pessoas & Cultura', 88, 3),
  ('completion', 'Definir objetivos do próximo ciclo', 'Combine metas de desenvolvimento com sua liderança.', 'Desenvolvimento', 'task', 'Liderança', 'Liderança direta', 90, 4),
  ('completion', 'Consultar próximos conteúdos e responsáveis', 'Acesse materiais, contatos e treinamentos recomendados.', 'Conteúdo', 'task', 'Pessoas & Cultura', 'Pessoas & Cultura', 90, 5)
) AS source(Stage_Code, Title, Description, Category, Task_Type, Department_Name, Owner_Role, Due_Offset_Days, Display_Order)
INNER JOIN public.Stage_Templates AS stage ON stage.Stage_Code = source.Stage_Code
INNER JOIN public.Departments AS department ON department.Name = source.Department_Name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.Task_Templates AS existing
  WHERE existing.Stage_Template_Id = stage.Stage_Template_Id AND existing.Title = source.Title
);
