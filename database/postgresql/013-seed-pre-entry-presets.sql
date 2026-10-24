WITH preset_definitions(name, description) AS (
  VALUES
    ('Contas da empresa', 'Acessos básicos para a pessoa começar a trabalhar no primeiro dia.'),
    ('Contas de programador', 'Contas e permissões necessárias para trabalhar com código.'),
    ('Equipamento para o primeiro dia', 'Preparação e conferência do equipamento de trabalho.')
), new_presets AS (
  INSERT INTO public.hr_task_presets (name, description, created_by)
  SELECT definition.name, definition.description, hr.employee_id
  FROM preset_definitions AS definition
  CROSS JOIN public.employees AS hr
  WHERE hr.email = 'fenrir3@gmail.com'
  ON CONFLICT (name) DO NOTHING
  RETURNING hr_task_preset_id, name
), task_definitions(
  preset_name, stage_code, title, description, task_type, responsible_email,
  due_offset_days, is_required, display_order
) AS (
  VALUES
    ('Contas da empresa', 'pre-entry', 'Criar e-mail corporativo', 'Prepare o e-mail e o calendário da empresa para a pessoa antes do primeiro dia.', 'preparation', 'fenrir3@gmail.com', 0, TRUE, 1),
    ('Contas da empresa', 'pre-entry', 'Configurar acesso ao Slack', 'Convide a pessoa para o workspace e inclua nos canais essenciais.', 'preparation', 'fenrir3@gmail.com', 0, TRUE, 2),
    ('Contas da empresa', 'pre-entry', 'Liberar acesso às ferramentas internas', 'Crie os acessos gerais necessários para a função e envie as instruções de primeiro acesso.', 'preparation', 'fenrir3@gmail.com', 0, TRUE, 3),
    ('Contas de programador', 'pre-entry', 'Criar conta GitHub corporativa', 'Adicione a pessoa à organização da empresa e confirme o primeiro acesso.', 'preparation', 'fenrir2@gmail.com', 0, TRUE, 1),
    ('Contas de programador', 'pre-entry', 'Liberar acesso aos repositórios do time', 'Conceda acesso aos repositórios e grupos necessários para a função.', 'preparation', 'fenrir2@gmail.com', 0, TRUE, 2),
    ('Contas de programador', 'pre-entry', 'Preparar ambiente de desenvolvimento', 'Instale ou indique as ferramentas e versões usadas pela equipe.', 'preparation', 'fenrir2@gmail.com', 0, TRUE, 3),
    ('Equipamento para o primeiro dia', 'pre-entry', 'Preparar notebook e periféricos', 'Separe e configure o notebook e os acessórios de trabalho da pessoa.', 'preparation', 'fenrir2@gmail.com', 0, TRUE, 1),
    ('Equipamento para o primeiro dia', 'pre-entry', 'Configurar VPN e segurança', 'Configure VPN, autenticação e as proteções exigidas pela empresa.', 'preparation', 'fenrir2@gmail.com', 0, TRUE, 2),
    ('Equipamento para o primeiro dia', 'pre-entry', 'Validar login e acesso no equipamento', 'Teste o login e confirme que os acessos necessários funcionam antes da chegada.', 'preparation', 'fenrir2@gmail.com', 0, TRUE, 3)
)
INSERT INTO public.hr_task_preset_tasks (
  hr_task_preset_id, stage_template_id, title, description, category, task_type,
  owner_employee_id, owner_role, due_offset_days, is_required, display_order
)
SELECT new_presets.hr_task_preset_id, stage.stage_template_id,
  task.title, task.description, 'Preparação', task.task_type,
  responsible.employee_id, responsible.full_name, task.due_offset_days,
  task.is_required, task.display_order
FROM task_definitions AS task
INNER JOIN new_presets ON new_presets.name = task.preset_name
INNER JOIN public.stage_templates AS stage ON stage.stage_code = task.stage_code
INNER JOIN public.employees AS responsible ON responsible.email = task.responsible_email
WHERE stage.is_active IS TRUE AND responsible.is_active IS TRUE;
