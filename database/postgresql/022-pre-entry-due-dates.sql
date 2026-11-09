/* Preparation deadlines may fall before or after the employee start date. */
ALTER TABLE public.employee_plan_tasks
  DROP CONSTRAINT IF EXISTS ck_employee_plan_tasks_due_offset;
ALTER TABLE public.hr_task_preset_tasks
  DROP CONSTRAINT IF EXISTS ck_hr_task_preset_tasks_due;
ALTER TABLE public.employee_plan_tasks
  DROP CONSTRAINT IF EXISTS ck_employee_plan_tasks_due_offset_range;
ALTER TABLE public.hr_task_preset_tasks
  DROP CONSTRAINT IF EXISTS ck_hr_task_preset_tasks_due_range;

ALTER TABLE public.employee_plan_tasks
  ADD CONSTRAINT ck_employee_plan_tasks_due_offset_range
  CHECK (due_offset_days BETWEEN -32768 AND 32767);
ALTER TABLE public.hr_task_preset_tasks
  ADD CONSTRAINT ck_hr_task_preset_tasks_due_range
  CHECK (due_offset_days BETWEEN -32768 AND 32767);
