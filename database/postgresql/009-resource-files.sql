CREATE TABLE IF NOT EXISTS public.Resource_Files (
  Resource_Id BIGINT NOT NULL CONSTRAINT PK_Resource_Files PRIMARY KEY,
  Storage_Key VARCHAR(36) NOT NULL CONSTRAINT UQ_Resource_Files_Storage_Key UNIQUE,
  Original_File_Name VARCHAR(255) NOT NULL,
  Mime_Type VARCHAR(120) NOT NULL,
  Size_Bytes BIGINT NOT NULL,
  Sha256 CHAR(64) NOT NULL,
  Uploaded_By INT NULL,
  Created_At TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_Resource_Files_Resource FOREIGN KEY (Resource_Id)
    REFERENCES public.Resources (Resource_Id) ON DELETE CASCADE,
  CONSTRAINT FK_Resource_Files_Uploader FOREIGN KEY (Uploaded_By)
    REFERENCES public.Employees (Employee_Id),
  CONSTRAINT CK_Resource_Files_Size CHECK (Size_Bytes > 0)
);
