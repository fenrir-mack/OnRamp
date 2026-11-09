ALTER TABLE public.employee_plan_task_progress
  DROP CONSTRAINT IF EXISTS ck_employee_plan_task_progress_status;
ALTER TABLE public.employee_plan_task_progress
  ADD CONSTRAINT ck_employee_plan_task_progress_status
  CHECK (status IN ('not_started', 'in_progress', 'waiting_third_party', 'blocked', 'ready', 'cancelled', 'not_applicable'));
