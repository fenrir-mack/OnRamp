/* Marks accounts for which HR has explicitly saved a personalized onboarding plan. */

CREATE TABLE IF NOT EXISTS public.Employee_Plan_Configurations (
  Employee_Id INT PRIMARY KEY REFERENCES public.Employees (Employee_Id) ON DELETE CASCADE,
  Configured_At TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_At TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
