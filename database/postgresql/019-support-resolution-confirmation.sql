ALTER TABLE public.Employee_Plan_Task_Issue_Conversations
  DROP CONSTRAINT IF EXISTS CK_Employee_Plan_Task_Issue_Conversations_Status;

ALTER TABLE public.Employee_Plan_Task_Issue_Conversations
  ADD CONSTRAINT CK_Employee_Plan_Task_Issue_Conversations_Status
    CHECK (Status IN ('open', 'pending_confirmation', 'resolved'));

ALTER TABLE public.Employee_Plan_Task_Issue_Conversations
  ADD COLUMN IF NOT EXISTS Resolution_Requested_By_Employee_Id INT NULL,
  ADD COLUMN IF NOT EXISTS Resolution_Respondent_Employee_Id INT NULL,
  ADD COLUMN IF NOT EXISTS Resolution_Requested_At TIMESTAMPTZ(0) NULL,
  ADD COLUMN IF NOT EXISTS Resolution_Due_At TIMESTAMPTZ(0) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_employee_plan_task_issue_conversations_resolution_requester'
  ) THEN
    ALTER TABLE public.Employee_Plan_Task_Issue_Conversations
      ADD CONSTRAINT FK_Employee_Plan_Task_Issue_Conversations_Resolution_Requester
        FOREIGN KEY (Resolution_Requested_By_Employee_Id)
        REFERENCES public.Employees (Employee_Id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_employee_plan_task_issue_conversations_resolution_respondent'
  ) THEN
    ALTER TABLE public.Employee_Plan_Task_Issue_Conversations
      ADD CONSTRAINT FK_Employee_Plan_Task_Issue_Conversations_Resolution_Respondent
        FOREIGN KEY (Resolution_Respondent_Employee_Id)
        REFERENCES public.Employees (Employee_Id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.Employee_Plan_Task_Issue_Messages
  ALTER COLUMN Sender_Employee_Id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS Is_System BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.Employee_Plan_Task_Issue_Messages
  DROP CONSTRAINT IF EXISTS CK_Employee_Plan_Task_Issue_Messages_System_Sender;

ALTER TABLE public.Employee_Plan_Task_Issue_Messages
  ADD CONSTRAINT CK_Employee_Plan_Task_Issue_Messages_System_Sender
    CHECK ((Is_System IS TRUE AND Sender_Employee_Id IS NULL) OR (Is_System IS FALSE AND Sender_Employee_Id IS NOT NULL));
