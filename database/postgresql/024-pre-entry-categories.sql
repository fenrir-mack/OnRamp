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

INSERT INTO public.hr_task_presets (name, description, created_by)
SELECT 'Documentos e aprovações legais', 'Documentação necessária para formalizar a contratação.', employee.employee_id
FROM public.employees AS employee
WHERE employee.email = 'fenrir3@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_task_presets AS preset WHERE preset.name = 'Documentos e aprovações legais'
  );

WITH legal_tasks(title, description, display_order) AS (
  VALUES
    ('Validar documentos para contratação', 'Confira se a documentação necessária foi recebida e está pronta para formalizar a admissão.', 1),
    ('Preparar contrato para assinatura', 'Envie o contrato de trabalho para revisão e assinatura antes do primeiro dia.', 2)
)
INSERT INTO public.hr_task_preset_tasks (
  hr_task_preset_id, stage_template_id, title, description, category, task_type,
  owner_employee_id, owner_role, due_offset_days, is_required, display_order, responsible_department_id
)
SELECT preset.hr_task_preset_id, stage.stage_template_id, task.title, task.description,
  'Jurídico', 'preparation', hr.employee_id, hr.full_name, 0, TRUE, task.display_order, department.department_id
FROM public.hr_task_presets AS preset
CROSS JOIN public.stage_templates AS stage
INNER JOIN public.employees AS hr ON hr.email = 'fenrir3@gmail.com' AND hr.is_active IS TRUE
LEFT JOIN public.departments AS department ON department.name = 'Pessoas & Cultura'
CROSS JOIN legal_tasks AS task
WHERE preset.name = 'Documentos e aprovações legais'
  AND stage.stage_code = 'pre-entry'
  AND stage.is_active IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_task_preset_tasks AS existing
    WHERE existing.hr_task_preset_id = preset.hr_task_preset_id
      AND existing.stage_template_id = stage.stage_template_id
      AND lower(existing.title) = lower(task.title)
  );

