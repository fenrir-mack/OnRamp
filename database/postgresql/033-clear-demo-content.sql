BEGIN;
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
DELETE FROM public.employee_preparation_department_access WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids) OR granted_by_employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.employee_support_requests WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids);
DELETE FROM public.onboarding_group_messages WHERE onboarding_group_id IN (SELECT onboarding_group_id FROM demo_group_ids);
DELETE FROM public.onboarding_group_members WHERE onboarding_group_id IN (SELECT onboarding_group_id FROM demo_group_ids);
DELETE FROM public.onboarding_groups WHERE onboarding_group_id IN (SELECT onboarding_group_id FROM demo_group_ids);
DELETE FROM public.employee_teams WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids) OR team_id IN (SELECT team_id FROM demo_team_ids);
DELETE FROM public.team_leaders WHERE team_id IN (SELECT team_id FROM demo_team_ids) OR employee_id IN (SELECT employee_id FROM demo_employee_ids);
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
COMMIT;
