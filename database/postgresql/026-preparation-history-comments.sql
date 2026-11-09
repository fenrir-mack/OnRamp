ALTER TABLE public.employee_plan_task_history
  ADD COLUMN IF NOT EXISTS comment VARCHAR(2000) NULL;
