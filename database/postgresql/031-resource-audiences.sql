CREATE TABLE IF NOT EXISTS public.resource_audiences (
  resource_id BIGINT NOT NULL REFERENCES public.resources (resource_id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES public.employees (employee_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_resource_audiences PRIMARY KEY (resource_id, employee_id)
);

CREATE INDEX IF NOT EXISTS ix_resource_audiences_employee
  ON public.resource_audiences (employee_id, resource_id);

/* Preserve files already marked private by the single-recipient version. */
INSERT INTO public.resource_audiences (resource_id, employee_id)
SELECT resource_id, owner_employee_id
FROM public.resources
WHERE owner_employee_id IS NOT NULL
ON CONFLICT (resource_id, employee_id) DO NOTHING;

/* Visibility is now represented only by the audience rows above. */
UPDATE public.resources SET owner_employee_id = NULL WHERE owner_employee_id IS NOT NULL;
