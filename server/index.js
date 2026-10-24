import express from "express";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pool } from "./db.js";

const scrypt = promisify(scryptCallback);
const sessionCookieName = "onramp_session";
const sessionDurationMs = 12 * 60 * 60 * 1000;
const rememberedSessionDurationMs = 30 * 24 * 60 * 60 * 1000;

const app = express();
const port = Number(process.env.API_PORT ?? 3000);
const fileStorageDirectory = path.resolve(process.env.ONRAMP_FILE_STORAGE_PATH ?? path.join(process.cwd(), "storage", "files"));
const maximumResourceFileSize = 25 * 1024 * 1024;
const allowedFileTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const taskCategoryLabels = { task: "Tarefa", preparation: "Preparação", training: "Treinamento", checkin: "Check-in" };

app.disable("x-powered-by");
app.use(express.json());

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie ?? "";
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function setSessionCookie(response, token, maxAgeSeconds) {
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
  ];
  if (maxAgeSeconds) attributes.push(`Max-Age=${maxAgeSeconds}`);
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(response) {
  const attributes = [`${sessionCookieName}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

function publicEmployee(row) {
  return {
    id: row.employee_id,
    name: row.full_name,
    email: row.email,
    jobTitle: row.job_title,
    department: row.department_name,
    isHrAdmin: row.is_hr_admin === true,
  };
}

async function findSessionEmployee(request) {
  const token = getCookie(request, sessionCookieName);
  if (!token || token.length > 200) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await pool.query(`
    SELECT employee.employee_id, employee.full_name, employee.email, employee.job_title, employee.is_hr_admin,
      department.name AS department_name
    FROM public.auth_sessions AS session
    INNER JOIN public.employees AS employee ON employee.employee_id = session.employee_id
    LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
    WHERE session.token_hash = $1 AND session.expires_at > CURRENT_TIMESTAMP AND employee.is_active IS TRUE
  `, [tokenHash]);
  return result.rows[0] ?? null;
}

async function requireAuthenticated(request, response, next) {
  try {
    const employee = await findSessionEmployee(request);
    if (!employee) return response.status(401).json({ error: "Autenticação necessária." });
    request.authenticatedEmployee = employee;
    return next();
  } catch (error) {
    console.error("Could not verify API session:", error.message);
    return response.status(500).json({ error: "Não foi possível verificar sua sessão." });
  }
}

app.get("/api/me/plan", requireAuthenticated, async (request, response) => {
  const employeeId = request.authenticatedEmployee.employee_id;
  try {
    const [taskResult, resourceResult] = await Promise.all([
      pool.query(`
        SELECT stage.stage_code AS "stageCode", plan_task.title, plan_task.description,
          plan_task.category, plan_task.task_type AS "taskType", plan_task.owner_role AS "ownerRole",
          plan_task.owner_employee_id AS "ownerEmployeeId", task_owner.full_name AS "ownerName",
          plan_task.due_offset_days AS "dueOffsetDays", plan_task.is_required AS required
        FROM public.employee_plan_tasks AS plan_task
        INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
        LEFT JOIN public.employees AS task_owner ON task_owner.employee_id = plan_task.owner_employee_id
        WHERE plan_task.employee_id = $1
        ORDER BY stage.display_order, plan_task.display_order, plan_task.employee_plan_task_id;
      `, [employeeId]),
      pool.query(`
        SELECT stage.stage_code AS "stageCode", resource.resource_id AS "resourceId",
          resource.title, resource.description, resource.format, resource.blob_name AS "blobName",
          resource.external_url AS "externalUrl", resource.mime_type AS "mimeType",
          CASE WHEN resource.external_url IS NULL AND resource.blob_name IS NOT NULL
            THEN '/api/resources/' || resource.resource_id || '/download' END AS "downloadUrl"
        FROM public.employee_plan_resources AS plan_resource
        INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_resource.stage_template_id
        INNER JOIN public.resources AS resource ON resource.resource_id = plan_resource.resource_id
        WHERE plan_resource.employee_id = $1 AND resource.status = 'published'
        ORDER BY stage.display_order, plan_resource.display_order, resource.title;
      `, [employeeId]),
    ]);
    const configured = await pool.query("SELECT 1 FROM public.employee_plan_configurations WHERE employee_id = $1", [employeeId]);
    return response.json({ configured: configured.rowCount > 0, tasks: taskResult.rows, resources: resourceResult.rows });
  } catch (error) {
    console.error("Could not load the employee onboarding plan:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar sua jornada personalizada." });
  }
});

async function requireHr(request, response, next) {
  try {
    const employee = await findSessionEmployee(request);
    if (!employee) return response.status(401).json({ error: "Autenticação necessária." });
    if (employee.is_hr_admin !== true) {
      return response.status(403).json({ error: "Acesso disponível apenas para a conta administradora do RH." });
    }
    request.authenticatedEmployee = employee;
    return next();
  } catch (error) {
    console.error("Could not verify HR access:", error.message);
    return response.status(500).json({ error: "Não foi possível verificar seu acesso." });
  }
}

function parseAccountId(value) {
  const accountId = Number(value);
  return Number.isSafeInteger(accountId) && accountId > 0 ? accountId : null;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

function validatePlanTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length > 200) return "O plano deve conter até 200 tarefas.";
  const validTypes = new Set(["task", "preparation", "training", "checkin"]);
  for (const task of tasks) {
    if (!task || !Number.isSafeInteger(Number(task.stageTemplateId)) || Number(task.stageTemplateId) <= 0) return "Selecione uma etapa válida para cada tarefa.";
    if (typeof task.title !== "string" || !task.title.trim() || task.title.trim().length > 180) return "Cada tarefa precisa de um título com até 180 caracteres.";
    if (typeof task.description !== "string" || task.description.length > 1000) return "A descrição pode ter até 1.000 caracteres.";
    if (typeof task.category !== "string" || !task.category.trim() || task.category.trim().length > 80) return "Informe uma categoria com até 80 caracteres.";
    if (typeof task.ownerRole !== "string" || !task.ownerRole.trim() || task.ownerRole.trim().length > 120) return "Informe a pessoa responsável.";
    if (!Number.isSafeInteger(Number(task.ownerEmployeeId)) || Number(task.ownerEmployeeId) <= 0) return "Selecione uma pessoa responsável para cada tarefa.";
    if (!validTypes.has(task.taskType)) return "O tipo de tarefa é inválido.";
    if (!Number.isSafeInteger(Number(task.dueOffsetDays)) || Number(task.dueOffsetDays) < 0 || Number(task.dueOffsetDays) > 32767) return "O prazo deve ser um número de dias entre 0 e 32.767.";
    if (typeof task.required !== "boolean") return "Informe se a tarefa é obrigatória.";
  }
  return null;
}

app.get("/api/hr/task-presets", requireHr, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT preset.hr_task_preset_id AS id, preset.name, preset.description,
        task.hr_task_preset_task_id AS "taskId", task.stage_template_id AS "stageTemplateId",
        stage.name AS "stageName", stage.display_order AS "stageOrder", task.title,
        task.description AS "taskDescription",
        CASE task.task_type WHEN 'preparation' THEN 'Preparação' WHEN 'training' THEN 'Treinamento' WHEN 'checkin' THEN 'Check-in' ELSE 'Tarefa' END AS category,
        task.task_type AS "taskType",
        task.owner_role AS "ownerRole", task.owner_employee_id AS "ownerEmployeeId",
        task_owner.full_name AS "ownerName", task.due_offset_days AS "dueOffsetDays",
        task.is_required AS required
      FROM public.hr_task_presets AS preset
      LEFT JOIN public.hr_task_preset_tasks AS task ON task.hr_task_preset_id = preset.hr_task_preset_id
      LEFT JOIN public.stage_templates AS stage ON stage.stage_template_id = task.stage_template_id
      LEFT JOIN public.employees AS task_owner ON task_owner.employee_id = task.owner_employee_id
      ORDER BY preset.name, stage.display_order, task.display_order, task.hr_task_preset_task_id;
    `);
    const presets = new Map();
    for (const row of result.rows) {
      if (!presets.has(row.id)) presets.set(row.id, { id: row.id, name: row.name, description: row.description, tasks: [] });
      if (row.taskId !== null) presets.get(row.id).tasks.push({
        id: row.taskId, stageTemplateId: row.stageTemplateId, stageName: row.stageName,
        stageOrder: row.stageOrder, title: row.title, description: row.taskDescription,
        category: row.category, taskType: row.taskType, ownerRole: row.ownerRole,
        ownerEmployeeId: row.ownerEmployeeId, ownerName: row.ownerName,
        dueOffsetDays: row.dueOffsetDays, required: row.required,
      });
    }
    return response.json([...presets.values()]);
  } catch (error) {
    console.error("Could not load HR task presets:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar os pacotes de tarefas." });
  }
});

app.post("/api/hr/task-presets", requireHr, async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  const tasks = request.body?.tasks;
  const taskError = validatePlanTasks(tasks);
  if (!name || name.length > 120) return response.status(400).json({ error: "Informe o nome do pacote (até 120 caracteres)." });
  if (description.length > 500) return response.status(400).json({ error: "A descrição pode ter até 500 caracteres." });
  if (taskError || !tasks.length) return response.status(400).json({ error: taskError ?? "Adicione ao menos uma tarefa ao pacote." });
  if (tasks.some((task) => !Number.isSafeInteger(Number(task.ownerEmployeeId)) || Number(task.ownerEmployeeId) <= 0)) {
    return response.status(400).json({ error: "Selecione uma pessoa responsável para cada tarefa do pacote." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stageIds = [...new Set(tasks.map((task) => Number(task.stageTemplateId)))];
    const validStages = await client.query("SELECT stage_template_id FROM public.stage_templates WHERE is_active IS TRUE AND stage_template_id = ANY($1::int[])", [stageIds]);
    if (validStages.rowCount !== stageIds.length) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: "Um pacote contém uma etapa inexistente ou inativa." });
    }
    const ownerIds = [...new Set(tasks.map((task) => Number(task.ownerEmployeeId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    const validOwners = await client.query("SELECT employee_id FROM public.employees WHERE is_active IS TRUE AND employee_id = ANY($1::int[])", [ownerIds]);
    if (validOwners.rowCount !== ownerIds.length) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: "Um pacote contém uma pessoa responsável inexistente ou inativa." });
    }
    const presetResult = await client.query(`
      INSERT INTO public.hr_task_presets (name, description, created_by)
      VALUES ($1, $2, $3)
      RETURNING hr_task_preset_id AS id, name, description
    `, [name, description, request.authenticatedEmployee.employee_id]);
    const preset = presetResult.rows[0];
    const stageOrder = new Map();
    for (const task of tasks) {
      const stageId = Number(task.stageTemplateId);
      const displayOrder = stageOrder.get(stageId) ?? 0;
      stageOrder.set(stageId, displayOrder + 1);
      await client.query(`
        INSERT INTO public.hr_task_preset_tasks (
          hr_task_preset_id, stage_template_id, title, description, category, task_type, owner_employee_id,
          owner_role, due_offset_days, is_required, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [preset.id, stageId, task.title.trim(), task.description.trim(), taskCategoryLabels[task.taskType], task.taskType,
        Number(task.ownerEmployeeId), task.ownerRole.trim(), Number(task.dueOffsetDays), task.required, displayOrder]);
    }
    await client.query("COMMIT");
    return response.status(201).json({ ...preset, tasks });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error.code === "23505") return response.status(409).json({ error: "Já existe um pacote com esse nome." });
    console.error("Could not save HR task preset:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar o pacote." });
  } finally {
    client.release();
  }
});

app.delete("/api/hr/task-presets/:presetId", requireHr, async (request, response) => {
  const presetId = parseAccountId(request.params.presetId);
  if (!presetId) return response.status(400).json({ error: "Pacote inválido." });
  try {
    const result = await pool.query("DELETE FROM public.hr_task_presets WHERE hr_task_preset_id = $1 RETURNING hr_task_preset_id", [presetId]);
    if (!result.rowCount) return response.status(404).json({ error: "Pacote não encontrado." });
    return response.status(204).end();
  } catch (error) {
    console.error("Could not delete HR task preset:", error.message);
    return response.status(500).json({ error: "Não foi possível excluir o pacote." });
  }
});

app.get("/api/hr/accounts", requireHr, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT employee.employee_id AS id, employee.full_name AS name, employee.email,
        employee.job_title AS "jobTitle", employee.department_id AS "departmentId",
        department.name AS department, employee.manager_employee_id AS "managerEmployeeId",
        manager.full_name AS "managerName", employee.is_active AS "isActive",
        COUNT(plan_task.employee_plan_task_id)::int AS "planTaskCount"
      FROM public.employees AS employee
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      LEFT JOIN public.employees AS manager ON manager.employee_id = employee.manager_employee_id
      LEFT JOIN public.employee_plan_tasks AS plan_task ON plan_task.employee_id = employee.employee_id
      WHERE employee.is_hr_admin IS FALSE
      GROUP BY employee.employee_id, department.name, manager.full_name
      ORDER BY employee.full_name;
    `);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load HR accounts:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as contas." });
  }
});

app.get("/api/hr/responsibles", requireHr, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT employee.employee_id AS id, employee.full_name AS name,
        employee.job_title AS "jobTitle", department.name AS department
      FROM public.employees AS employee
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      WHERE employee.is_active IS TRUE
      ORDER BY employee.full_name;
    `);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load task responsible people:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as pessoas responsáveis." });
  }
});

app.get("/api/hr/departments", requireHr, async (_request, response) => {
  try {
    const result = await pool.query("SELECT department_id AS id, name FROM public.departments ORDER BY name");
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load departments for HR:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as áreas." });
  }
});

app.get("/api/hr/resource-categories", requireHr, async (_request, response) => {
  try {
    const result = await pool.query("SELECT resource_category_id AS id, slug, name FROM public.resource_categories ORDER BY name");
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load resource categories:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as categorias de materiais." });
  }
});

app.post("/api/hr/resources/upload", requireHr, express.raw({ type: "application/octet-stream", limit: maximumResourceFileSize }), async (request, response) => {
  const decodeHeader = (name) => {
    try { return decodeURIComponent(request.get(name) ?? ""); } catch { return ""; }
  };
  const title = decodeHeader("x-resource-title").trim();
  const description = decodeHeader("x-resource-description").trim();
  const categorySlug = decodeHeader("x-resource-category").trim();
  const originalName = path.basename(decodeHeader("x-file-name").replaceAll("\\", "/"));
  const mimeType = (request.get("x-file-type") ?? "").toLowerCase().split(";")[0].trim();
  const contents = request.body;
  if (!Buffer.isBuffer(contents)) return response.status(400).json({ error: "Envie um arquivo válido." });
  if (!title || title.length > 180 || description.length > 1200 || !categorySlug || originalName.length < 1 || originalName.length > 255) {
    return response.status(400).json({ error: "Confira o título, a categoria, a descrição e o nome do arquivo." });
  }
  if (!contents.length || contents.length > maximumResourceFileSize) return response.status(400).json({ error: "O arquivo deve ter até 25 MB e não pode estar vazio." });
  if (!allowedFileTypes.has(mimeType)) return response.status(400).json({ error: "Formato não permitido. Envie PDF, Office, TXT, CSV, JPEG, PNG ou WEBP." });
  const client = await pool.connect();
  let storagePath;
  let fileWritten = false;
  let transactionStarted = false;
  try {
    const category = await client.query("SELECT resource_category_id AS id, name FROM public.resource_categories WHERE slug = $1", [categorySlug]);
    if (!category.rowCount) return response.status(400).json({ error: "A categoria selecionada não existe." });
    const storageKey = randomUUID();
    storagePath = path.join(fileStorageDirectory, storageKey);
    const extension = path.extname(originalName).slice(1).toUpperCase() || "ARQUIVO";
    await mkdir(fileStorageDirectory, { recursive: true });
    await client.query("BEGIN");
    transactionStarted = true;
    const resource = await client.query(`
      INSERT INTO public.resources (
        resource_category_id, title, description, format, mime_type, owner_employee_id, status
      ) VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, 'draft')
      RETURNING resource_id AS id
    `, [category.rows[0].id, title, description, extension, mimeType, request.authenticatedEmployee.employee_id]);
    await writeFile(storagePath, contents, { flag: "wx", mode: 0o600 });
    fileWritten = true;
    await client.query(`
      INSERT INTO public.resource_files (
        resource_id, storage_key, original_file_name, mime_type, size_bytes, sha256, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [resource.rows[0].id, storageKey, originalName, mimeType, contents.length, createHash("sha256").update(contents).digest("hex"), request.authenticatedEmployee.employee_id]);
    await client.query("UPDATE public.resources SET blob_name = $2, status = 'published', updated_at = CURRENT_TIMESTAMP WHERE resource_id = $1", [resource.rows[0].id, `private:${storageKey}`]);
    await client.query("COMMIT");
    transactionStarted = false;
    return response.status(201).json({
      id: resource.rows[0].id, title, description: description || null, format: extension,
      mime_type: mimeType, category: category.rows[0].name,
      downloadUrl: `/api/resources/${resource.rows[0].id}/download`,
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    if (fileWritten) await unlink(storagePath).catch(() => undefined);
    console.error("Could not store HR resource:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar o arquivo e seus dados." });
  } finally {
    client.release();
  }
});

app.post("/api/hr/accounts", requireHr, async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const jobTitle = typeof request.body?.jobTitle === "string" ? request.body.jobTitle.trim() : "";
  const departmentId = request.body?.departmentId === "" || request.body?.departmentId == null ? null : Number(request.body.departmentId);
  const managerEmployeeId = request.body?.managerEmployeeId === "" || request.body?.managerEmployeeId == null ? null : Number(request.body.managerEmployeeId);
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!name || name.length > 160 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Informe nome e um e-mail válido." });
  }
  if (jobTitle.length > 120) return response.status(400).json({ error: "O cargo pode ter até 120 caracteres." });
  if (!password || password.length < 8 || password.length > 1024) {
    return response.status(400).json({ error: "A senha inicial deve ter entre 8 e 1.024 caracteres." });
  }
  if (departmentId !== null && (!Number.isSafeInteger(departmentId) || departmentId <= 0)) {
    return response.status(400).json({ error: "Selecione uma área válida." });
  }
  if (managerEmployeeId !== null && (!Number.isSafeInteger(managerEmployeeId) || managerEmployeeId <= 0)) {
    return response.status(400).json({ error: "Selecione uma liderança válida." });
  }

  try {
    if (departmentId !== null) {
      const department = await pool.query("SELECT 1 FROM public.departments WHERE department_id = $1", [departmentId]);
      if (!department.rowCount) return response.status(400).json({ error: "A área selecionada não existe." });
    }
    if (managerEmployeeId !== null) {
      const manager = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_active IS TRUE AND is_hr_admin IS FALSE", [managerEmployeeId]);
      if (!manager.rowCount) return response.status(400).json({ error: "A liderança selecionada não existe ou está inativa." });
    }
    const passwordHash = await hashPassword(password);
    const result = await pool.query(`
      INSERT INTO public.employees (email, full_name, job_title, department_id, manager_employee_id, password_hash, is_hr_admin)
      VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, FALSE)
      RETURNING employee_id AS id, full_name AS name, email, job_title AS "jobTitle",
        department_id AS "departmentId", manager_employee_id AS "managerEmployeeId", TRUE AS "isActive"
    `, [email, name, jobTitle, departmentId, managerEmployeeId, passwordHash]);
    return response.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Já existe uma conta com esse e-mail." });
    console.error("Could not create HR account:", error.message);
    return response.status(500).json({ error: "Não foi possível criar a conta." });
  }
});

app.patch("/api/hr/accounts/:accountId", requireHr, async (request, response) => {
  const accountId = parseAccountId(request.params.accountId);
  if (!accountId) return response.status(400).json({ error: "Conta inválida." });
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const jobTitle = typeof request.body?.jobTitle === "string" ? request.body.jobTitle.trim() : "";
  const departmentId = request.body?.departmentId === "" || request.body?.departmentId == null ? null : Number(request.body.departmentId);
  const managerEmployeeId = request.body?.managerEmployeeId === "" || request.body?.managerEmployeeId == null ? null : Number(request.body.managerEmployeeId);
  const isActive = request.body?.isActive;
  if (!name || name.length > 160 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Informe nome e um e-mail válido." });
  }
  if (jobTitle.length > 120) return response.status(400).json({ error: "O cargo pode ter até 120 caracteres." });
  if (typeof isActive !== "boolean") return response.status(400).json({ error: "Informe se a conta está ativa." });
  if (departmentId !== null && (!Number.isSafeInteger(departmentId) || departmentId <= 0)) return response.status(400).json({ error: "Selecione uma área válida." });
  if (managerEmployeeId !== null && (!Number.isSafeInteger(managerEmployeeId) || managerEmployeeId <= 0 || managerEmployeeId === accountId)) return response.status(400).json({ error: "Selecione uma liderança válida." });
  try {
    const target = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_hr_admin IS FALSE", [accountId]);
    if (!target.rowCount) return response.status(404).json({ error: "Pessoa não encontrada." });
    if (departmentId !== null) {
      const department = await pool.query("SELECT 1 FROM public.departments WHERE department_id = $1", [departmentId]);
      if (!department.rowCount) return response.status(400).json({ error: "A área selecionada não existe." });
    }
    if (managerEmployeeId !== null) {
      const manager = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_hr_admin IS FALSE", [managerEmployeeId]);
      if (!manager.rowCount) return response.status(400).json({ error: "A liderança selecionada não existe ou está inativa." });
    }
    const result = await pool.query(`
      UPDATE public.employees AS employee SET email = $2, full_name = $3,
        job_title = NULLIF($4, ''), department_id = $5, manager_employee_id = $6, is_active = $7
      WHERE employee.employee_id = $1 AND employee.is_hr_admin IS FALSE
      RETURNING employee.employee_id AS id, employee.full_name AS name, employee.email,
        employee.job_title AS "jobTitle", employee.department_id AS "departmentId",
        employee.manager_employee_id AS "managerEmployeeId", employee.is_active AS "isActive"
    `, [accountId, email, name, jobTitle, departmentId, managerEmployeeId, isActive]);
    return response.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Já existe uma conta com esse e-mail." });
    console.error("Could not update HR account:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar os dados da pessoa." });
  }
});

app.get("/api/hr/accounts/:accountId/plan", requireHr, async (request, response) => {
  const accountId = parseAccountId(request.params.accountId);
  if (!accountId) return response.status(400).json({ error: "Conta inválida." });
  try {
    const account = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_active IS TRUE", [accountId]);
    if (!account.rowCount) return response.status(404).json({ error: "Conta não encontrada." });
    const result = await pool.query(`
      SELECT plan_task.employee_plan_task_id AS id, plan_task.stage_template_id AS "stageTemplateId",
        stage.name AS "stageName", stage.display_order AS "stageOrder", plan_task.title,
        plan_task.description,
        CASE plan_task.task_type WHEN 'preparation' THEN 'Preparação' WHEN 'training' THEN 'Treinamento' WHEN 'checkin' THEN 'Check-in' ELSE 'Tarefa' END AS category,
        plan_task.task_type AS "taskType",
        plan_task.owner_role AS "ownerRole", plan_task.owner_employee_id AS "ownerEmployeeId",
        task_owner.full_name AS "ownerName", plan_task.due_offset_days AS "dueOffsetDays",
        plan_task.is_required AS required
      FROM public.employee_plan_tasks AS plan_task
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
      LEFT JOIN public.employees AS task_owner ON task_owner.employee_id = plan_task.owner_employee_id
      WHERE plan_task.employee_id = $1
      ORDER BY stage.display_order, plan_task.display_order, plan_task.employee_plan_task_id;
    `, [accountId]);
    const materials = await pool.query(`
      SELECT plan_resource.stage_template_id AS "stageTemplateId",
        stage.name AS "stageName", plan_resource.resource_id AS "resourceId",
        resource.title, plan_resource.is_required AS required
      FROM public.employee_plan_resources AS plan_resource
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_resource.stage_template_id
      INNER JOIN public.resources AS resource ON resource.resource_id = plan_resource.resource_id
      WHERE plan_resource.employee_id = $1
      ORDER BY stage.display_order, plan_resource.display_order, resource.title;
    `, [accountId]);
    const configured = await pool.query("SELECT 1 FROM public.employee_plan_configurations WHERE employee_id = $1", [accountId]);
    return response.json({ configured: configured.rowCount > 0, tasks: result.rows, resources: materials.rows });
  } catch (error) {
    console.error("Could not load employee plan:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar o padrão desta conta." });
  }
});

app.put("/api/hr/accounts/:accountId/plan", requireHr, async (request, response) => {
  const accountId = parseAccountId(request.params.accountId);
  if (!accountId) return response.status(400).json({ error: "Conta inválida." });
  const tasks = request.body?.tasks;
  const validationError = validatePlanTasks(tasks);
  if (validationError) return response.status(400).json({ error: validationError });
  const resources = request.body?.resources;
  if (!Array.isArray(resources) || resources.length > 100) return response.status(400).json({ error: "Selecione até 100 materiais para o padrão." });
  for (const resource of resources) {
    if (!Number.isSafeInteger(Number(resource?.stageTemplateId)) || Number(resource.stageTemplateId) <= 0) return response.status(400).json({ error: "Selecione uma etapa válida para cada material." });
    if (!Array.isArray(resource.resourceIds) || resource.resourceIds.length > 100 || resource.resourceIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) return response.status(400).json({ error: "A lista de materiais contém uma seleção inválida." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_active IS TRUE", [accountId]);
    if (!account.rowCount) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Conta não encontrada." });
    }
    const stageIds = [...new Set([...tasks.map((task) => Number(task.stageTemplateId)), ...resources.map((resource) => Number(resource.stageTemplateId))])];
    if (stageIds.length) {
      const stages = await client.query("SELECT stage_template_id FROM public.stage_templates WHERE is_active IS TRUE AND stage_template_id = ANY($1::int[])", [stageIds]);
      if (stages.rowCount !== stageIds.length) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: "Uma ou mais etapas não existem ou estão inativas." });
      }
    }
    const ownerIds = [...new Set(tasks.map((task) => Number(task.ownerEmployeeId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (ownerIds.length) {
      const owners = await client.query("SELECT employee_id FROM public.employees WHERE is_active IS TRUE AND employee_id = ANY($1::int[])", [ownerIds]);
      if (owners.rowCount !== ownerIds.length) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: "Uma ou mais pessoas responsáveis não existem ou estão inativas." });
      }
    }
    const resourceIds = [...new Set(resources.flatMap((resource) => resource.resourceIds.map(Number)))];
    if (resourceIds.length) {
      const published = await client.query("SELECT resource_id FROM public.resources WHERE status = 'published' AND resource_id = ANY($1::bigint[])", [resourceIds]);
      if (published.rowCount !== resourceIds.length) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: "Um ou mais materiais não estão publicados ou não existem." });
      }
    }
    await client.query("DELETE FROM public.employee_plan_tasks WHERE employee_id = $1", [accountId]);
    await client.query("DELETE FROM public.employee_plan_resources WHERE employee_id = $1", [accountId]);
    await client.query(`
      INSERT INTO public.employee_plan_configurations (employee_id, updated_at)
      VALUES ($1, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `, [accountId]);
    const stageOrders = new Map();
    for (const task of tasks) {
      const stageId = Number(task.stageTemplateId);
      const displayOrder = stageOrders.get(stageId) ?? 0;
      stageOrders.set(stageId, displayOrder + 1);
      await client.query(`
        INSERT INTO public.employee_plan_tasks (
          employee_id, stage_template_id, title, description, category, task_type,
          owner_employee_id, owner_role, due_offset_days, is_required, display_order, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      `, [accountId, stageId, task.title.trim(), task.description.trim(), taskCategoryLabels[task.taskType], task.taskType,
        task.ownerEmployeeId == null || task.ownerEmployeeId === "" ? null : Number(task.ownerEmployeeId),
        task.ownerRole.trim(), Number(task.dueOffsetDays), task.required, displayOrder]);
    }
    const resourceOrders = new Map();
    for (const stageResources of resources) {
      const stageId = Number(stageResources.stageTemplateId);
      for (const resourceId of [...new Set(stageResources.resourceIds.map(Number))]) {
        const displayOrder = resourceOrders.get(stageId) ?? 0;
        resourceOrders.set(stageId, displayOrder + 1);
        await client.query(`
          INSERT INTO public.employee_plan_resources (
            employee_id, stage_template_id, resource_id, display_order
          ) VALUES ($1, $2, $3, $4)
        `, [accountId, stageId, resourceId, displayOrder]);
      }
    }
    await client.query("COMMIT");
    return response.json({ saved: tasks.length, savedResources: resourceIds.length });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not save employee plan:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar o padrão. Tente novamente." });
  } finally {
    client.release();
  }
});

app.post("/api/auth/login", async (request, response) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const rememberMe = request.body?.rememberMe === true;
  if (!email || !password || email.length > 254 || password.length > 1024) {
    return response.status(400).json({ error: "Informe seu e-mail e sua senha." });
  }

  try {
    const result = await pool.query(`
      SELECT employee.employee_id, employee.full_name, employee.email, employee.job_title,
        employee.password_hash, employee.is_hr_admin, department.name AS department_name
      FROM public.employees AS employee
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      WHERE lower(employee.email) = $1 AND employee.is_active IS TRUE
      LIMIT 1
    `, [email]);
    const employee = result.rows[0];
    let passwordMatches = false;
    if (employee?.password_hash) {
      const [algorithm, salt, expectedHex] = employee.password_hash.split("$");
      if (algorithm === "scrypt" && salt && /^[a-f0-9]{128}$/i.test(expectedHex ?? "")) {
        const actual = await scrypt(password, salt, 64);
        passwordMatches = timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
      }
    }
    if (!employee || !passwordMatches) {
      return response.status(401).json({ error: "E-mail ou senha incorretos." });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const duration = rememberMe ? rememberedSessionDurationMs : sessionDurationMs;
    await pool.query("DELETE FROM public.auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP");
    await pool.query(
      "INSERT INTO public.auth_sessions (employee_id, token_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond'))",
      [employee.employee_id, tokenHash, duration],
    );
    setSessionCookie(response, token, rememberMe ? Math.floor(duration / 1000) : null);
    return response.json({ employee: publicEmployee(employee) });
  } catch (error) {
    console.error("Login failed:", error.message);
    return response.status(500).json({ error: "Não foi possível entrar agora. Tente novamente." });
  }
});

app.get("/api/auth/session", async (request, response) => {
  try {
    const employee = await findSessionEmployee(request);
    if (!employee) return response.status(401).json({ error: "Sessão não encontrada." });
    return response.json({ employee: publicEmployee(employee) });
  } catch (error) {
    console.error("Could not restore login session:", error.message);
    return response.status(500).json({ error: "Não foi possível verificar sua sessão." });
  }
});

app.delete("/api/auth/session", async (request, response) => {
  try {
    const token = getCookie(request, sessionCookieName);
    if (token && token.length <= 200) {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await pool.query("DELETE FROM public.auth_sessions WHERE token_hash = $1", [tokenHash]);
    }
    clearSessionCookie(response);
    return response.status(204).end();
  } catch (error) {
    console.error("Could not end login session:", error.message);
    clearSessionCookie(response);
    return response.status(500).json({ error: "Não foi possível encerrar a sessão." });
  }
});

app.get("/api/health", async (_request, response) => {
  try {
    const result = await pool.query("SELECT current_database() AS database");
    response.json({ status: "ok", database: result.rows[0].database });
  } catch (error) {
    console.error("PostgreSQL health check failed:", error.message);
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.get("/api/stages", requireAuthenticated, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        stage.stage_template_id AS id,
        stage.stage_code AS code,
        stage.name,
        stage.description,
        stage.display_order,
        stage.duration_label,
        department.name AS owner_department,
        COALESCE(
          json_agg(
            json_build_object(
              'id', task.task_template_id,
              'title', task.title,
              'description', task.description,
              'category', task.category,
              'type', task.task_type,
              'ownerRole', task.owner_role,
              'dueOffsetDays', task.due_offset_days,
              'required', task.is_required,
              'displayOrder', task.display_order
            ) ORDER BY task.display_order
          ) FILTER (WHERE task.task_template_id IS NOT NULL),
          '[]'::json
        ) AS tasks
      FROM public.stage_templates AS stage
      LEFT JOIN public.departments AS department
        ON department.department_id = stage.owner_department_id
      LEFT JOIN public.task_templates AS task
        ON task.stage_template_id = stage.stage_template_id
        AND task.is_active IS TRUE
      WHERE stage.is_active IS TRUE
      GROUP BY stage.stage_template_id, department.name
      ORDER BY stage.display_order;
    `);

    response.json(result.rows);
  } catch (error) {
    console.error("Could not load onboarding stages:", error.message);
    response.status(500).json({ error: "Could not load onboarding stages." });
  }
});

app.get("/api/resources/:resourceId/download", requireAuthenticated, async (request, response) => {
  const resourceId = parseAccountId(request.params.resourceId);
  if (!resourceId) return response.status(400).json({ error: "Arquivo inválido." });
  try {
    const result = await pool.query(`
      SELECT resource.blob_name, resource.mime_type,
        file.storage_key, file.original_file_name, file.mime_type AS "fileMimeType"
      FROM public.resources AS resource
      LEFT JOIN public.resource_files AS file ON file.resource_id = resource.resource_id
      WHERE resource.resource_id = $1 AND resource.status = 'published'
    `, [resourceId]);
    const resource = result.rows[0];
    if (!resource || !resource.blob_name) return response.status(404).json({ error: "Arquivo não encontrado." });

    let filePath;
    let downloadName;
    if (resource.storage_key) {
      if (!/^[0-9a-f-]{36}$/i.test(resource.storage_key)) return response.status(404).json({ error: "Arquivo não encontrado." });
      filePath = path.resolve(fileStorageDirectory, resource.storage_key);
      if (path.dirname(filePath) !== fileStorageDirectory) return response.status(404).json({ error: "Arquivo não encontrado." });
      downloadName = resource.original_file_name;
    } else {
      const publicDirectory = path.resolve(process.cwd(), "public");
      filePath = path.resolve(publicDirectory, resource.blob_name);
      const relativePath = path.relative(publicDirectory, filePath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return response.status(404).json({ error: "Arquivo não encontrado." });
      downloadName = path.basename(filePath);
    }
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.download(filePath, downloadName, (error) => {
      if (error && !response.headersSent) response.status(error.code === "ENOENT" ? 404 : 500).json({ error: "Não foi possível abrir o arquivo." });
    });
  } catch (error) {
    console.error("Could not download resource:", error.message);
    return response.status(500).json({ error: "Não foi possível abrir o arquivo." });
  }
});

app.get("/api/resources", requireAuthenticated, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        resource.resource_id AS id,
        resource.title,
        resource.description,
        resource.format,
        resource.mime_type,
        category.slug AS category_slug,
        category.name AS category,
        department.name AS owner_department,
        CASE WHEN resource_file.storage_key IS NULL THEN resource.blob_name END AS blob_name,
        resource.external_url,
        CASE WHEN resource.external_url IS NULL AND resource.blob_name IS NOT NULL
          THEN '/api/resources/' || resource.resource_id || '/download' END AS download_url,
        resource_file.original_file_name,
        resource_file.size_bytes
      FROM public.resources AS resource
      INNER JOIN public.resource_categories AS category
        ON category.resource_category_id = resource.resource_category_id
      LEFT JOIN public.resource_files AS resource_file
        ON resource_file.resource_id = resource.resource_id
      LEFT JOIN public.departments AS department
        ON department.department_id = resource.owner_department_id
      WHERE resource.status = 'published'
      ORDER BY category.name, resource.title;
    `);

    response.json(result.rows);
  } catch (error) {
    console.error("Could not load published resources:", error.message);
    response.status(500).json({ error: "Could not load resources." });
  }
});

app.use((error, request, response, next) => {
  if (error.type === "entity.too.large" && request.path === "/api/hr/resources/upload") {
    return response.status(413).json({ error: "O arquivo excede o limite de 25 MB." });
  }
  return next(error);
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found." });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`OnRamp local API listening at http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
