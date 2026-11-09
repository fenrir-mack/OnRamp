CREATE TABLE IF NOT EXISTS public.app_migrations (
  name VARCHAR(160) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_migrations WHERE name = '030-resource-library-scope') THEN
    DELETE FROM public.stage_resources WHERE resource_id IN (
      SELECT resource_id FROM public.resources WHERE blob_name LIKE 'materiais/%'
        AND title IN ('Guia de benefícios', 'Políticas da empresa', 'Acessos e ferramentas', 'Manual do novo talento', 'Política de trabalho remoto', 'Guia de reembolso', 'Código de conduta', 'Agenda da primeira semana')
    );
    DELETE FROM public.employee_plan_resources WHERE resource_id IN (
      SELECT resource_id FROM public.resources WHERE blob_name LIKE 'materiais/%'
        AND title IN ('Guia de benefícios', 'Políticas da empresa', 'Acessos e ferramentas', 'Manual do novo talento', 'Política de trabalho remoto', 'Guia de reembolso', 'Código de conduta', 'Agenda da primeira semana')
    );
    DELETE FROM public.training_courses WHERE resource_id IN (
      SELECT resource_id FROM public.resources WHERE blob_name LIKE 'materiais/%'
        AND title IN ('Guia de benefícios', 'Políticas da empresa', 'Acessos e ferramentas', 'Manual do novo talento', 'Política de trabalho remoto', 'Guia de reembolso', 'Código de conduta', 'Agenda da primeira semana')
    );
    DELETE FROM public.resources WHERE blob_name LIKE 'materiais/%'
      AND title IN ('Guia de benefícios', 'Políticas da empresa', 'Acessos e ferramentas', 'Manual do novo talento', 'Política de trabalho remoto', 'Guia de reembolso', 'Código de conduta', 'Agenda da primeira semana');

    /* Earlier uploads stored the uploader here; the audience now defaults to everyone. */
    UPDATE public.resources AS resource
    SET owner_employee_id = NULL
    FROM public.resource_files AS file
    WHERE file.resource_id = resource.resource_id
      AND file.uploaded_by = resource.owner_employee_id;

    INSERT INTO public.app_migrations (name) VALUES ('030-resource-library-scope');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_resources_owner_employee ON public.resources (owner_employee_id, status);
