ALTER TABLE public.employee_plan_tasks
  ADD COLUMN IF NOT EXISTS responsible_department_ids INT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.hr_task_preset_tasks
  ADD COLUMN IF NOT EXISTS responsible_department_ids INT[] NOT NULL DEFAULT '{}';

UPDATE public.employee_plan_tasks
SET responsible_department_ids = ARRAY[responsible_department_id]
WHERE cardinality(responsible_department_ids) = 0 AND responsible_department_id IS NOT NULL;

UPDATE public.hr_task_preset_tasks
SET responsible_department_ids = ARRAY[responsible_department_id]
WHERE cardinality(responsible_department_ids) = 0 AND responsible_department_id IS NOT NULL;
