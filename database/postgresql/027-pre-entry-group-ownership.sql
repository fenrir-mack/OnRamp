UPDATE public.employee_plan_tasks AS task
SET responsible_department_id = COALESCE(task.responsible_department_id, primary_department.department_id, owner.department_id)
FROM public.employees AS owner
INNER JOIN public.stage_templates AS stage ON stage.stage_code = 'pre-entry'
LEFT JOIN LATERAL (
  SELECT membership.department_id
  FROM public.employee_departments AS membership
  WHERE membership.employee_id = owner.employee_id AND membership.is_primary IS TRUE
  LIMIT 1
) AS primary_department ON TRUE
WHERE task.stage_template_id = stage.stage_template_id
  AND owner.employee_id = task.owner_employee_id
  AND task.owner_role = owner.full_name
  AND task.task_type = 'preparation';

UPDATE public.employee_plan_tasks AS task
SET owner_role = COALESCE((SELECT department.name FROM public.departments AS department WHERE department.department_id = task.responsible_department_id), task.owner_role),
  owner_employee_id = NULL, updated_at = CURRENT_TIMESTAMP
FROM public.employees AS owner
INNER JOIN public.stage_templates AS stage ON stage.stage_code = 'pre-entry'
WHERE task.stage_template_id = stage.stage_template_id
  AND owner.employee_id = task.owner_employee_id
  AND task.owner_role = owner.full_name
  AND task.task_type = 'preparation';

UPDATE public.hr_task_preset_tasks AS task
SET responsible_department_id = COALESCE(task.responsible_department_id, primary_department.department_id, owner.department_id)
FROM public.employees AS owner
INNER JOIN public.stage_templates AS stage ON stage.stage_code = 'pre-entry'
LEFT JOIN LATERAL (
  SELECT membership.department_id
  FROM public.employee_departments AS membership
  WHERE membership.employee_id = owner.employee_id AND membership.is_primary IS TRUE
  LIMIT 1
) AS primary_department ON TRUE
WHERE task.stage_template_id = stage.stage_template_id
  AND owner.employee_id = task.owner_employee_id
  AND task.owner_role = owner.full_name
  AND task.task_type = 'preparation';

UPDATE public.hr_task_preset_tasks AS task
SET owner_role = COALESCE((SELECT department.name FROM public.departments AS department WHERE department.department_id = task.responsible_department_id), task.owner_role),
  owner_employee_id = NULL
FROM public.employees AS owner
INNER JOIN public.stage_templates AS stage ON stage.stage_code = 'pre-entry'
WHERE task.stage_template_id = stage.stage_template_id
  AND owner.employee_id = task.owner_employee_id
  AND task.owner_role = owner.full_name
  AND task.task_type = 'preparation';
