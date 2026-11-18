UPDATE public.task_templates AS task
SET task_type = CASE WHEN stage.stage_code = 'pre-entry' THEN 'preparation' ELSE 'task' END
FROM public.stage_templates AS stage
WHERE stage.stage_template_id = task.stage_template_id
  AND (stage.stage_code = 'pre-entry' OR task.task_type = 'preparation');

UPDATE public.hr_task_preset_tasks AS task
SET task_type = CASE WHEN stage.stage_code = 'pre-entry' THEN 'preparation' ELSE 'task' END
FROM public.stage_templates AS stage
WHERE stage.stage_template_id = task.stage_template_id
  AND (stage.stage_code = 'pre-entry' OR task.task_type = 'preparation');

UPDATE public.employee_plan_tasks AS task
SET task_type = CASE WHEN stage.stage_code = 'pre-entry' THEN 'preparation' ELSE 'task' END
FROM public.stage_templates AS stage
WHERE stage.stage_template_id = task.stage_template_id
  AND (stage.stage_code = 'pre-entry' OR task.task_type = 'preparation');

UPDATE public.task_templates AS task
SET category = CASE
  WHEN task.title ILIKE '%notebook%' OR task.title ILIKE '%periférico%' OR task.title ILIKE '%equipamento%' THEN 'Equipamento'
  WHEN task.title ILIKE '%contrato%' OR task.title ILIKE '%documento%' OR task.title ILIKE '%jurídico%' OR task.title ILIKE '%legal%' THEN 'Jurídico'
  ELSE CASE WHEN task.category IN ('Geral', 'Preparação', 'Conta', 'Acesso', 'Contas e aplicativos', 'Contas da empresa', 'Contas de programador') THEN 'TI' ELSE task.category END
END
FROM public.stage_templates AS stage
WHERE stage.stage_template_id = task.stage_template_id
  AND stage.stage_code = 'pre-entry'
  AND task.task_type = 'preparation';

UPDATE public.hr_task_preset_tasks AS task
SET category = CASE
  WHEN task.title ILIKE '%notebook%' OR task.title ILIKE '%periférico%' OR task.title ILIKE '%equipamento%' THEN 'Equipamento'
  WHEN task.title ILIKE '%contrato%' OR task.title ILIKE '%documento%' OR task.title ILIKE '%jurídico%' OR task.title ILIKE '%legal%' THEN 'Jurídico'
  ELSE CASE WHEN task.category IN ('Geral', 'Preparação', 'Conta', 'Acesso', 'Contas e aplicativos', 'Contas da empresa', 'Contas de programador') THEN 'TI' ELSE task.category END
END
FROM public.stage_templates AS stage
WHERE stage.stage_template_id = task.stage_template_id
  AND stage.stage_code = 'pre-entry'
  AND task.task_type = 'preparation';

UPDATE public.employee_plan_tasks AS task
SET category = CASE
  WHEN task.title ILIKE '%notebook%' OR task.title ILIKE '%periférico%' OR task.title ILIKE '%equipamento%' THEN 'Equipamento'
  WHEN task.title ILIKE '%contrato%' OR task.title ILIKE '%documento%' OR task.title ILIKE '%jurídico%' OR task.title ILIKE '%legal%' THEN 'Jurídico'
  ELSE CASE WHEN task.category IN ('Geral', 'Preparação', 'Conta', 'Acesso', 'Contas e aplicativos', 'Contas da empresa', 'Contas de programador') THEN 'TI' ELSE task.category END
END
FROM public.stage_templates AS stage
WHERE stage.stage_template_id = task.stage_template_id
  AND stage.stage_code = 'pre-entry'
  AND task.task_type = 'preparation';

UPDATE public.hr_task_preset_tasks AS task
SET responsible_department_id = department.department_id
FROM public.hr_task_presets AS preset
CROSS JOIN public.departments AS department
WHERE task.hr_task_preset_id = preset.hr_task_preset_id
  AND preset.name = 'Admissão e documentos'
  AND task.category = 'Jurídico'
  AND department.name = 'Jurídico';

