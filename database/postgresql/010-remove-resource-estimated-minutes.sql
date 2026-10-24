ALTER TABLE public.Resources
  DROP CONSTRAINT IF EXISTS CK_Resources_Estimated_Minutes,
  DROP COLUMN IF EXISTS Estimated_Minutes;
