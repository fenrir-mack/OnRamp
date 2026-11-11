BEGIN;
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
DELETE FROM public.employee_preparation_department_access WHERE employee_id IN (SELECT employee_id FROM demo_employee_ids) OR granted_by_employee_id IN (SELECT employee_id FROM demo_employee_ids);
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
COMMIT;
