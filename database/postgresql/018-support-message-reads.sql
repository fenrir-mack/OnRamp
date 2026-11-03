CREATE TABLE IF NOT EXISTS public.Employee_Plan_Task_Issue_Conversation_Reads (
  Employee_Plan_Task_Issue_Conversation_Id BIGINT NOT NULL,
  Employee_Id INT NOT NULL,
  Last_Read_Message_Id BIGINT NOT NULL,
  Updated_At TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT PK_Employee_Plan_Task_Issue_Conversation_Reads
    PRIMARY KEY (Employee_Plan_Task_Issue_Conversation_Id, Employee_Id),
  CONSTRAINT FK_Employee_Plan_Task_Issue_Conversation_Reads_Conversation FOREIGN KEY (Employee_Plan_Task_Issue_Conversation_Id)
    REFERENCES public.Employee_Plan_Task_Issue_Conversations (Employee_Plan_Task_Issue_Conversation_Id) ON DELETE CASCADE,
  CONSTRAINT FK_Employee_Plan_Task_Issue_Conversation_Reads_Employee FOREIGN KEY (Employee_Id)
    REFERENCES public.Employees (Employee_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_Employee_Plan_Task_Issue_Conversation_Reads_Employee
  ON public.Employee_Plan_Task_Issue_Conversation_Reads (Employee_Id, Last_Read_Message_Id);
