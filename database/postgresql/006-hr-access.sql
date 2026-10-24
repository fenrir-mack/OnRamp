/* Explicit RH administration permission for the Fenrir 3 test account. */

ALTER TABLE public.Employees
  ADD COLUMN IF NOT EXISTS Is_HR_Admin BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.Employees
SET Is_HR_Admin = FALSE
WHERE Email IN ('fenrir1@gmail.com', 'fenrir2@gmail.com');

UPDATE public.Employees
SET Is_HR_Admin = TRUE
WHERE Email = 'fenrir3@gmail.com';
