/* Replace the prototype packages with a realistic starter library. */
DELETE FROM public.hr_task_presets
WHERE name IN (
  'Contas da empresa',
  'Contas de programador',
  'Equipamento para o primeiro dia',
  'Documentos e aprovações legais'
);

WITH preset_definitions(name, description) AS (
  VALUES
    ('Acessos e ferramentas', 'Contas e permissões necessárias antes do primeiro dia.'),
    ('Equipamento e segurança', 'Preparação e conferência do equipamento de trabalho.'),
    ('Admissão e documentos', 'Conferência da documentação de contratação com RH e Jurídico.'),
    ('Primeira semana com a equipe', 'Apresentações, mentoria e combinados da primeira semana.'),
    ('Trilha inicial de Produto', 'Atividades acompanhadas para conhecer produto, clientes e processos.'),
    ('Trilha inicial de Tecnologia', 'Atividades acompanhadas para conhecer o ambiente e o fluxo técnico.'),
    ('Check-ins e primeiros objetivos', 'Conversas de acompanhamento e objetivos dos primeiros meses.')
)
INSERT INTO public.hr_task_presets (name, description, created_by)
SELECT definition.name, definition.description, admin.employee_id
FROM preset_definitions AS definition
CROSS JOIN public.employees AS admin
WHERE admin.email = 'admin@senulora.com'
ON CONFLICT (name) DO NOTHING;

WITH task_definitions(
  preset_name, stage_code, title, description, category, task_type,
  responsible_email, department_name, due_offset_days, is_required, display_order
) AS (
  VALUES
    ('Acessos e ferramentas', 'pre-entry', 'Criar e-mail e calendário corporativo', 'Prepare as contas principais para o primeiro dia.', 'TI', 'preparation', 'admin@senulora.com', 'Tecnologia', 0, TRUE, 1),
    ('Acessos e ferramentas', 'pre-entry', 'Configurar canais de comunicação', 'Inclua a pessoa nos canais de comunicação usados pela equipe.', 'TI', 'preparation', 'admin@senulora.com', 'Tecnologia', 1, TRUE, 2),
    ('Acessos e ferramentas', 'pre-entry', 'Liberar acesso às ferramentas do time', 'Conceda os acessos necessários para a função.', 'TI', 'preparation', 'admin@senulora.com', 'Tecnologia', 1, TRUE, 3),

    ('Equipamento e segurança', 'pre-entry', 'Preparar notebook e periféricos', 'Separe e configure o equipamento de trabalho.', 'Equipamento', 'preparation', 'admin@senulora.com', 'Tecnologia', 0, TRUE, 1),
    ('Equipamento e segurança', 'pre-entry', 'Configurar proteção e autenticação', 'Ative as proteções e a autenticação usadas pela empresa.', 'Equipamento', 'preparation', 'admin@senulora.com', 'Tecnologia', 1, TRUE, 2),
    ('Equipamento e segurança', 'pre-entry', 'Testar acesso à rede e às ferramentas', 'Confirme que o equipamento acessa os sistemas necessários.', 'TI', 'preparation', 'admin@senulora.com', 'Tecnologia', 1, TRUE, 3),

    ('Admissão e documentos', 'pre-entry', 'Validar documentos da contratação', 'Confira a documentação necessária para formalizar a admissão.', 'Jurídico', 'preparation', 'admin@senulora.com', 'Jurídico', 0, TRUE, 1),
    ('Admissão e documentos', 'pre-entry', 'Preparar contrato para assinatura', 'Encaminhe o contrato para revisão e assinatura.', 'Jurídico', 'preparation', 'admin@senulora.com', 'Jurídico', 1, TRUE, 2),
    ('Admissão e documentos', 'pre-entry', 'Confirmar próximos passos com a pessoa', 'Oriente sobre datas, documentos pendentes e canais de contato.', 'RH', 'preparation', 'admin@senulora.com', 'Pessoas & Cultura', 1, TRUE, 3),

    ('Primeira semana com a equipe', 'first-steps', 'Apresentar a equipe e a rotina', 'Mostre as pessoas parceiras, os canais e os principais combinados.', 'Equipe', 'task', 'admin@senulora.com', 'Produto', 1, TRUE, 1),
    ('Primeira semana com a equipe', 'first-steps', 'Fazer a conversa inicial de mentoria', 'Combine como pedir ajuda e quais assuntos acompanhar com a mentoria.', 'Mentoria', 'task', 'joao.pedro@senulora.com', 'Pessoas & Cultura', 2, TRUE, 2),
    ('Primeira semana com a equipe', 'first-steps', 'Registrar o check-in da primeira semana', 'Compartilhe como está sendo a chegada e onde precisa de apoio.', 'Check-in', 'checkin', 'admin@senulora.com', 'Pessoas & Cultura', 5, TRUE, 3),

    ('Trilha inicial de Produto', 'in-progress', 'Conhecer o portfólio e o roadmap', 'Revise os produtos e as prioridades do ciclo atual.', 'Capacitação', 'training', 'admin@senulora.com', 'Produto', 10, TRUE, 1),
    ('Trilha inicial de Produto', 'in-progress', 'Acompanhar uma conversa de descoberta', 'Observe como a equipe pesquisa necessidades de clientes.', 'Aprendizado', 'task', 'admin@senulora.com', 'Produto', 20, TRUE, 2),
    ('Trilha inicial de Produto', 'in-progress', 'Planejar uma primeira contribuição', 'Combine uma atividade pequena com a liderança e a mentoria.', 'Entrega', 'task', 'admin@senulora.com', 'Produto', 30, TRUE, 3),

    ('Trilha inicial de Tecnologia', 'in-progress', 'Configurar o ambiente de desenvolvimento', 'Prepare as ferramentas necessárias para trabalhar no projeto.', 'Tecnologia', 'preparation', 'admin@senulora.com', 'Tecnologia', 10, TRUE, 1),
    ('Trilha inicial de Tecnologia', 'in-progress', 'Conhecer o fluxo de código e revisão', 'Revise as etapas de branch, pull request e revisão de código.', 'Capacitação', 'training', 'admin@senulora.com', 'Tecnologia', 20, TRUE, 2),
    ('Trilha inicial de Tecnologia', 'in-progress', 'Realizar uma primeira entrega acompanhada', 'Faça uma alteração pequena com apoio da equipe.', 'Entrega', 'task', 'admin@senulora.com', 'Tecnologia', 30, TRUE, 3),

    ('Check-ins e primeiros objetivos', 'in-progress', 'Fazer o check-in de 15 dias', 'Converse sobre dúvidas, relações de trabalho e próximos passos.', 'Check-in', 'checkin', 'admin@senulora.com', 'Pessoas & Cultura', 15, TRUE, 1),
    ('Check-ins e primeiros objetivos', 'in-progress', 'Revisar prioridades do primeiro mês', 'Alinhe expectativas e prioridades com a liderança.', 'Acompanhamento', 'task', 'admin@senulora.com', 'Produto', 30, TRUE, 2),
    ('Check-ins e primeiros objetivos', 'completion', 'Fazer a conversa de acompanhamento dos 90 dias', 'Revise aprendizados, entregas e objetivos do próximo ciclo.', 'Check-in', 'checkin', 'admin@senulora.com', 'Pessoas & Cultura', 85, TRUE, 3)
)
INSERT INTO public.hr_task_preset_tasks (
  hr_task_preset_id, stage_template_id, title, description, category, task_type,
  owner_employee_id, owner_role, due_offset_days, is_required, display_order, responsible_department_id
)
SELECT preset.hr_task_preset_id, stage.stage_template_id, task.title, task.description,
  task.category, task.task_type, responsible.employee_id, responsible.full_name,
  task.due_offset_days, task.is_required, task.display_order, department.department_id
FROM task_definitions AS task
INNER JOIN public.hr_task_presets AS preset ON preset.name = task.preset_name
INNER JOIN public.stage_templates AS stage ON stage.stage_code = task.stage_code AND stage.is_active IS TRUE
INNER JOIN public.employees AS responsible ON responsible.email = task.responsible_email AND responsible.is_active IS TRUE
INNER JOIN public.departments AS department ON department.name = task.department_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_task_preset_tasks AS existing
  WHERE existing.hr_task_preset_id = preset.hr_task_preset_id
    AND existing.stage_template_id = stage.stage_template_id
    AND lower(existing.title) = lower(task.title)
);
