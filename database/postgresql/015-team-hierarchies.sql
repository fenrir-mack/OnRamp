ALTER TABLE public.Teams ADD COLUMN IF NOT EXISTS Parent_Team_Id INT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_teams_parent_team'
  ) THEN
    ALTER TABLE public.Teams
      ADD CONSTRAINT FK_Teams_Parent_Team FOREIGN KEY (Parent_Team_Id)
      REFERENCES public.Teams (Team_Id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_teams_parent_not_self'
  ) THEN
    ALTER TABLE public.Teams
      ADD CONSTRAINT CK_Teams_Parent_Not_Self CHECK (Parent_Team_Id IS NULL OR Parent_Team_Id <> Team_Id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.Team_Leaders (
  Team_Id INT NOT NULL,
  Employee_Id INT NOT NULL,
  Assigned_At TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT PK_Team_Leaders PRIMARY KEY (Team_Id, Employee_Id),
  CONSTRAINT FK_Team_Leaders_Teams FOREIGN KEY (Team_Id)
    REFERENCES public.Teams (Team_Id) ON DELETE CASCADE,
  CONSTRAINT FK_Team_Leaders_Employees FOREIGN KEY (Employee_Id)
    REFERENCES public.Employees (Employee_Id) ON DELETE CASCADE
);

INSERT INTO public.Team_Leaders (Team_Id, Employee_Id)
SELECT Team_Id, Lead_Employee_Id
FROM public.Teams
WHERE Lead_Employee_Id IS NOT NULL
ON CONFLICT (Team_Id, Employee_Id) DO NOTHING;

INSERT INTO public.Employee_Teams (Employee_Id, Team_Id, Team_Role)
SELECT Employee_Id, Team_Id, 'Líder'
FROM public.Team_Leaders
ON CONFLICT (Employee_Id, Team_Id) DO UPDATE SET Team_Role = 'Líder';
