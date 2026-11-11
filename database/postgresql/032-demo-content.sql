/* Refreshable fictional activity for a local walkthrough. No chat rows are created. */
BEGIN;

-- Remove the previous generated sample set before recreating it.
CREATE TEMP TABLE demo_employee_ids ON COMMIT DROP AS
SELECT employee_id FROM public.employees WHERE email LIKE 'demo.%@onramp.local';
CREATE TEMP TABLE demo_task_ids ON COMMIT DROP AS
SELECT employee_plan_task_id FROM public.employee_plan_tasks WHERE title LIKE 'DEMO |%';
CREATE TEMP TABLE demo_resource_ids ON COMMIT DROP AS
SELECT resource_id FROM public.resources WHERE title LIKE 'DEMO |%';

DELETE FROM public.check_ins WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
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
DELETE FROM public.employee_teams WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids) OR team_id IN (SELECT team_id FROM public.teams WHERE name LIKE 'DEMO |%');
DELETE FROM public.team_leaders WHERE team_id IN (SELECT team_id FROM public.teams WHERE name LIKE 'DEMO |%') OR employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.teams WHERE name LIKE 'DEMO |%';
DELETE FROM public.employee_departments WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.training_courses WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.resource_audiences WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.stage_resources WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.resources WHERE resource_id IN (SELECT resource_id FROM demo_resource_ids);
DELETE FROM public.employees WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);

-- Demo-only hires can log in with their email and the password "fenrir1".
INSERT INTO public.employees (email, full_name, job_title, department_id, manager_employee_id, password_hash, is_hr_admin, is_active, created_at)
SELECT sample.email, sample.full_name, sample.job_title, department.department_id, hr.employee_id,
  'scrypt$ad5274939831c532dde70cea2ddb59fe$8d4facf18c8f0cde72b0598d0acff3ad7ba820f3b14bc9874bb9a3349ce1ff8d0fa22f8251e1afaeea4a27589291ddadb3685ca417064bfa35832cbfea755eba',
  FALSE, TRUE, CURRENT_TIMESTAMP - sample.created_ago
FROM (VALUES
  ('demo.ana@onramp.local', 'Ana Martins', 'Product Designer', 'Produto', INTERVAL '5 days'),
  ('demo.rafael@onramp.local', 'Rafael Costa', 'Software Engineer', 'Tecnologia', INTERVAL '14 days'),
  ('demo.camila@onramp.local', 'Camila Souza', 'People Analyst', 'Pessoas & Cultura', INTERVAL '42 days')
) AS sample(email, full_name, job_title, department_name, created_ago)
JOIN public.departments department ON department.name = sample.department_name
CROSS JOIN public.employees hr
WHERE hr.email = 'fenrir3@gmail.com'
ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, job_title = EXCLUDED.job_title,
  department_id = EXCLUDED.department_id, manager_employee_id = EXCLUDED.manager_employee_id,
  password_hash = EXCLUDED.password_hash, is_hr_admin = FALSE, is_active = TRUE, created_at = EXCLUDED.created_at;

INSERT INTO public.employee_departments (employee_id, department_id, is_primary, joined_at)
SELECT employee.employee_id, employee.department_id, TRUE, CURRENT_DATE - CASE employee.email
  WHEN 'demo.ana@onramp.local' THEN 5 WHEN 'demo.rafael@onramp.local' THEN 14 ELSE 42 END
FROM public.employees employee WHERE employee.email LIKE 'demo.%@onramp.local'
ON CONFLICT (employee_id, department_id) DO UPDATE SET is_primary = TRUE;

INSERT INTO public.teams (name, description, is_active)
VALUES ('DEMO | Produto & Design', 'Equipe fictícia de produto para a demonstração.', TRUE),
       ('DEMO | Engenharia', 'Equipe fictícia de engenharia para a demonstração.', TRUE)
ON CONFLICT DO NOTHING;
INSERT INTO public.employee_teams (employee_id, team_id, team_role, is_primary, joined_at)
SELECT employee.employee_id, team.team_id, CASE WHEN employee.email = 'demo.ana@onramp.local' THEN 'Designer' ELSE 'Pessoa colaboradora' END,
  TRUE, CURRENT_DATE - 14
FROM public.employees employee JOIN public.teams team ON
  (employee.email = 'demo.ana@onramp.local' AND team.name = 'DEMO | Produto & Design') OR
  (employee.email = 'demo.rafael@onramp.local' AND team.name = 'DEMO | Engenharia')
ON CONFLICT (employee_id, team_id) DO NOTHING;
INSERT INTO public.team_leaders (team_id, employee_id)
SELECT team.team_id, hr.employee_id FROM public.teams team CROSS JOIN public.employees hr
WHERE team.name IN ('DEMO | Produto & Design', 'DEMO | Engenharia') AND hr.email = 'fenrir3@gmail.com'
ON CONFLICT DO NOTHING;

INSERT INTO public.onboardings (employee_id, mentor_employee_id, start_date, target_end_date, status)
SELECT employee.employee_id, mentor.employee_id, CURRENT_DATE - CASE employee.email
  WHEN 'demo.ana@onramp.local' THEN 5 WHEN 'demo.rafael@onramp.local' THEN 14 ELSE 42 END,
  CURRENT_DATE - CASE employee.email WHEN 'demo.ana@onramp.local' THEN -85 WHEN 'demo.rafael@onramp.local' THEN -76 ELSE -48 END,
  'active'
FROM public.employees employee CROSS JOIN public.employees mentor
WHERE employee.email LIKE 'demo.%@onramp.local' AND mentor.email = 'fenrir2@gmail.com';

INSERT INTO public.onboarding_stages (onboarding_id, stage_template_id, starts_on, due_on, status)
SELECT onboarding.onboarding_id, stage.stage_template_id,
  onboarding.start_date + CASE stage.stage_code WHEN 'pre-entry' THEN -7 WHEN 'first-steps' THEN 0 WHEN 'in-progress' THEN 7 ELSE 75 END,
  onboarding.start_date + CASE stage.stage_code WHEN 'pre-entry' THEN 0 WHEN 'first-steps' THEN 7 WHEN 'in-progress' THEN 60 ELSE 90 END,
  CASE WHEN stage.stage_code = 'first-steps' AND onboarding.start_date < CURRENT_DATE - 7 THEN 'completed'
       WHEN stage.stage_code = 'in-progress' AND onboarding.start_date <= CURRENT_DATE - 7 THEN 'in_progress'
       WHEN stage.stage_code = 'pre-entry' AND onboarding.start_date <= CURRENT_DATE THEN 'completed' ELSE 'not_started' END
FROM public.onboardings onboarding JOIN public.stage_templates stage ON stage.is_active IS TRUE
JOIN public.employees employee ON employee.employee_id = onboarding.employee_id AND employee.email LIKE 'demo.%@onramp.local';

INSERT INTO public.employee_plan_tasks
  (employee_id, stage_template_id, title, description, category, task_type, owner_role, owner_employee_id,
   responsible_department_id, due_offset_days, is_required, display_order)
SELECT employee.employee_id, stage.stage_template_id, sample.title, sample.description, sample.category, sample.task_type,
  sample.owner_role, owner.employee_id, department.department_id, sample.due_offset_days, TRUE, sample.display_order
FROM public.employees employee
CROSS JOIN (VALUES
 ('pre-entry','DEMO | Preparar notebook corporativo','Notebook configurado, com os acessos essenciais para o primeiro dia.','Equipamento','preparation','Tecnologia',0,1),
 ('pre-entry','DEMO | Criar contas e acessos','E-mail, calendário e ferramentas internas prontos para a chegada.','Contas e acessos','preparation','Tecnologia',0,2),
 ('pre-entry','DEMO | Revisar documentos de admissão','Conferir documentação e orientar a pessoa sobre os próximos passos.','Jurídico','preparation','Pessoas & Cultura',-2,3),
 ('first-steps','DEMO | Conhecer a equipe e os produtos','Apresentação às pessoas parceiras e aos principais fluxos de trabalho.','Equipe','task','Liderança',2,1),
 ('first-steps','DEMO | Fazer treinamento de segurança','Concluir a introdução à segurança da informação.','Capacitação','training','Pessoas & Cultura',4,2),
 ('first-steps','DEMO | Check-in da primeira semana','Compartilhar como está a adaptação e se precisa de apoio.','Check-in','checkin','Pessoas & Cultura',5,3),
 ('in-progress','DEMO | Conversa de acompanhamento','Alinhar expectativas, dúvidas e prioridades com a liderança.','Acompanhamento','task','Liderança',21,1),
 ('in-progress','DEMO | Trilha de ferramentas da equipe','Conhecer os processos e as ferramentas específicas da função.','Capacitação','training','Tecnologia',30,2),
 ('in-progress','DEMO | Check-in de 30 dias','Registrar aprendizados, dificuldades e próximos passos.','Check-in','checkin','Pessoas & Cultura',30,3),
 ('completion','DEMO | Revisar jornada de 90 dias','Revisar entregas, aprendizados e objetivos do próximo ciclo.','Acompanhamento','task','Liderança',85,1),
 ('completion','DEMO | Enviar feedback do onboarding','Compartilhar sugestões para melhorar a experiência de novas pessoas.','Feedback','checkin','Pessoas & Cultura',88,2)
) AS sample(stage_code,title,description,category,task_type,owner_role,due_offset_days,display_order)
JOIN public.stage_templates stage ON stage.stage_code = sample.stage_code
JOIN public.departments department ON department.name = sample.owner_role
LEFT JOIN public.employees owner ON owner.email = CASE sample.owner_role WHEN 'Tecnologia' THEN 'fenrir2@gmail.com' ELSE 'fenrir3@gmail.com' END
WHERE employee.email LIKE 'demo.%@onramp.local';

INSERT INTO public.employee_plan_configurations (employee_id)
SELECT employee_id FROM public.employees WHERE email LIKE 'demo.%@onramp.local'
ON CONFLICT (employee_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.employee_plan_task_progress (employee_plan_task_id, employee_id, is_completed, status, completed_at, updated_by_employee_id)
SELECT task.employee_plan_task_id, task.employee_id,
  CASE WHEN task.title LIKE '%Conhecer a equipe%' OR task.title LIKE '%segurança%' OR (task.title LIKE '%notebook%' AND employee.email <> 'demo.ana@onramp.local') THEN TRUE ELSE FALSE END,
  CASE WHEN task.title LIKE '%Conhecer a equipe%' OR task.title LIKE '%segurança%' OR (task.title LIKE '%notebook%' AND employee.email <> 'demo.ana@onramp.local') THEN 'ready'
       WHEN task.title LIKE '%contas e acessos%' THEN 'in_progress'
       WHEN task.due_offset_days < 0 AND employee.email = 'demo.ana@onramp.local' THEN 'blocked' ELSE 'not_started' END,
  CASE WHEN task.title LIKE '%Conhecer a equipe%' OR task.title LIKE '%segurança%' OR (task.title LIKE '%notebook%' AND employee.email <> 'demo.ana@onramp.local') THEN CURRENT_TIMESTAMP - INTERVAL '2 days' END,
  hr.employee_id
FROM public.employee_plan_tasks task JOIN public.employees employee ON employee.employee_id = task.employee_id
CROSS JOIN public.employees hr WHERE task.title LIKE 'DEMO |%' AND employee.email LIKE 'demo.%@onramp.local' AND hr.email = 'fenrir3@gmail.com';

INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value, comment)
SELECT task.employee_plan_task_id, hr.employee_id, 'status_changed', progress.status, 'DEMO | Atualização de exemplo para apresentação.'
FROM public.employee_plan_tasks task JOIN public.employee_plan_task_progress progress USING (employee_plan_task_id)
CROSS JOIN public.employees hr WHERE task.title LIKE 'DEMO |%' AND hr.email = 'fenrir3@gmail.com';

INSERT INTO public.employee_preparation_department_access (employee_id, department_id, granted_by_employee_id)
SELECT hr.employee_id, department.department_id, hr.employee_id FROM public.employees hr CROSS JOIN public.departments department
WHERE hr.email = 'fenrir3@gmail.com' AND department.name IN ('Tecnologia','Pessoas & Cultura')
ON CONFLICT (employee_id, department_id) DO NOTHING;

INSERT INTO public.resources (resource_category_id,title,description,format,mime_type,owner_department_id,external_url,status)
SELECT category.resource_category_id, sample.title, sample.description, 'Link', 'text/html', department.department_id,
  'https://example.org/onramp-demo/' || sample.slug, 'published'
FROM (VALUES
 ('benefits','DEMO | Guia de benefícios','Resumo fictício dos benefícios e de como consultar as regras.','guia-beneficios','Pessoas & Cultura'),
 ('policies','DEMO | Políticas de trabalho','Exemplo de políticas internas para a pessoa conhecer durante a integração.','politicas','Pessoas & Cultura'),
 ('tools','DEMO | Ferramentas do time','Links fictícios para conhecer as ferramentas usadas pela equipe.','ferramentas','Tecnologia'),
 ('onboarding','DEMO | Manual de boas-vindas','Roteiro de referência para as primeiras semanas.','manual-boas-vindas','Pessoas & Cultura'),
 ('finance','DEMO | Como pedir reembolso','Passo a passo fictício para registrar uma despesa de trabalho.','reembolso','Financeiro'),
 ('culture','DEMO | Cultura e princípios','Exemplo de material sobre colaboração e cultura da empresa.','cultura','Pessoas & Cultura')
) sample(category_slug,title,description,slug,department_name)
JOIN public.resource_categories category ON category.slug = sample.category_slug
JOIN public.departments department ON department.name = sample.department_name;

INSERT INTO public.stage_resources (stage_template_id,resource_id,is_required,display_order)
SELECT stage.stage_template_id,resource.resource_id,TRUE,row_number() OVER (PARTITION BY stage.stage_template_id ORDER BY resource.title)::smallint
FROM public.resources resource CROSS JOIN public.stage_templates stage
WHERE resource.title LIKE 'DEMO |%' AND stage.stage_code IN ('pre-entry','first-steps','in-progress');

INSERT INTO public.training_courses (resource_id,provider_name,passing_score,is_required)
SELECT resource.resource_id,'Universidade OnRamp (demonstração)',80,TRUE FROM public.resources resource
WHERE resource.title = 'DEMO | Ferramentas do time';
INSERT INTO public.training_enrollments (onboarding_id,training_course_id,status,progress_percent,started_at)
SELECT onboarding.onboarding_id,course.training_course_id,'in_progress',45,CURRENT_TIMESTAMP - INTERVAL '3 days'
FROM public.onboardings onboarding JOIN public.employees employee ON employee.employee_id=onboarding.employee_id
CROSS JOIN public.training_courses course JOIN public.resources resource ON resource.resource_id=course.resource_id
WHERE employee.email LIKE 'demo.%@onramp.local' AND resource.title='DEMO | Ferramentas do time';

INSERT INTO public.check_ins (employee_id,employee_plan_task_id,feeling,comment,needs_support,follow_up_status,difficulties,support_request,submitted_at)
SELECT employee.employee_id,task.employee_plan_task_id,
  CASE employee.email WHEN 'demo.ana@onramp.local' THEN 'neutral' WHEN 'demo.rafael@onramp.local' THEN 'good' ELSE 'great' END,
  CASE employee.email WHEN 'demo.ana@onramp.local' THEN 'Estou me adaptando bem e quero alinhar algumas prioridades.' ELSE 'A integração está fluindo bem; já conheci as principais pessoas do time.' END,
  employee.email='demo.ana@onramp.local', CASE WHEN employee.email='demo.ana@onramp.local' THEN 'open' ELSE 'not_needed' END,
  CASE WHEN employee.email='demo.ana@onramp.local' THEN 'Ainda tenho dúvidas sobre prioridades da primeira entrega.' END,
  CASE WHEN employee.email='demo.ana@onramp.local' THEN 'Gostaria de conversar com a liderança nesta semana.' END,
  CURRENT_TIMESTAMP - INTERVAL '1 day'
FROM public.employees employee JOIN public.employee_plan_tasks task ON task.employee_id=employee.employee_id
WHERE employee.email LIKE 'demo.%@onramp.local' AND task.title LIKE '%Check-in da primeira semana%';

INSERT INTO public.onboarding_feedback (onboarding_id,employee_id,rating,what_went_well,what_to_improve,submitted_at)
SELECT onboarding.onboarding_id,employee.employee_id,5,'A agenda e as conversas com a equipe ajudaram bastante.','Compartilhar as prioridades do primeiro mês um pouco antes.',CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM public.onboardings onboarding JOIN public.employees employee ON employee.employee_id=onboarding.employee_id
WHERE employee.email='demo.camila@onramp.local';

INSERT INTO public.employee_support_requests (employee_id,category,subject,description,status,handled_by_employee_id,follow_up_note,submitted_at)
SELECT employee.employee_id,sample.category,sample.subject,sample.description,sample.status,hr.employee_id,sample.note,CURRENT_TIMESTAMP-sample.age
FROM (VALUES
 ('demo.ana@onramp.local','question','DEMO | Dúvida sobre prioridades','Como posso confirmar quais entregas são mais importantes nesta primeira semana?','open',NULL,INTERVAL '1 day'),
 ('demo.rafael@onramp.local','support','DEMO | Acesso ao ambiente de desenvolvimento','O acesso já foi solicitado e está aguardando aprovação.','in_progress','A equipe de TI está acompanhando a solicitação.',INTERVAL '3 days'),
 ('demo.camila@onramp.local','question','DEMO | Orientação sobre benefícios','Gostaria de saber onde consultar os detalhes dos benefícios.','resolved','Orientação enviada e material indicado na biblioteca.',INTERVAL '7 days')
) sample(email,category,subject,description,status,note,age)
JOIN public.employees employee ON employee.email=sample.email CROSS JOIN public.employees hr WHERE hr.email='fenrir3@gmail.com';

COMMIT;
