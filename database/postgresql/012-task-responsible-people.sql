ALTER TABLE public.Employee_Plan_Tasks
  ADD COLUMN IF NOT EXISTS Owner_Employee_Id INT NULL
    REFERENCES public.Employees (Employee_Id);

ALTER TABLE public.Hr_Task_Preset_Tasks
  ADD COLUMN IF NOT EXISTS Owner_Employee_Id INT NULL
    REFERENCES public.Employees (Employee_Id);

UPDATE public.Employee_Plan_Tasks
SET Category = CASE Task_Type
  WHEN 'preparation' THEN 'Preparação'
  WHEN 'training' THEN 'Treinamento'
  WHEN 'checkin' THEN 'Check-in'
  ELSE 'Tarefa'
END;

UPDATE public.Hr_Task_Preset_Tasks
SET Category = CASE Task_Type
  WHEN 'preparation' THEN 'Preparação'
  WHEN 'training' THEN 'Treinamento'
  WHEN 'checkin' THEN 'Check-in'
  ELSE 'Tarefa'
END;
