/* Exactly one RH administrator for the demo environment. */

ALTER TABLE public.Employees
  ADD COLUMN IF NOT EXISTS Is_HR_Admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.Employees
SET Is_HR_Admin = FALSE
WHERE Email = 'joao.pedro@senulora.com';

UPDATE public.Employees
SET Is_HR_Admin = TRUE
WHERE Email = 'admin@senulora.com';
