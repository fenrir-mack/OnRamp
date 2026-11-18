/* Refreshable local onboarding data for a realistic walkthrough. */
BEGIN;

-- Remove the previous generated sample set before recreating it.
CREATE TEMP TABLE demo_employee_ids ON COMMIT DROP AS
SELECT employee_id FROM public.employees WHERE email IN (
  'demo.ana@onramp.local', 'demo.rafael@onramp.local', 'demo.diego@onramp.local', 'demo.marina@onramp.local',
  'ana.martins@onramp.local', 'rafael.costa@onramp.local', 'diego.santos@onramp.local', 'marina.alves@onramp.local',
  'carolina.mendes@onramp.local', 'lucas.ferreira@onramp.local', 'beatriz.souza@onramp.local',
  'pedro.almeida@onramp.local', 'fernanda.costa@onramp.local', 'marcos.ribeiro@onramp.local',
  'andre.lima@onramp.local', 'thiago.moraes@onramp.local', 'camila.rocha@onramp.local',
  'juliana.lopes@onramp.local', 'paula.nascimento@onramp.local', 'daniela.barros@onramp.local',
  'rafaela.dias@onramp.local', 'roberto.silva@onramp.local',
  'demo.ana@senulora.com', 'demo.rafael@senulora.com', 'demo.diego@senulora.com', 'demo.marina@senulora.com',
  'ana.martins@senulora.com', 'rafael.costa@senulora.com', 'diego.santos@senulora.com', 'marina.alves@senulora.com',
  'carolina.mendes@senulora.com', 'lucas.ferreira@senulora.com', 'beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com', 'fernanda.costa@senulora.com', 'marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com', 'thiago.moraes@senulora.com', 'camila.rocha@senulora.com',
  'juliana.lopes@senulora.com', 'paula.nascimento@senulora.com', 'daniela.barros@senulora.com',
  'rafaela.dias@senulora.com', 'roberto.silva@senulora.com'
);
CREATE TEMP TABLE demo_task_ids ON COMMIT DROP AS
SELECT employee_plan_task_id FROM public.employee_plan_tasks
WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids) OR title LIKE 'DEMO |%';
CREATE TEMP TABLE demo_resource_ids ON COMMIT DROP AS
SELECT resource_id FROM public.resources
WHERE title LIKE 'DEMO |%' OR external_url LIKE 'https://example.org/onramp-demo/%';
CREATE TEMP TABLE demo_group_ids ON COMMIT DROP AS
SELECT onboarding_group_id FROM public.onboarding_groups
WHERE name LIKE 'DEMO |%' OR name = 'Turma de estágio de novembro';
CREATE TEMP TABLE demo_team_ids ON COMMIT DROP AS
SELECT team_id FROM public.teams
WHERE name LIKE 'DEMO |%'
   OR description IN (
     'Equipe fictícia de produto para a demonstração.',
     'Equipe fictícia responsável por equipamentos e acessos.',
     'Equipe fictícia de apoio à pré-entrada.',
     'Equipe de produto responsável por pesquisa, estratégia e experiência.',
     'Equipe responsável por sistemas, equipamentos e acessos.',
     'Equipe de apoio à contratação e à pré-entrada.',
     'Equipe de Pessoas & Cultura responsável por desenvolvimento e acompanhamento.',
     'Equipe financeira responsável por planejamento e operações.'
   );

DELETE FROM public.check_ins WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_support_request_messages WHERE employee_support_request_id IN (
  SELECT employee_support_request_id FROM public.employee_support_requests WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids)
);
DELETE FROM public.onboarding_feedback WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.training_enrollments WHERE onboarding_id IN (SELECT onboarding_id FROM public.onboardings WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids));
DELETE FROM public.onboarding_stages WHERE onboarding_id IN (SELECT onboarding_id FROM public.onboardings WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids));
DELETE FROM public.onboardings WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_plan_task_history WHERE employee_plan_task_id IN (SELECT employee_plan_task_id FROM demo_task_ids) OR actor_employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_plan_task_progress WHERE employee_plan_task_id IN (SELECT employee_plan_task_id FROM demo_task_ids);
DELETE FROM public.employee_plan_task_issues WHERE employee_plan_task_id IN (SELECT employee_plan_task_id FROM demo_task_ids);
DELETE FROM public.employee_plan_resources WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.employee_plan_configurations WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_plan_tasks WHERE employee_plan_task_id IN (SELECT employee_plan_task_id FROM demo_task_ids);
DELETE FROM public.employee_preparation_department_access WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_preparation_department_access WHERE granted_by_employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_support_requests WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.onboarding_group_messages WHERE onboarding_group_id IN (SELECT onboarding_group_id FROM demo_group_ids);
DELETE FROM public.onboarding_group_members WHERE onboarding_group_id IN (SELECT onboarding_group_id FROM demo_group_ids);
DELETE FROM public.onboarding_groups WHERE onboarding_group_id IN (SELECT onboarding_group_id FROM demo_group_ids);
DELETE FROM public.employee_teams WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids) OR team_id IN (SELECT team_id FROM demo_team_ids);
DELETE FROM public.team_leaders WHERE team_id IN (SELECT team_id FROM demo_team_ids) OR employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_teams
WHERE employee_id = (SELECT employee_id FROM public.employees WHERE email = 'joao.pedro@senulora.com');
DELETE FROM public.team_leaders
WHERE employee_id = (SELECT employee_id FROM public.employees WHERE email = 'joao.pedro@senulora.com');
DELETE FROM public.teams WHERE team_id IN (SELECT team_id FROM demo_team_ids);
DELETE FROM public.employee_departments WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.training_courses WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.resource_audiences WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.stage_resources WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.resources WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
UPDATE public.hr_task_preset_tasks AS task
SET owner_employee_id = admin.employee_id, owner_role = admin.full_name
FROM public.employees AS admin
WHERE task.owner_employee_id IN (SELECT employee_id FROM demo_employee_ids)
  AND admin.email = 'admin@senulora.com';
DELETE FROM public.employees WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);

-- Local onboarding accounts can log in with their email and the password "fenrir1".
INSERT INTO public.employees (email, full_name, job_title, department_id, manager_employee_id, password_hash, is_hr_admin, is_active, created_at)
SELECT sample.email, sample.full_name, sample.job_title, department.department_id,
  CASE WHEN sample.email IN ('ana.martins@senulora.com','rafael.costa@senulora.com') THEN mentor.employee_id ELSE admin.employee_id END,
  'scrypt$ad5274939831c532dde70cea2ddb59fe$8d4facf18c8f0cde72b0598d0acff3ad7ba820f3b14bc9874bb9a3349ce1ff8d0fa22f8251e1afaeea4a27589291ddadb3685ca417064bfa35832cbfea755eba',
  FALSE, TRUE, CURRENT_TIMESTAMP - sample.created_ago
FROM (VALUES
  ('ana.martins@senulora.com', 'Ana Martins', 'Estagiária de Produto', 'Produto', INTERVAL '5 days'),
  ('rafael.costa@senulora.com', 'Rafael Costa', 'Estagiário de Tecnologia', 'Tecnologia', INTERVAL '14 days'),
  ('diego.santos@senulora.com', 'Diego Santos', 'Analista de suporte de TI', 'Liderança', INTERVAL '120 days'),
  ('marina.alves@senulora.com', 'Marina Alves', 'Analista jurídica', 'Jurídico', INTERVAL '180 days'),
  ('carolina.mendes@senulora.com', 'Carolina Mendes', 'Gerente de Produto', 'Liderança', INTERVAL '240 days'),
  ('lucas.ferreira@senulora.com', 'Lucas Ferreira', 'Designer de Produto Sênior', 'Produto', INTERVAL '210 days'),
  ('beatriz.souza@senulora.com', 'Beatriz Souza', 'Analista de Produto Sênior', 'Produto', INTERVAL '190 days'),
  ('pedro.almeida@senulora.com', 'Pedro Almeida', 'Engenheiro de Software Sênior', 'Tecnologia', INTERVAL '230 days'),
  ('fernanda.costa@senulora.com', 'Fernanda Costa', 'Engenheira de Software Sênior', 'Tecnologia', INTERVAL '205 days'),
  ('marcos.ribeiro@senulora.com', 'Marcos Ribeiro', 'Tech Lead', 'Tecnologia', INTERVAL '260 days'),
  ('andre.lima@senulora.com', 'André Lima', 'Analista de TI Sênior', 'Tecnologia', INTERVAL '195 days'),
  ('thiago.moraes@senulora.com', 'Thiago Moraes', 'Engenheiro de Segurança Sênior', 'Tecnologia', INTERVAL '185 days'),
  ('camila.rocha@senulora.com', 'Camila Rocha', 'Parceira de Pessoas', 'Pessoas & Cultura', INTERVAL '170 days'),
  ('juliana.lopes@senulora.com', 'Juliana Lopes', 'Analista de Desenvolvimento Humano', 'Pessoas & Cultura', INTERVAL '150 days'),
  ('paula.nascimento@senulora.com', 'Paula Nascimento', 'Advogada Sênior', 'Jurídico', INTERVAL '220 days'),
  ('daniela.barros@senulora.com', 'Daniela Barros', 'Analista Jurídica', 'Jurídico', INTERVAL '130 days'),
  ('rafaela.dias@senulora.com', 'Rafaela Dias', 'Analista Financeira', 'Financeiro', INTERVAL '110 days'),
  ('roberto.silva@senulora.com', 'Roberto Silva', 'Gerente Financeiro', 'Financeiro', INTERVAL '250 days')
) AS sample(email, full_name, job_title, department_name, created_ago)
JOIN public.departments department ON department.name = sample.department_name
CROSS JOIN public.employees mentor
CROSS JOIN public.employees admin
WHERE mentor.email = 'joao.pedro@senulora.com' AND admin.email = 'admin@senulora.com'
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, job_title = EXCLUDED.job_title,
  department_id = EXCLUDED.department_id, manager_employee_id = EXCLUDED.manager_employee_id,
  password_hash = EXCLUDED.password_hash, is_hr_admin = FALSE, is_active = TRUE, created_at = EXCLUDED.created_at;

UPDATE public.employees AS employee
SET manager_employee_id = manager.employee_id
FROM (VALUES
  ('lucas.ferreira@senulora.com','carolina.mendes@senulora.com'),
  ('beatriz.souza@senulora.com','carolina.mendes@senulora.com'),
  ('pedro.almeida@senulora.com','marcos.ribeiro@senulora.com'),
  ('fernanda.costa@senulora.com','marcos.ribeiro@senulora.com'),
  ('marcos.ribeiro@senulora.com','diego.santos@senulora.com'),
  ('andre.lima@senulora.com','diego.santos@senulora.com'),
  ('thiago.moraes@senulora.com','diego.santos@senulora.com'),
  ('camila.rocha@senulora.com','admin@senulora.com'),
  ('juliana.lopes@senulora.com','admin@senulora.com'),
  ('paula.nascimento@senulora.com','marina.alves@senulora.com'),
  ('daniela.barros@senulora.com','marina.alves@senulora.com'),
  ('rafaela.dias@senulora.com','roberto.silva@senulora.com'),
  ('roberto.silva@senulora.com','admin@senulora.com')
) AS assignment(employee_email, manager_email)
JOIN public.employees AS manager ON manager.email = assignment.manager_email
WHERE employee.email = assignment.employee_email;

UPDATE public.employees
SET manager_employee_id = NULL
WHERE email = 'carolina.mendes@senulora.com';

UPDATE public.employees AS mentor
SET department_id = department.department_id,
    job_title = 'Mentor de Pessoas & Cultura'
FROM public.departments AS department
WHERE mentor.email = 'joao.pedro@senulora.com' AND department.name = 'Pessoas & Cultura';

INSERT INTO public.employee_departments (employee_id, department_id, is_primary, joined_at)
SELECT employee.employee_id, employee.department_id, TRUE, employee.created_at::date
FROM public.employees employee
WHERE employee.email IN (
  'ana.martins@senulora.com','rafael.costa@senulora.com','diego.santos@senulora.com','marina.alves@senulora.com',
  'carolina.mendes@senulora.com','lucas.ferreira@senulora.com','beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com','fernanda.costa@senulora.com','marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com','thiago.moraes@senulora.com','camila.rocha@senulora.com',
  'juliana.lopes@senulora.com','paula.nascimento@senulora.com','daniela.barros@senulora.com',
  'rafaela.dias@senulora.com','roberto.silva@senulora.com'
)
ON CONFLICT (employee_id, department_id) DO UPDATE SET is_primary = TRUE, joined_at = EXCLUDED.joined_at;

DELETE FROM public.employee_departments AS membership
USING public.employees AS mentor, public.departments AS department
WHERE membership.employee_id = mentor.employee_id
  AND department.department_id = membership.department_id
  AND mentor.email = 'joao.pedro@senulora.com'
  AND department.name <> 'Pessoas & Cultura';

INSERT INTO public.employee_departments (employee_id, department_id, is_primary, joined_at)
SELECT mentor.employee_id, department.department_id, TRUE, mentor.created_at::date
FROM public.employees mentor
CROSS JOIN public.departments department
WHERE mentor.email = 'joao.pedro@senulora.com' AND department.name = 'Pessoas & Cultura'
ON CONFLICT (employee_id, department_id) DO UPDATE SET is_primary = TRUE;

INSERT INTO public.teams (name, description, is_active)
VALUES ('Produto & Design', 'Equipe de produto responsável por pesquisa, estratégia e experiência.', TRUE),
       ('Tecnologia', 'Equipe responsável por sistemas, equipamentos e acessos.', TRUE),
       ('Jurídico', 'Equipe de apoio à contratação e à pré-entrada.', TRUE),
       ('Pessoas & Cultura', 'Equipe de Pessoas & Cultura responsável por desenvolvimento e acompanhamento.', TRUE),
       ('Financeiro', 'Equipe financeira responsável por planejamento e operações.', TRUE)
ON CONFLICT DO NOTHING;
INSERT INTO public.employee_teams (employee_id, team_id, team_role, is_primary, joined_at)
SELECT employee.employee_id, team.team_id, assignment.team_role,
  TRUE,
  employee.created_at::date
FROM (VALUES
  ('ana.martins@senulora.com','Produto & Design','Estagiária'),
  ('rafael.costa@senulora.com','Tecnologia','Estagiário'),
  ('diego.santos@senulora.com','Tecnologia','Líder de TI'),
  ('marina.alves@senulora.com','Jurídico','Líder do Jurídico'),
  ('joao.pedro@senulora.com','Pessoas & Cultura','Mentor'),
  ('carolina.mendes@senulora.com','Produto & Design','Gerente de Produto'),
  ('lucas.ferreira@senulora.com','Produto & Design','Designer de Produto'),
  ('beatriz.souza@senulora.com','Produto & Design','Analista de Produto'),
  ('pedro.almeida@senulora.com','Tecnologia','Engenheiro de Software'),
  ('fernanda.costa@senulora.com','Tecnologia','Engenheira de Software'),
  ('marcos.ribeiro@senulora.com','Tecnologia','Tech Lead'),
  ('andre.lima@senulora.com','Tecnologia','Analista de TI'),
  ('thiago.moraes@senulora.com','Tecnologia','Engenheiro de Segurança'),
  ('admin@senulora.com','Pessoas & Cultura','Admin de RH'),
  ('camila.rocha@senulora.com','Pessoas & Cultura','Parceira de Pessoas'),
  ('juliana.lopes@senulora.com','Pessoas & Cultura','Analista de Desenvolvimento Humano'),
  ('paula.nascimento@senulora.com','Jurídico','Advogada'),
  ('daniela.barros@senulora.com','Jurídico','Analista Jurídica'),
  ('rafaela.dias@senulora.com','Financeiro','Analista Financeira'),
  ('roberto.silva@senulora.com','Financeiro','Gerente Financeiro')
) AS assignment(email,team_name,team_role)
JOIN public.employees employee ON employee.email = assignment.email
JOIN public.teams team ON team.name = assignment.team_name
ON CONFLICT (employee_id, team_id) DO UPDATE
SET team_role = EXCLUDED.team_role, is_primary = EXCLUDED.is_primary, joined_at = EXCLUDED.joined_at;
INSERT INTO public.team_leaders (team_id, employee_id)
SELECT team.team_id, leader.employee_id FROM public.teams team CROSS JOIN public.employees leader
WHERE (team.name = 'Produto & Design' AND leader.email = 'carolina.mendes@senulora.com')
   OR (team.name = 'Tecnologia' AND leader.email = 'diego.santos@senulora.com')
   OR (team.name = 'Jurídico' AND leader.email = 'marina.alves@senulora.com')
   OR (team.name = 'Pessoas & Cultura' AND leader.email = 'admin@senulora.com')
   OR (team.name = 'Financeiro' AND leader.email = 'roberto.silva@senulora.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.employee_teams (employee_id,team_id,team_role,is_primary,joined_at)
SELECT leader.employee_id,team.team_id,'Líder',TRUE,CURRENT_DATE - 14
FROM public.team_leaders AS leader
JOIN public.teams AS team ON team.team_id = leader.team_id
JOIN public.employees AS employee ON employee.employee_id = leader.employee_id
WHERE team.name IN ('Produto & Design','Tecnologia','Jurídico','Pessoas & Cultura','Financeiro')
ON CONFLICT (employee_id,team_id) DO UPDATE SET team_role = EXCLUDED.team_role, is_primary = TRUE;

INSERT INTO public.onboardings (employee_id, mentor_employee_id, start_date, target_end_date, status)
SELECT employee.employee_id, employee.manager_employee_id, employee.created_at::date,
  employee.created_at::date + 90, 'completed'
FROM public.employees employee
WHERE employee.email IN (
  'carolina.mendes@senulora.com','lucas.ferreira@senulora.com','beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com','fernanda.costa@senulora.com','marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com','thiago.moraes@senulora.com','paula.nascimento@senulora.com','roberto.silva@senulora.com'
);

INSERT INTO public.onboardings (employee_id, mentor_employee_id, start_date, target_end_date, status)
SELECT employee.employee_id, mentor.employee_id, CURRENT_DATE - CASE employee.email
  WHEN 'ana.martins@senulora.com' THEN 5 WHEN 'rafael.costa@senulora.com' THEN 14 ELSE 42 END,
  CURRENT_DATE - CASE employee.email WHEN 'ana.martins@senulora.com' THEN -85 WHEN 'rafael.costa@senulora.com' THEN -76 ELSE -48 END,
  'active'
FROM public.employees employee CROSS JOIN public.employees mentor
WHERE employee.email IN ('ana.martins@senulora.com', 'rafael.costa@senulora.com') AND mentor.email = 'joao.pedro@senulora.com';

INSERT INTO public.onboarding_stages (onboarding_id, stage_template_id, starts_on, due_on, status)
SELECT onboarding.onboarding_id, stage.stage_template_id,
  onboarding.start_date + CASE stage.stage_code WHEN 'pre-entry' THEN -7 WHEN 'first-steps' THEN 0 WHEN 'in-progress' THEN 7 ELSE 75 END,
  onboarding.start_date + CASE stage.stage_code WHEN 'pre-entry' THEN 0 WHEN 'first-steps' THEN 7 WHEN 'in-progress' THEN 60 ELSE 90 END,
  CASE WHEN stage.stage_code = 'first-steps' AND onboarding.start_date < CURRENT_DATE - 7 THEN 'completed'
       WHEN stage.stage_code = 'in-progress' AND onboarding.start_date <= CURRENT_DATE - 7 THEN 'in_progress'
       WHEN stage.stage_code = 'pre-entry' AND onboarding.start_date <= CURRENT_DATE THEN 'completed' ELSE 'not_started' END
FROM public.onboardings onboarding JOIN public.stage_templates stage ON stage.is_active IS TRUE
JOIN public.employees employee ON employee.employee_id = onboarding.employee_id
  AND employee.email IN ('ana.martins@senulora.com','rafael.costa@senulora.com');

INSERT INTO public.onboarding_stages (onboarding_id, stage_template_id, starts_on, due_on, status, completed_at)
SELECT onboarding.onboarding_id, stage.stage_template_id,
  onboarding.start_date + CASE stage.stage_code WHEN 'pre-entry' THEN -7 WHEN 'first-steps' THEN 0 WHEN 'in-progress' THEN 7 ELSE 75 END,
  onboarding.start_date + CASE stage.stage_code WHEN 'pre-entry' THEN 0 WHEN 'first-steps' THEN 7 WHEN 'in-progress' THEN 60 ELSE 90 END,
  'completed', onboarding.created_at + INTERVAL '95 days'
FROM public.onboardings onboarding
JOIN public.employees employee ON employee.employee_id = onboarding.employee_id
JOIN public.stage_templates stage ON stage.is_active IS TRUE
WHERE employee.email IN (
  'carolina.mendes@senulora.com','lucas.ferreira@senulora.com','beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com','fernanda.costa@senulora.com','marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com','thiago.moraes@senulora.com','paula.nascimento@senulora.com','roberto.silva@senulora.com'
);

INSERT INTO public.employee_plan_tasks
  (employee_id, stage_template_id, title, description, category, task_type, owner_role, owner_employee_id,
   responsible_department_id, due_offset_days, is_required, display_order)
SELECT employee.employee_id, stage.stage_template_id, sample.title, sample.description, sample.category, sample.task_type,
  sample.owner_role, owner.employee_id, department.department_id, sample.due_offset_days, TRUE, sample.display_order
FROM public.employees employee
CROSS JOIN (VALUES
 ('pre-entry','Preparar notebook corporativo','Notebook configurado, com os acessos essenciais para o primeiro dia.','Equipamento','preparation','Tecnologia',0,1),
 ('pre-entry','Criar contas e acessos','E-mail, calendário e ferramentas internas prontos para a chegada.','Contas e acessos','preparation','Tecnologia',0,2),
  ('pre-entry','Revisar documentos de admissão','Conferir documentação e orientar a pessoa sobre os próximos passos.','Jurídico','preparation','Jurídico',-2,3),
  ('first-steps','Conhecer a equipe e os produtos','Apresentação às pessoas parceiras e aos principais fluxos de trabalho.','Equipe','task','Produto',2,1),
 ('first-steps','Fazer treinamento de segurança','Concluir a introdução à segurança da informação.','Capacitação','training','Pessoas & Cultura',4,2),
 ('first-steps','Check-in da primeira semana','Compartilhar como está a adaptação e se precisa de apoio.','Check-in','checkin','Pessoas & Cultura',5,3),
  ('in-progress','Conversa de acompanhamento','Alinhar expectativas, dúvidas e prioridades com a liderança.','Acompanhamento','task','Produto',21,1),
 ('in-progress','Trilha de ferramentas da equipe','Conhecer os processos e as ferramentas específicas da função.','Capacitação','training','Tecnologia',30,2),
 ('in-progress','Check-in de 30 dias','Registrar aprendizados, dificuldades e próximos passos.','Check-in','checkin','Pessoas & Cultura',30,3),
 ('completion','Revisar jornada de 90 dias','Revisar entregas, aprendizados e objetivos do próximo ciclo.','Acompanhamento','task','Liderança',85,1),
 ('completion','Enviar feedback do onboarding','Compartilhar sugestões para melhorar a experiência de novas pessoas.','Feedback','checkin','Pessoas & Cultura',88,2)
) AS sample(stage_code,title,description,category,task_type,owner_role,due_offset_days,display_order)
JOIN public.stage_templates stage ON stage.stage_code = sample.stage_code
JOIN public.departments department ON department.name = sample.owner_role
LEFT JOIN public.employees owner ON owner.email = CASE sample.owner_role
  WHEN 'Tecnologia' THEN 'diego.santos@senulora.com' WHEN 'Jurídico' THEN 'marina.alves@senulora.com'
  WHEN 'Produto' THEN 'carolina.mendes@senulora.com' ELSE 'admin@senulora.com' END
WHERE employee.email IN ('ana.martins@senulora.com', 'rafael.costa@senulora.com');

INSERT INTO public.employee_plan_tasks
  (employee_id, stage_template_id, title, description, category, task_type, owner_role, owner_employee_id,
   responsible_department_id, due_offset_days, is_required, display_order)
SELECT employee.employee_id, stage.stage_template_id, sample.title, sample.description, sample.category,
  sample.task_type, COALESCE(manager.full_name, employee.full_name),
  COALESCE(manager.employee_id, employee.employee_id), COALESCE(manager.department_id, employee.department_id),
  sample.due_offset_days, TRUE, sample.display_order
FROM public.employees employee
LEFT JOIN public.employees manager ON manager.employee_id = employee.manager_employee_id
CROSS JOIN (VALUES
  ('first-steps','Alinhar prioridades estratégicas da área','Revisar os principais objetivos, decisões e desafios da equipe com a liderança.','Liderança','task',2,1),
  ('first-steps','Mapear pessoas parceiras e fluxos de decisão','Identificar as áreas parceiras, pontos de contato e fóruns importantes para a função.','Integração','task',4,2),
  ('in-progress','Definir objetivos para os primeiros 90 dias','Registrar resultados esperados e indicadores de sucesso para o primeiro ciclo.','Desenvolvimento','task',14,1),
  ('in-progress','Revisar indicadores e prioridades da equipe','Alinhar métricas, entregas e oportunidades de melhoria com a liderança.','Planejamento','task',30,2),
  ('in-progress','Realizar conversa de acompanhamento de 30 dias','Compartilhar aprendizados, dúvidas e necessidades de apoio.','Acompanhamento','checkin',30,3),
  ('completion','Revisar resultados e próximos objetivos','Fechar a integração e combinar o próximo ciclo de desenvolvimento.','Acompanhamento','task',85,1)
) AS sample(stage_code,title,description,category,task_type,due_offset_days,display_order)
JOIN public.stage_templates stage ON stage.stage_code = sample.stage_code
WHERE employee.email IN (
  'carolina.mendes@senulora.com','lucas.ferreira@senulora.com','beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com','fernanda.costa@senulora.com','marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com','thiago.moraes@senulora.com','paula.nascimento@senulora.com','roberto.silva@senulora.com'
);

INSERT INTO public.employee_plan_configurations (employee_id)
SELECT employee_id FROM public.employees WHERE email IN ('ana.martins@senulora.com', 'rafael.costa@senulora.com')
ON CONFLICT (employee_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.employee_plan_configurations (employee_id)
SELECT employee_id FROM public.employees WHERE email IN (
  'carolina.mendes@senulora.com','lucas.ferreira@senulora.com','beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com','fernanda.costa@senulora.com','marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com','thiago.moraes@senulora.com','paula.nascimento@senulora.com','roberto.silva@senulora.com'
)
ON CONFLICT (employee_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.employee_plan_task_progress (employee_plan_task_id, employee_id, is_completed, status, completed_at, updated_by_employee_id)
SELECT task.employee_plan_task_id, task.employee_id,
  CASE WHEN task.title LIKE '%Conhecer a equipe%' OR task.title LIKE '%segurança%' OR (task.title LIKE '%notebook%' AND employee.email <> 'ana.martins@senulora.com') THEN TRUE ELSE FALSE END,
  CASE WHEN task.title LIKE '%Conhecer a equipe%' OR task.title LIKE '%segurança%' OR (task.title LIKE '%notebook%' AND employee.email <> 'ana.martins@senulora.com') THEN 'ready'
       WHEN task.title LIKE '%contas e acessos%' THEN 'in_progress'
       WHEN task.due_offset_days < 0 AND employee.email = 'ana.martins@senulora.com' THEN 'blocked' ELSE 'not_started' END,
  CASE WHEN task.title LIKE '%Conhecer a equipe%' OR task.title LIKE '%segurança%' OR (task.title LIKE '%notebook%' AND employee.email <> 'ana.martins@senulora.com') THEN CURRENT_TIMESTAMP - INTERVAL '2 days' END,
  actor.employee_id
FROM public.employee_plan_tasks task JOIN public.employees employee ON employee.employee_id = task.employee_id
CROSS JOIN public.employees actor WHERE employee.email IN ('ana.martins@senulora.com', 'rafael.costa@senulora.com') AND actor.email = 'admin@senulora.com';

INSERT INTO public.employee_plan_task_progress
  (employee_plan_task_id, employee_id, is_completed, status, completed_at, updated_by_employee_id)
SELECT task.employee_plan_task_id, task.employee_id, TRUE, 'ready', CURRENT_TIMESTAMP - INTERVAL '15 days', admin.employee_id
FROM public.employee_plan_tasks task
JOIN public.employees employee ON employee.employee_id = task.employee_id
CROSS JOIN public.employees admin
WHERE employee.email IN (
  'carolina.mendes@senulora.com','lucas.ferreira@senulora.com','beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com','fernanda.costa@senulora.com','marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com','thiago.moraes@senulora.com','paula.nascimento@senulora.com','roberto.silva@senulora.com'
) AND admin.email = 'admin@senulora.com';

INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value, comment)
SELECT task.employee_plan_task_id, actor.employee_id, 'status_changed', progress.status, 'Atualização de exemplo para apresentação.'
FROM public.employee_plan_tasks task
JOIN public.employee_plan_task_progress progress USING (employee_plan_task_id)
JOIN public.employees owner ON owner.employee_id = task.employee_id
CROSS JOIN public.employees actor
WHERE owner.email IN ('ana.martins@senulora.com', 'rafael.costa@senulora.com') AND actor.email = 'admin@senulora.com';

INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value, comment)
SELECT task.employee_plan_task_id, admin.employee_id, 'status_changed', 'ready',
  'Tarefa concluída durante a integração da pessoa sênior.'
FROM public.employee_plan_tasks task
JOIN public.employees employee ON employee.employee_id = task.employee_id
CROSS JOIN public.employees admin
WHERE employee.email IN (
  'carolina.mendes@senulora.com','lucas.ferreira@senulora.com','beatriz.souza@senulora.com',
  'pedro.almeida@senulora.com','fernanda.costa@senulora.com','marcos.ribeiro@senulora.com',
  'andre.lima@senulora.com','thiago.moraes@senulora.com','paula.nascimento@senulora.com','roberto.silva@senulora.com'
) AND admin.email = 'admin@senulora.com';

INSERT INTO public.employee_preparation_department_access (employee_id, department_id, granted_by_employee_id)
SELECT employee.employee_id, department.department_id, admin.employee_id
FROM (VALUES ('diego.santos@senulora.com','Tecnologia'),('marina.alves@senulora.com','Jurídico')) AS assignment(email, department_name)
JOIN public.employees employee ON employee.email = assignment.email
JOIN public.departments department ON department.name = assignment.department_name
CROSS JOIN public.employees admin
WHERE admin.email = 'admin@senulora.com'
ON CONFLICT (employee_id, department_id) DO UPDATE SET granted_by_employee_id = EXCLUDED.granted_by_employee_id;

UPDATE public.hr_task_preset_tasks AS task
SET owner_employee_id = responsible.employee_id,
    owner_role = responsible.full_name,
    responsible_department_id = department.department_id,
    responsible_department_ids = ARRAY[department.department_id]
FROM public.hr_task_presets AS preset
CROSS JOIN public.employees AS responsible
CROSS JOIN public.departments AS department
WHERE task.hr_task_preset_id = preset.hr_task_preset_id
  AND task.task_type = 'preparation'
  AND ((task.category IN ('TI','Equipamento') AND responsible.email = 'diego.santos@senulora.com' AND department.name = 'Tecnologia')
    OR (task.category = 'Jurídico' AND responsible.email = 'marina.alves@senulora.com' AND department.name = 'Jurídico'));

UPDATE public.hr_task_preset_tasks AS task
SET owner_employee_id = responsible.employee_id,
    owner_role = responsible.full_name,
    responsible_department_id = department.department_id,
    responsible_department_ids = ARRAY[department.department_id]
FROM public.hr_task_presets AS preset
JOIN (VALUES
  ('Primeira semana com a equipe','Apresentar a equipe e a rotina','carolina.mendes@senulora.com','Produto'),
  ('Primeira semana com a equipe','Fazer a conversa inicial de mentoria','joao.pedro@senulora.com','Pessoas & Cultura'),
  ('Trilha inicial de Produto','Conhecer o portfólio e o roadmap','carolina.mendes@senulora.com','Produto'),
  ('Trilha inicial de Produto','Acompanhar uma conversa de descoberta','carolina.mendes@senulora.com','Produto'),
  ('Trilha inicial de Produto','Planejar uma primeira contribuição','carolina.mendes@senulora.com','Produto'),
  ('Trilha inicial de Tecnologia','Configurar o ambiente de desenvolvimento','diego.santos@senulora.com','Tecnologia'),
  ('Trilha inicial de Tecnologia','Conhecer o fluxo de código e revisão','marcos.ribeiro@senulora.com','Tecnologia'),
  ('Trilha inicial de Tecnologia','Realizar uma primeira entrega acompanhada','marcos.ribeiro@senulora.com','Tecnologia'),
  ('Check-ins e primeiros objetivos','Revisar prioridades do primeiro mês','carolina.mendes@senulora.com','Produto')
) AS assignment(preset_name,title,owner_email,department_name) ON assignment.preset_name = preset.name
CROSS JOIN public.employees AS responsible
CROSS JOIN public.departments AS department
WHERE task.hr_task_preset_id = preset.hr_task_preset_id
  AND task.title = assignment.title
  AND responsible.email = assignment.owner_email
  AND department.name = assignment.department_name;

INSERT INTO public.onboarding_groups (name,group_type,description,created_by_employee_id)
SELECT 'Turma de estágio de novembro','cohort','Acompanhamento de onboarding da turma de novembro.',admin.employee_id
FROM public.employees admin WHERE admin.email = 'admin@senulora.com';
INSERT INTO public.onboarding_group_members (onboarding_group_id,employee_id,member_role)
SELECT group_row.onboarding_group_id,employee.employee_id,
  CASE employee.email WHEN 'admin@senulora.com' THEN 'owner' WHEN 'joao.pedro@senulora.com' THEN 'moderator' ELSE 'member' END
FROM public.onboarding_groups group_row CROSS JOIN public.employees employee
WHERE group_row.name = 'Turma de estágio de novembro'
  AND employee.email IN ('admin@senulora.com','joao.pedro@senulora.com','ana.martins@senulora.com','rafael.costa@senulora.com');
INSERT INTO public.onboarding_group_messages (onboarding_group_id,sender_employee_id,message,sent_at)
SELECT group_row.onboarding_group_id,mentor.employee_id,'Bem-vindos! Aqui ficam os avisos e dúvidas da turma de estágio.',CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM public.onboarding_groups group_row CROSS JOIN public.employees mentor
WHERE group_row.name = 'Turma de estágio de novembro' AND mentor.email = 'joao.pedro@senulora.com';

INSERT INTO public.check_ins (employee_id,employee_plan_task_id,feeling,comment,needs_support,follow_up_status,difficulties,support_request,submitted_at)
SELECT employee.employee_id,task.employee_plan_task_id,
  CASE employee.email WHEN 'ana.martins@senulora.com' THEN 'neutral' WHEN 'rafael.costa@senulora.com' THEN 'good' ELSE 'great' END,
  CASE employee.email WHEN 'ana.martins@senulora.com' THEN 'Estou me adaptando bem e quero alinhar algumas prioridades.' ELSE 'A integração está fluindo bem; já conheci as principais pessoas do time.' END,
  employee.email='ana.martins@senulora.com', CASE WHEN employee.email='ana.martins@senulora.com' THEN 'open' ELSE 'not_needed' END,
  CASE WHEN employee.email='ana.martins@senulora.com' THEN 'Ainda tenho dúvidas sobre prioridades da primeira entrega.' END,
  CASE WHEN employee.email='ana.martins@senulora.com' THEN 'Gostaria de conversar com a liderança nesta semana.' END,
  CURRENT_TIMESTAMP - INTERVAL '1 day'
FROM public.employees employee JOIN public.employee_plan_tasks task ON task.employee_id=employee.employee_id
WHERE employee.email IN ('ana.martins@senulora.com','rafael.costa@senulora.com') AND task.title LIKE '%Check-in da primeira semana%';

INSERT INTO public.employee_check_in_chats (check_in_id,started_by_employee_id,created_at)
SELECT check_in.check_in_id,admin.employee_id,check_in.submitted_at + INTERVAL '2 hours'
FROM public.check_ins check_in JOIN public.employees employee ON employee.employee_id = check_in.employee_id
CROSS JOIN public.employees admin
WHERE employee.email = 'ana.martins@senulora.com' AND admin.email = 'admin@senulora.com';
INSERT INTO public.employee_check_in_chat_messages (check_in_id,sender_employee_id,body,sent_at)
SELECT chat.check_in_id,sender.employee_id,message.body,message.sent_at
FROM public.employee_check_in_chats chat
JOIN public.check_ins check_in ON check_in.check_in_id = chat.check_in_id
JOIN public.employees intern ON intern.employee_id = check_in.employee_id
CROSS JOIN public.employees sender
CROSS JOIN (VALUES
  ('admin@senulora.com','Vamos marcar uma conversa para alinhar suas prioridades desta semana.',CURRENT_TIMESTAMP - INTERVAL '10 hours'),
  ('ana.martins@senulora.com','Ótimo, também queria confirmar a documentação da pré-entrada.',CURRENT_TIMESTAMP - INTERVAL '8 hours')
) AS message(email,body,sent_at)
WHERE intern.email = 'ana.martins@senulora.com' AND sender.email = message.email;

INSERT INTO public.onboarding_feedback (onboarding_id,employee_id,rating,what_went_well,what_to_improve,submitted_at)
SELECT onboarding.onboarding_id,employee.employee_id,5,'A agenda e as conversas com a equipe ajudaram bastante.','Compartilhar as prioridades do primeiro mês um pouco antes.',CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM public.onboardings onboarding JOIN public.employees employee ON employee.employee_id=onboarding.employee_id
WHERE employee.email='rafael.costa@senulora.com';

INSERT INTO public.employee_support_requests (employee_id,category,subject,description,status,handled_by_employee_id,follow_up_note,submitted_at)
SELECT employee.employee_id,sample.category,sample.subject,sample.description,sample.status,hr.employee_id,sample.note,CURRENT_TIMESTAMP-sample.age
FROM (VALUES
 ('ana.martins@senulora.com','question','Dúvida sobre prioridades','Como posso confirmar quais entregas são mais importantes nesta primeira semana?','open',NULL,INTERVAL '1 day'),
 ('rafael.costa@senulora.com','support','Acesso ao ambiente de desenvolvimento','O acesso já foi solicitado e está aguardando aprovação.','in_progress','A equipe de TI está acompanhando a solicitação.',INTERVAL '3 days')
) sample(email,category,subject,description,status,note,age)
JOIN public.employees employee ON employee.email=sample.email CROSS JOIN public.employees hr WHERE hr.email='admin@senulora.com';

INSERT INTO public.employee_support_request_messages (employee_support_request_id,sender_employee_id,body,sent_at)
SELECT request.employee_support_request_id,sender.employee_id,message.body,CURRENT_TIMESTAMP - INTERVAL '6 hours'
FROM public.employee_support_requests request
JOIN public.employees employee ON employee.employee_id = request.employee_id
CROSS JOIN public.employees sender
CROSS JOIN (VALUES ('ana.martins@senulora.com','Minha dúvida principal é sobre quais documentos preciso enviar antes do primeiro dia.'),
                   ('admin@senulora.com','Vou confirmar a lista com o Jurídico e retorno por aqui.')) AS message(email,body)
WHERE request.subject = 'Dúvida sobre prioridades' AND sender.email = message.email;

WITH demo_issue AS (
  INSERT INTO public.employee_plan_task_issues (employee_plan_task_id,employee_id,description,status,created_at)
  SELECT task.employee_plan_task_id,employee.employee_id,
    'A lista de documentos ainda precisa de confirmação antes da data de início.','in_review',CURRENT_TIMESTAMP - INTERVAL '1 day'
  FROM public.employee_plan_tasks task JOIN public.employees employee ON employee.employee_id = task.employee_id
  WHERE employee.email = 'ana.martins@senulora.com' AND task.title = 'Revisar documentos de admissão'
  RETURNING employee_plan_task_issue_id,created_at,employee_id
), demo_conversation AS (
  INSERT INTO public.employee_plan_task_issue_conversations (employee_plan_task_issue_id,status,created_at,updated_at,last_message_at)
  SELECT employee_plan_task_issue_id,'open',created_at,created_at,created_at FROM demo_issue
  RETURNING employee_plan_task_issue_conversation_id,employee_plan_task_issue_id
)
INSERT INTO public.employee_plan_task_issue_messages (employee_plan_task_issue_conversation_id,sender_employee_id,body,sent_at)
SELECT conversation.employee_plan_task_issue_conversation_id,issue.employee_id,
  'Estou aguardando a confirmação dos documentos necessários para concluir esta etapa.',issue.created_at
FROM demo_conversation conversation JOIN demo_issue issue USING (employee_plan_task_issue_id);

INSERT INTO public.employee_plan_task_issue_messages (employee_plan_task_issue_conversation_id,sender_employee_id,body,sent_at)
SELECT conversation.employee_plan_task_issue_conversation_id,legal.employee_id,
  'Recebi a solicitação. Vou revisar a lista e orientar a equipe de RH.',conversation.created_at + INTERVAL '2 hours'
FROM public.employee_plan_task_issue_conversations conversation
JOIN public.employee_plan_task_issues issue USING (employee_plan_task_issue_id)
JOIN public.employee_plan_tasks task USING (employee_plan_task_id)
JOIN public.employees intern ON intern.employee_id = issue.employee_id
CROSS JOIN public.employees legal
WHERE intern.email = 'ana.martins@senulora.com' AND task.title = 'Revisar documentos de admissão'
  AND legal.email = 'marina.alves@senulora.com';

COMMIT;
