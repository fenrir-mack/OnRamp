/* Per-account links between onboarding stages and published library materials. */

CREATE TABLE IF NOT EXISTS public.Employee_Plan_Resources (
  Employee_Id INT NOT NULL REFERENCES public.Employees (Employee_Id) ON DELETE CASCADE,
  Stage_Template_Id INT NOT NULL REFERENCES public.Stage_Templates (Stage_Template_Id),
  Resource_Id BIGINT NOT NULL REFERENCES public.Resources (Resource_Id),
  Is_Required BOOLEAN NOT NULL DEFAULT FALSE,
  Display_Order SMALLINT NOT NULL DEFAULT 0,
  Created_At TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT PK_Employee_Plan_Resources PRIMARY KEY (Employee_Id, Stage_Template_Id, Resource_Id)
);

CREATE INDEX IF NOT EXISTS IX_Employee_Plan_Resources_Employee_Stage
  ON public.Employee_Plan_Resources (Employee_Id, Stage_Template_Id, Display_Order);
