CREATE TABLE IF NOT EXISTS public.Employee_Departments (
  Employee_Id INT NOT NULL,
  Department_Id INT NOT NULL,
  Is_Primary BOOLEAN NOT NULL DEFAULT FALSE,
  Joined_At DATE NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT PK_Employee_Departments PRIMARY KEY (Employee_Id, Department_Id),
  CONSTRAINT FK_Employee_Departments_Employees FOREIGN KEY (Employee_Id)
    REFERENCES public.Employees (Employee_Id) ON DELETE CASCADE,
  CONSTRAINT FK_Employee_Departments_Departments FOREIGN KEY (Department_Id)
    REFERENCES public.Departments (Department_Id) ON DELETE CASCADE
);

INSERT INTO public.Employee_Departments (Employee_Id, Department_Id, Is_Primary)
SELECT Employee_Id, Department_Id, TRUE
FROM public.Employees
WHERE Department_Id IS NOT NULL
ON CONFLICT (Employee_Id, Department_Id) DO NOTHING;

UPDATE public.Employee_Departments AS membership
SET Is_Primary = (membership.Department_Id = employee.Department_Id)
FROM public.Employees AS employee
WHERE employee.Employee_Id = membership.Employee_Id;

CREATE UNIQUE INDEX IF NOT EXISTS UX_Employee_Departments_Primary
  ON public.Employee_Departments (Employee_Id)
  WHERE Is_Primary;

ALTER TABLE public.Teams DROP CONSTRAINT IF EXISTS FK_Teams_Departments;
ALTER TABLE public.Teams DROP CONSTRAINT IF EXISTS UQ_Teams_Department_Name;
ALTER TABLE public.Teams DROP COLUMN IF EXISTS Department_Id;
ALTER TABLE public.Teams ADD COLUMN IF NOT EXISTS Description VARCHAR(300) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS UX_Teams_Name_CI ON public.Teams (lower(Name));
