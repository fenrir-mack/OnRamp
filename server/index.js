import express from "express";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { pool } from "./db.js";
import { checkFileStorage, getStoredFileContentType, readStoredFile, removeStoredFile, storeFile } from "./file-storage.js";

const scrypt = promisify(scryptCallback);
const sessionCookieName = "onramp_session";
const sessionDurationMs = 12 * 60 * 60 * 1000;
const rememberedSessionDurationMs = 30 * 24 * 60 * 60 * 1000;

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
const listenHost = process.env.HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const maximumResourceFileSize = 25 * 1024 * 1024;
const maximumProfilePhotoSize = 2 * 1024 * 1024;
const profilePhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"];
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
        SELECT plan_task.employee_plan_task_id AS id, stage.stage_code AS "stageCode", plan_task.title, plan_task.description,
          plan_task.category, plan_task.task_type AS "taskType", plan_task.owner_role AS "ownerRole",
          plan_task.owner_employee_id AS "ownerEmployeeId", task_owner.full_name AS "ownerName",
          plan_task.due_offset_days AS "dueOffsetDays", plan_task.is_required AS required,
          COALESCE(progress.is_completed, FALSE) AS completed,
          COALESCE((SELECT json_agg(json_build_object('id', issue.employee_plan_task_issue_id, 'description', issue.description, 'createdAt', issue.created_at) ORDER BY issue.created_at DESC)
            FROM public.employee_plan_task_issues AS issue
            WHERE issue.employee_plan_task_id = plan_task.employee_plan_task_id AND issue.employee_id = $1), '[]'::json) AS issues
        FROM public.employee_plan_tasks AS plan_task
        INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
        LEFT JOIN public.employees AS task_owner ON task_owner.employee_id = plan_task.owner_employee_id
        LEFT JOIN public.employee_plan_task_progress AS progress
          ON progress.employee_plan_task_id = plan_task.employee_plan_task_id AND progress.employee_id = $1
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

app.patch("/api/me/plan/tasks/:taskId", requireAuthenticated, async (request, response) => {
  const taskId = parseAccountId(request.params.taskId);
  const completed = request.body?.completed;
  if (!taskId || typeof completed !== "boolean") return response.status(400).json({ error: "Informe uma tarefa e seu estado de conclusão." });
  const employeeId = request.authenticatedEmployee.employee_id;
  try {
    const task = await pool.query("SELECT 1 FROM public.employee_plan_tasks WHERE employee_plan_task_id = $1 AND employee_id = $2", [taskId, employeeId]);
    if (!task.rowCount) return response.status(404).json({ error: "Tarefa não encontrada na sua jornada." });
    await pool.query(`
      INSERT INTO public.employee_plan_task_progress (employee_plan_task_id, employee_id, is_completed, completed_at, updated_at)
      VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_plan_task_id) DO UPDATE
      SET is_completed = EXCLUDED.is_completed, completed_at = EXCLUDED.completed_at, updated_at = CURRENT_TIMESTAMP
    `, [taskId, employeeId, completed]);
    return response.json({ id: taskId, completed });
  } catch (error) {
    console.error("Could not save employee task progress:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar o progresso da tarefa." });
  }
});

app.post("/api/me/plan/tasks/:taskId/issues", requireAuthenticated, async (request, response) => {
  const taskId = parseAccountId(request.params.taskId);
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  if (!taskId || !description || description.length > 2000) return response.status(400).json({ error: "Descreva o problema em até 2.000 caracteres." });
  const employeeId = request.authenticatedEmployee.employee_id;
  try {
    const task = await pool.query("SELECT 1 FROM public.employee_plan_tasks WHERE employee_plan_task_id = $1 AND employee_id = $2", [taskId, employeeId]);
    if (!task.rowCount) return response.status(404).json({ error: "Tarefa não encontrada na sua jornada." });
    const result = await pool.query(`
      INSERT INTO public.employee_plan_task_issues (employee_plan_task_id, employee_id, description)
      VALUES ($1, $2, $3)
      RETURNING employee_plan_task_issue_id AS id, description, created_at AS "createdAt"
    `, [taskId, employeeId, description]);
    return response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Could not save employee task issue:", error.message);
    return response.status(500).json({ error: "Não foi possível enviar o problema." });
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

function parseOrganizationIds(value, legacyId) {
  const values = Array.isArray(value) ? value : legacyId == null || legacyId === "" ? [] : [legacyId];
  if (values.length > 100) return null;
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return null;
  return [...new Set(ids)];
}

async function validateOrganizationIds(departmentIds, teamIds) {
  if (departmentIds === null || teamIds === null) return "Selecione áreas e equipes válidas.";
  const [departments, teams] = await Promise.all([
    departmentIds.length ? pool.query("SELECT department_id FROM public.departments WHERE department_id = ANY($1::int[])", [departmentIds]) : { rowCount: 0 },
    teamIds.length ? pool.query("SELECT team_id FROM public.teams WHERE is_active IS TRUE AND team_id = ANY($1::int[])", [teamIds]) : { rowCount: 0 },
  ]);
  if (departments.rowCount !== departmentIds.length) return "Uma ou mais áreas selecionadas não existem.";
  if (teams.rowCount !== teamIds.length) return "Uma ou mais equipes selecionadas não existem ou estão inativas.";
  return null;
}

async function validateActiveEmployeeIds(employeeIds) {
  if (employeeIds === null) return "Selecione pessoas válidas para a equipe.";
  const people = employeeIds.length
    ? await pool.query("SELECT employee_id FROM public.employees WHERE is_active IS TRUE AND employee_id = ANY($1::int[])", [employeeIds])
    : { rowCount: 0 };
  return people.rowCount === employeeIds.length ? null : "Uma ou mais pessoas selecionadas não existem ou estão inativas.";
}

async function validateTeamParent(parentTeamId, teamId = null) {
  if (parentTeamId === null) return null;
  const parent = await pool.query("SELECT 1 FROM public.teams WHERE team_id = $1 AND is_active IS TRUE", [parentTeamId]);
  if (!parent.rowCount) return "A equipe superior não existe ou está inativa.";
  if (teamId === null) return null;
  const descendant = await pool.query(`
    WITH RECURSIVE descendants AS (
      SELECT team_id FROM public.teams WHERE parent_team_id = $1
      UNION ALL
      SELECT team.team_id FROM public.teams AS team
      INNER JOIN descendants ON team.parent_team_id = descendants.team_id
    )
    SELECT 1 FROM descendants WHERE team_id = $2 LIMIT 1
  `, [teamId, parentTeamId]);
  return descendant.rowCount ? "Uma equipe não pode ficar subordinada a ela mesma ou a uma subequipe sua." : null;
}

async function saveTeamPeople(client, teamId, memberIds, leaderIds) {
  const allMemberIds = [...new Set([...memberIds, ...leaderIds])];
  await client.query("DELETE FROM public.team_leaders WHERE team_id = $1", [teamId]);
  await client.query("DELETE FROM public.employee_teams WHERE team_id = $1", [teamId]);
  await client.query("UPDATE public.teams SET lead_employee_id = $2 WHERE team_id = $1", [teamId, leaderIds[0] ?? null]);
  for (const leaderId of leaderIds) {
    await client.query("INSERT INTO public.team_leaders (team_id, employee_id) VALUES ($1, $2)", [teamId, leaderId]);
  }
  for (const memberId of allMemberIds) {
    await client.query(`
      INSERT INTO public.employee_teams (employee_id, team_id, team_role)
      VALUES ($1, $2, CASE WHEN $3::int[] @> ARRAY[$1] THEN 'Líder' ELSE NULL END)
    `, [memberId, teamId, leaderIds]);
  }
}

async function saveEmployeeOrganization(client, employeeId, departmentIds, teamIds) {
  await client.query("DELETE FROM public.employee_departments WHERE employee_id = $1", [employeeId]);
  await client.query("DELETE FROM public.employee_teams WHERE employee_id = $1", [employeeId]);
  for (const [index, departmentId] of departmentIds.entries()) {
    await client.query(`
      INSERT INTO public.employee_departments (employee_id, department_id, is_primary)
      VALUES ($1, $2, $3)
    `, [employeeId, departmentId, index === 0]);
  }
  const leaderTeams = await client.query("SELECT team_id FROM public.team_leaders WHERE employee_id = $1", [employeeId]);
  const assignedTeamIds = [...new Set([...teamIds, ...leaderTeams.rows.map(({ team_id }) => team_id)])];
  for (const teamId of assignedTeamIds) {
    await client.query(`
      INSERT INTO public.employee_teams (employee_id, team_id, team_role)
      VALUES ($1, $2, CASE WHEN EXISTS (
        SELECT 1 FROM public.team_leaders WHERE employee_id = $1 AND team_id = $2
      ) THEN 'Líder' ELSE NULL END)
    `, [employeeId, teamId]);
  }
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
        (SELECT string_agg(department.name, ', ' ORDER BY department.name)
          FROM public.employee_departments AS membership
          INNER JOIN public.departments AS department ON department.department_id = membership.department_id
          WHERE membership.employee_id = employee.employee_id) AS department,
        COALESCE((SELECT json_agg(membership.department_id ORDER BY department.name)
          FROM public.employee_departments AS membership
          INNER JOIN public.departments AS department ON department.department_id = membership.department_id
          WHERE membership.employee_id = employee.employee_id), '[]'::json) AS "departmentIds",
        COALESCE((SELECT json_agg(department.name ORDER BY department.name)
          FROM public.employee_departments AS membership
          INNER JOIN public.departments AS department ON department.department_id = membership.department_id
          WHERE membership.employee_id = employee.employee_id), '[]'::json) AS departments,
        COALESCE((SELECT json_agg(membership.team_id ORDER BY team.name)
          FROM public.employee_teams AS membership
          INNER JOIN public.teams AS team ON team.team_id = membership.team_id
          WHERE membership.employee_id = employee.employee_id AND team.is_active IS TRUE), '[]'::json) AS "teamIds",
        COALESCE((SELECT json_agg(team.name ORDER BY team.name)
          FROM public.employee_teams AS membership
          INNER JOIN public.teams AS team ON team.team_id = membership.team_id
          WHERE membership.employee_id = employee.employee_id AND team.is_active IS TRUE), '[]'::json) AS teams,
        employee.manager_employee_id AS "managerEmployeeId",
        manager.full_name AS "managerName", employee.is_active AS "isActive",
        (SELECT COUNT(*)::int FROM public.employee_plan_tasks AS plan_task
          WHERE plan_task.employee_id = employee.employee_id) AS "planTaskCount"
      FROM public.employees AS employee
      LEFT JOIN public.employees AS manager ON manager.employee_id = employee.manager_employee_id
      WHERE employee.is_hr_admin IS FALSE
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
        employee.job_title AS "jobTitle",
        (SELECT string_agg(department.name, ', ' ORDER BY department.name)
          FROM public.employee_departments AS membership
          INNER JOIN public.departments AS department ON department.department_id = membership.department_id
          WHERE membership.employee_id = employee.employee_id) AS department
      FROM public.employees AS employee
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
    const result = await pool.query(`
      SELECT department.department_id AS id, department.name, department.description,
        COUNT(membership.employee_id)::int AS "memberCount"
      FROM public.departments AS department
      LEFT JOIN public.employee_departments AS membership ON membership.department_id = department.department_id
      GROUP BY department.department_id
      ORDER BY department.name;
    `);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load departments for HR:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as áreas." });
  }
});

app.post("/api/hr/departments", requireHr, async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  if (!name || name.length > 100 || description.length > 300) return response.status(400).json({ error: "Informe o nome da área e uma descrição de até 300 caracteres." });
  try {
    const result = await pool.query(`
      INSERT INTO public.departments (name, description) VALUES ($1, NULLIF($2, ''))
      RETURNING department_id AS id, name, description, 0::int AS "memberCount"
    `, [name, description]);
    return response.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Já existe uma área com esse nome." });
    console.error("Could not create HR department:", error.message);
    return response.status(500).json({ error: "Não foi possível criar a área." });
  }
});

app.patch("/api/hr/departments/:departmentId", requireHr, async (request, response) => {
  const departmentId = parseAccountId(request.params.departmentId);
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  if (!departmentId) return response.status(400).json({ error: "Área inválida." });
  if (!name || name.length > 100 || description.length > 300) return response.status(400).json({ error: "Informe o nome da área e uma descrição de até 300 caracteres." });
  try {
    const result = await pool.query(`
      UPDATE public.departments SET name = $2, description = NULLIF($3, '')
      WHERE department_id = $1
      RETURNING department_id AS id, name, description
    `, [departmentId, name, description]);
    if (!result.rowCount) return response.status(404).json({ error: "Área não encontrada." });
    return response.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Já existe uma área com esse nome." });
    console.error("Could not update HR department:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar a área." });
  }
});

app.get("/api/hr/teams", requireHr, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT team.team_id AS id, team.name, team.description,
        team.parent_team_id AS "parentTeamId", parent.name AS "parentTeamName",
        COALESCE((SELECT json_agg(membership.employee_id ORDER BY employee.full_name)
          FROM public.employee_teams AS membership
          INNER JOIN public.employees AS employee ON employee.employee_id = membership.employee_id
          WHERE membership.team_id = team.team_id), '[]'::json) AS "memberIds",
        (SELECT COUNT(*)::int FROM public.employee_teams AS membership
          WHERE membership.team_id = team.team_id) AS "memberCount",
        COALESCE((SELECT json_agg(leader.employee_id ORDER BY employee.full_name)
          FROM public.team_leaders AS leader
          INNER JOIN public.employees AS employee ON employee.employee_id = leader.employee_id
          WHERE leader.team_id = team.team_id), '[]'::json) AS "leaderIds",
        COALESCE((SELECT json_agg(employee.full_name ORDER BY employee.full_name)
          FROM public.team_leaders AS leader
          INNER JOIN public.employees AS employee ON employee.employee_id = leader.employee_id
          WHERE leader.team_id = team.team_id), '[]'::json) AS leaders
      FROM public.teams AS team
      LEFT JOIN public.teams AS parent ON parent.team_id = team.parent_team_id
      WHERE team.is_active IS TRUE
      ORDER BY parent.name NULLS FIRST, team.name;
    `);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load HR teams:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as equipes." });
  }
});

app.post("/api/hr/teams", requireHr, async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  const rawParentTeamId = request.body?.parentTeamId;
  const parentTeamId = rawParentTeamId == null || rawParentTeamId === "" ? null : parseAccountId(rawParentTeamId);
  const memberIds = parseOrganizationIds(request.body?.memberIds);
  const leaderIds = parseOrganizationIds(request.body?.leaderIds);
  if (!name || name.length > 120 || description.length > 300) return response.status(400).json({ error: "Informe o nome da equipe e uma descrição de até 300 caracteres." });
  if (rawParentTeamId != null && rawParentTeamId !== "" && parentTeamId === null) return response.status(400).json({ error: "Selecione uma equipe superior válida." });
  const peopleError = await validateActiveEmployeeIds(memberIds === null || leaderIds === null ? null : [...new Set([...memberIds, ...leaderIds])]);
  if (peopleError) return response.status(400).json({ error: peopleError });
  try {
    const parentError = await validateTeamParent(parentTeamId);
    if (parentError) return response.status(400).json({ error: parentError });
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const result = await client.query(`
        INSERT INTO public.teams (name, description, parent_team_id)
        VALUES ($1, NULLIF($2, ''), $3)
        RETURNING team_id AS id, name, description, parent_team_id AS "parentTeamId"
      `, [name, description, parentTeamId]);
      await saveTeamPeople(client, result.rows[0].id, memberIds, leaderIds);
      await client.query("COMMIT");
      transactionStarted = false;
      return response.status(201).json({ ...result.rows[0], memberIds: [...new Set([...memberIds, ...leaderIds])], leaderIds });
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Já existe uma equipe com esse nome." });
    console.error("Could not create HR team:", error.message);
    return response.status(500).json({ error: "Não foi possível criar a equipe." });
  }
});

app.patch("/api/hr/teams/:teamId", requireHr, async (request, response) => {
  const teamId = parseAccountId(request.params.teamId);
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  const rawParentTeamId = request.body?.parentTeamId;
  const parentTeamId = rawParentTeamId == null || rawParentTeamId === "" ? null : parseAccountId(rawParentTeamId);
  const memberIds = parseOrganizationIds(request.body?.memberIds);
  const leaderIds = parseOrganizationIds(request.body?.leaderIds);
  if (!teamId) return response.status(400).json({ error: "Equipe inválida." });
  if (!name || name.length > 120 || description.length > 300) return response.status(400).json({ error: "Informe o nome da equipe e uma descrição de até 300 caracteres." });
  if (rawParentTeamId != null && rawParentTeamId !== "" && parentTeamId === null) return response.status(400).json({ error: "Selecione uma equipe superior válida." });
  if (parentTeamId === teamId) return response.status(400).json({ error: "Uma equipe não pode ser superior dela mesma." });
  const peopleError = await validateActiveEmployeeIds(memberIds === null || leaderIds === null ? null : [...new Set([...memberIds, ...leaderIds])]);
  if (peopleError) return response.status(400).json({ error: peopleError });
  try {
    const parentError = await validateTeamParent(parentTeamId, teamId);
    if (parentError) return response.status(400).json({ error: parentError });
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const result = await client.query(`
        UPDATE public.teams SET name = $2, description = NULLIF($3, ''), parent_team_id = $4
        WHERE team_id = $1 AND is_active IS TRUE
        RETURNING team_id AS id, name, description, parent_team_id AS "parentTeamId"
      `, [teamId, name, description, parentTeamId]);
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return response.status(404).json({ error: "Equipe não encontrada." });
      }
      await saveTeamPeople(client, teamId, memberIds, leaderIds);
      await client.query("COMMIT");
      transactionStarted = false;
      return response.json({ ...result.rows[0], memberIds: [...new Set([...memberIds, ...leaderIds])], leaderIds });
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "Já existe uma equipe com esse nome." });
    console.error("Could not update HR team:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar a equipe." });
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
  const mimeType = (request.get("x-file-type") ?? "application/octet-stream").toLowerCase().split(";")[0].trim() || "application/octet-stream";
  const contents = request.body;
  if (!Buffer.isBuffer(contents)) return response.status(400).json({ error: "Envie um arquivo válido." });
  if (!title || title.length > 180 || description.length > 1200 || !categorySlug || originalName.length < 1 || originalName.length > 255) {
    return response.status(400).json({ error: "Confira o título, a categoria, a descrição e o nome do arquivo." });
  }
  if (!contents.length || contents.length > maximumResourceFileSize) return response.status(400).json({ error: "O arquivo deve ter até 25 MB e não pode estar vazio." });
  if (mimeType.length > 120) return response.status(400).json({ error: "O tipo do arquivo é inválido." });
  const client = await pool.connect();
  const storageKey = randomUUID();
  let fileStored = false;
  let transactionStarted = false;
  try {
    const category = await client.query("SELECT resource_category_id AS id, name FROM public.resource_categories WHERE slug = $1", [categorySlug]);
    if (!category.rowCount) return response.status(400).json({ error: "A categoria selecionada não existe." });
    const extension = path.extname(originalName).slice(1).toUpperCase() || "ARQUIVO";
    await client.query("BEGIN");
    transactionStarted = true;
    const resource = await client.query(`
      INSERT INTO public.resources (
        resource_category_id, title, description, format, mime_type, owner_employee_id, status
      ) VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, 'draft')
      RETURNING resource_id AS id
    `, [category.rows[0].id, title, description, extension, mimeType, request.authenticatedEmployee.employee_id]);
    await storeFile(storageKey, contents, mimeType);
    fileStored = true;
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
    if (fileStored) await removeStoredFile(storageKey).catch(() => undefined);
    console.error("Could not store HR resource:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar o arquivo e seus dados." });
  } finally {
    client.release();
  }
});

app.post("/api/hr/resources/link", requireHr, async (request, response) => {
  const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  const categorySlug = typeof request.body?.categorySlug === "string" ? request.body.categorySlug.trim() : "";
  const externalUrl = typeof request.body?.externalUrl === "string" ? request.body.externalUrl.trim() : "";
  let parsedUrl;
  try { parsedUrl = new URL(externalUrl); } catch { return response.status(400).json({ error: "Informe um link válido." }); }
  if (!title || title.length > 180 || description.length > 1200 || !categorySlug || externalUrl.length > 1000 || !["http:", "https:"].includes(parsedUrl.protocol)) {
    return response.status(400).json({ error: "Confira o título, a descrição, a categoria e o link do material." });
  }
  try {
    const result = await pool.query(`
      INSERT INTO public.resources (
        resource_category_id, title, description, format, mime_type, owner_employee_id,
        external_url, status
      )
      SELECT category.resource_category_id, $2, NULLIF($3, ''), 'LINK', 'text/uri-list', $4, $5, 'published'
      FROM public.resource_categories AS category
      WHERE category.slug = $1
      RETURNING resource_id AS id
    `, [categorySlug, title, description, request.authenticatedEmployee.employee_id, externalUrl]);
    if (!result.rowCount) return response.status(400).json({ error: "A categoria selecionada não existe." });
    return response.status(201).json({ id: result.rows[0].id, title, description: description || null, format: "LINK", external_url: externalUrl });
  } catch (error) {
    console.error("Could not store HR resource link:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar o link do material." });
  }
});

app.patch("/api/hr/resources/:resourceId", requireHr, async (request, response) => {
  const resourceId = parseAccountId(request.params.resourceId);
  const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  const categorySlug = typeof request.body?.categorySlug === "string" ? request.body.categorySlug.trim() : "";
  const sourceType = request.body?.sourceType;
  const externalUrl = typeof request.body?.externalUrl === "string" ? request.body.externalUrl.trim() : "";
  if (!resourceId) return response.status(400).json({ error: "Material inválido." });
  if (!title || title.length > 180 || description.length > 1200 || !categorySlug || !["file", "link"].includes(sourceType)) {
    return response.status(400).json({ error: "Confira o título, a descrição, a categoria e o tipo do material." });
  }
  let parsedUrl;
  if (sourceType === "link") {
    try { parsedUrl = new URL(externalUrl); } catch { return response.status(400).json({ error: "Informe um link válido." }); }
    if (externalUrl.length > 1000 || !["http:", "https:"].includes(parsedUrl.protocol)) return response.status(400).json({ error: "Informe um link HTTP ou HTTPS válido." });
  }
  const client = await pool.connect();
  let oldStorageKey = null;
  let transactionStarted = false;
  try {
    const category = await client.query("SELECT resource_category_id FROM public.resource_categories WHERE slug = $1", [categorySlug]);
    if (!category.rowCount) return response.status(400).json({ error: "A categoria selecionada não existe." });
    const existing = await client.query(`
      SELECT resource.external_url, resource_file.storage_key
      FROM public.resources AS resource
      LEFT JOIN public.resource_files AS resource_file ON resource_file.resource_id = resource.resource_id
      WHERE resource.resource_id = $1 AND resource.status = 'published'
      FOR UPDATE OF resource
    `, [resourceId]);
    if (!existing.rowCount) return response.status(404).json({ error: "Material não encontrado ou não editável." });
    if (sourceType === "file" && existing.rows[0].external_url) {
      return response.status(400).json({ error: "Selecione um arquivo novo para trocar o link por arquivo." });
    }
    oldStorageKey = sourceType === "link" ? existing.rows[0].storage_key : null;
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(`
      UPDATE public.resources
      SET resource_category_id = $2, title = $3, description = NULLIF($4, ''),
        format = CASE WHEN $5 = 'link' THEN 'LINK' ELSE format END,
        mime_type = CASE WHEN $5 = 'link' THEN 'text/uri-list' ELSE mime_type END,
        external_url = CASE WHEN $5 = 'link' THEN $6 ELSE external_url END,
        blob_name = CASE WHEN $5 = 'link' THEN NULL ELSE blob_name END,
        owner_employee_id = COALESCE(owner_employee_id, $7),
        updated_at = CURRENT_TIMESTAMP
      WHERE resource_id = $1
    `, [resourceId, category.rows[0].resource_category_id, title, description, sourceType, sourceType === "link" ? externalUrl : null, request.authenticatedEmployee.employee_id]);
    if (sourceType === "link") await client.query("DELETE FROM public.resource_files WHERE resource_id = $1", [resourceId]);
    await client.query("COMMIT");
    transactionStarted = false;
    if (oldStorageKey && /^[0-9a-f-]{36}$/i.test(oldStorageKey)) await removeStoredFile(oldStorageKey).catch(() => undefined);
    return response.json({ id: resourceId, title, description: description || null, category: categorySlug, format: sourceType === "link" ? "LINK" : undefined, external_url: sourceType === "link" ? externalUrl : null });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not update HR resource:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar o material." });
  } finally {
    client.release();
  }
});

app.put("/api/hr/resources/:resourceId/file", requireHr, express.raw({ type: "application/octet-stream", limit: maximumResourceFileSize }), async (request, response) => {
  const resourceId = parseAccountId(request.params.resourceId);
  const decodeHeader = (name) => {
    try { return decodeURIComponent(request.get(name) ?? ""); } catch { return ""; }
  };
  const title = decodeHeader("x-resource-title").trim();
  const description = decodeHeader("x-resource-description").trim();
  const categorySlug = decodeHeader("x-resource-category").trim();
  const originalName = path.basename(decodeHeader("x-file-name").replaceAll("\\", "/"));
  const mimeType = (request.get("x-file-type") ?? "application/octet-stream").toLowerCase().split(";")[0].trim() || "application/octet-stream";
  const contents = request.body;
  if (!resourceId || !Buffer.isBuffer(contents) || !title || title.length > 180 || description.length > 1200 || !categorySlug || !originalName || originalName.length > 255 || mimeType.length > 120) {
    return response.status(400).json({ error: "Confira os dados do material e o arquivo selecionado." });
  }
  if (!contents.length || contents.length > maximumResourceFileSize) return response.status(400).json({ error: "O arquivo deve ter até 25 MB e não pode estar vazio." });
  const client = await pool.connect();
  let fileStored = false;
  let transactionStarted = false;
  let oldStorageKey = null;
  let storageKey;
  try {
    const category = await client.query("SELECT resource_category_id FROM public.resource_categories WHERE slug = $1", [categorySlug]);
    if (!category.rowCount) return response.status(400).json({ error: "A categoria selecionada não existe." });
    const existing = await client.query(`
      SELECT resource_file.storage_key
      FROM public.resources AS resource
      LEFT JOIN public.resource_files AS resource_file ON resource_file.resource_id = resource.resource_id
      WHERE resource.resource_id = $1 AND resource.status = 'published'
    `, [resourceId]);
    if (!existing.rowCount) return response.status(404).json({ error: "Material não encontrado ou não editável." });
    oldStorageKey = existing.rows[0].storage_key;
    storageKey = randomUUID();
    const extension = path.extname(originalName).slice(1).toUpperCase() || "ARQUIVO";
    await storeFile(storageKey, contents, mimeType);
    fileStored = true;
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(`
      UPDATE public.resources
      SET resource_category_id = $2, title = $3, description = NULLIF($4, ''),
        format = $5, mime_type = $6, external_url = NULL, blob_name = $7,
        owner_employee_id = COALESCE(owner_employee_id, $8),
        status = 'published', updated_at = CURRENT_TIMESTAMP
      WHERE resource_id = $1
    `, [resourceId, category.rows[0].resource_category_id, title, description, extension, mimeType, `private:${storageKey}`, request.authenticatedEmployee.employee_id]);
    await client.query("DELETE FROM public.resource_files WHERE resource_id = $1", [resourceId]);
    await client.query(`
      INSERT INTO public.resource_files (
        resource_id, storage_key, original_file_name, mime_type, size_bytes, sha256, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [resourceId, storageKey, originalName, mimeType, contents.length, createHash("sha256").update(contents).digest("hex"), request.authenticatedEmployee.employee_id]);
    await client.query("COMMIT");
    transactionStarted = false;
    if (oldStorageKey && /^[0-9a-f-]{36}$/i.test(oldStorageKey)) await removeStoredFile(oldStorageKey).catch(() => undefined);
    return response.json({ id: resourceId, title, description: description || null, format: extension, mime_type: mimeType });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
    if (fileStored) await removeStoredFile(storageKey).catch(() => undefined);
    console.error("Could not replace HR resource file:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar o arquivo do material." });
  } finally {
    client.release();
  }
});

app.post("/api/hr/accounts", requireHr, async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const jobTitle = typeof request.body?.jobTitle === "string" ? request.body.jobTitle.trim() : "";
  const departmentIds = parseOrganizationIds(request.body?.departmentIds, request.body?.departmentId);
  const teamIds = parseOrganizationIds(request.body?.teamIds);
  const departmentId = departmentIds?.[0] ?? null;
  const managerEmployeeId = request.body?.managerEmployeeId === "" || request.body?.managerEmployeeId == null ? null : Number(request.body.managerEmployeeId);
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!name || name.length > 160 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Informe nome e um e-mail válido." });
  }
  if (jobTitle.length > 120) return response.status(400).json({ error: "O cargo pode ter até 120 caracteres." });
  if (!password || password.length < 8 || password.length > 1024) {
    return response.status(400).json({ error: "A senha inicial deve ter entre 8 e 1.024 caracteres." });
  }
  if (managerEmployeeId !== null && (!Number.isSafeInteger(managerEmployeeId) || managerEmployeeId <= 0)) {
    return response.status(400).json({ error: "Selecione uma liderança válida." });
  }

  try {
    const organizationError = await validateOrganizationIds(departmentIds, teamIds);
    if (organizationError) return response.status(400).json({ error: organizationError });
    if (managerEmployeeId !== null) {
      const manager = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_active IS TRUE AND is_hr_admin IS FALSE", [managerEmployeeId]);
      if (!manager.rowCount) return response.status(400).json({ error: "A liderança selecionada não existe ou está inativa." });
    }
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const result = await client.query(`
      INSERT INTO public.employees (email, full_name, job_title, department_id, manager_employee_id, password_hash, is_hr_admin)
      VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, FALSE)
      RETURNING employee_id AS id, full_name AS name, email, job_title AS "jobTitle",
        department_id AS "departmentId", manager_employee_id AS "managerEmployeeId", TRUE AS "isActive"
      `, [email, name, jobTitle, departmentId, managerEmployeeId, passwordHash]);
      await saveEmployeeOrganization(client, result.rows[0].id, departmentIds, teamIds);
      await client.query("COMMIT");
      transactionStarted = false;
      return response.status(201).json({ ...result.rows[0], departmentIds, teamIds });
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
  const departmentIds = parseOrganizationIds(request.body?.departmentIds, request.body?.departmentId);
  const teamIds = parseOrganizationIds(request.body?.teamIds);
  const departmentId = departmentIds?.[0] ?? null;
  const managerEmployeeId = request.body?.managerEmployeeId === "" || request.body?.managerEmployeeId == null ? null : Number(request.body.managerEmployeeId);
  const isActive = request.body?.isActive;
  if (!name || name.length > 160 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Informe nome e um e-mail válido." });
  }
  if (jobTitle.length > 120) return response.status(400).json({ error: "O cargo pode ter até 120 caracteres." });
  if (typeof isActive !== "boolean") return response.status(400).json({ error: "Informe se a conta está ativa." });
  if (managerEmployeeId !== null && (!Number.isSafeInteger(managerEmployeeId) || managerEmployeeId <= 0 || managerEmployeeId === accountId)) return response.status(400).json({ error: "Selecione uma liderança válida." });
  try {
    const organizationError = await validateOrganizationIds(departmentIds, teamIds);
    if (organizationError) return response.status(400).json({ error: organizationError });
    const target = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_hr_admin IS FALSE", [accountId]);
    if (!target.rowCount) return response.status(404).json({ error: "Pessoa não encontrada." });
    if (managerEmployeeId !== null) {
      const manager = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_hr_admin IS FALSE", [managerEmployeeId]);
      if (!manager.rowCount) return response.status(400).json({ error: "A liderança selecionada não existe ou está inativa." });
    }
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const result = await client.query(`
      UPDATE public.employees AS employee SET email = $2, full_name = $3,
        job_title = NULLIF($4, ''), department_id = $5, manager_employee_id = $6, is_active = $7
      WHERE employee.employee_id = $1 AND employee.is_hr_admin IS FALSE
      RETURNING employee.employee_id AS id, employee.full_name AS name, employee.email,
        employee.job_title AS "jobTitle", employee.department_id AS "departmentId",
        employee.manager_employee_id AS "managerEmployeeId", employee.is_active AS "isActive"
      `, [accountId, email, name, jobTitle, departmentId, managerEmployeeId, isActive]);
      await saveEmployeeOrganization(client, accountId, departmentIds, teamIds);
      await client.query("COMMIT");
      transactionStarted = false;
      return response.json({ ...result.rows[0], departmentIds, teamIds });
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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

app.get("/api/health/storage", async (_request, response) => {
  try {
    const storage = await checkFileStorage();
    return response.json({ status: "ok", storage });
  } catch (error) {
    console.error("File storage health check failed:", error.message);
    return response.status(503).json({ status: "error", storage: "unavailable" });
  }
});

app.get("/api/me/profile-photo", requireAuthenticated, async (request, response) => {
  const storageKey = `profile-${request.authenticatedEmployee.employee_id}`;
  try {
    const [contents, mimeType] = await Promise.all([
      readStoredFile(storageKey),
      getStoredFileContentType(storageKey),
    ]);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.type(mimeType);
    return response.send(contents);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "BlobNotFound") return response.status(404).json({ error: "Foto de perfil não encontrada." });
    console.error("Could not load profile photo:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar a foto de perfil." });
  }
});

app.get("/api/employees/:employeeId/profile-photo", requireAuthenticated, async (request, response) => {
  const employeeId = parseAccountId(request.params.employeeId);
  if (!employeeId) return response.status(400).json({ error: "Pessoa inválida." });
  try {
    const employee = await pool.query("SELECT is_active FROM public.employees WHERE employee_id = $1", [employeeId]);
    if (!employee.rowCount || (!employee.rows[0].is_active && request.authenticatedEmployee.is_hr_admin !== true)) {
      return response.status(404).json({ error: "Foto de perfil não encontrada." });
    }
    const storageKey = `profile-${employeeId}`;
    const [contents, mimeType] = await Promise.all([
      readStoredFile(storageKey),
      getStoredFileContentType(storageKey),
    ]);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.type(mimeType);
    return response.send(contents);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "BlobNotFound") return response.status(404).json({ error: "Foto de perfil não encontrada." });
    console.error("Could not load employee profile photo:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar a foto de perfil." });
  }
});

app.put("/api/me/profile-photo", requireAuthenticated, express.raw({ type: profilePhotoMimeTypes, limit: maximumProfilePhotoSize }), async (request, response) => {
  const mimeType = (request.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
  const contents = request.body;
  if (!profilePhotoMimeTypes.includes(mimeType) || !Buffer.isBuffer(contents) || !contents.length || contents.length > maximumProfilePhotoSize) {
    return response.status(400).json({ error: "Envie uma foto PNG, JPG ou WebP de até 2 MB." });
  }

  const storageKey = `profile-${request.authenticatedEmployee.employee_id}`;
  try {
    await storeFile(storageKey, contents, mimeType, { overwrite: true });
    return response.json({ status: "ok" });
  } catch (error) {
    console.error("Could not save profile photo:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar a foto de perfil." });
  }
});

app.delete("/api/me/profile-photo", requireAuthenticated, async (request, response) => {
  const storageKey = `profile-${request.authenticatedEmployee.employee_id}`;
  try {
    await removeStoredFile(storageKey);
    return response.status(204).end();
  } catch (error) {
    console.error("Could not delete profile photo:", error.message);
    return response.status(500).json({ error: "Não foi possível remover a foto de perfil." });
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

app.get("/api/organization", requireAuthenticated, async (_request, response) => {
  try {
    const [departmentResult, teamResult] = await Promise.all([
      pool.query(`
        SELECT department.department_id AS id, department.name, department.description,
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', employee.employee_id, 'name', employee.full_name, 'jobTitle', employee.job_title
            ) ORDER BY employee.full_name)
            FROM public.employee_departments AS membership
            INNER JOIN public.employees AS employee ON employee.employee_id = membership.employee_id
            WHERE membership.department_id = department.department_id AND employee.is_active IS TRUE
          ), '[]'::json) AS members
        FROM public.departments AS department
        ORDER BY department.name;
      `),
      pool.query(`
        SELECT team.team_id AS id, team.name, team.description,
          team.parent_team_id AS "parentTeamId", parent.name AS "parentTeamName",
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', employee.employee_id, 'name', employee.full_name, 'jobTitle', employee.job_title,
              'isLeader', EXISTS (SELECT 1 FROM public.team_leaders AS leader
                WHERE leader.team_id = team.team_id AND leader.employee_id = employee.employee_id)
            ) ORDER BY employee.full_name)
            FROM public.employee_teams AS membership
            INNER JOIN public.employees AS employee ON employee.employee_id = membership.employee_id
            WHERE membership.team_id = team.team_id AND employee.is_active IS TRUE
          ), '[]'::json) AS members,
          COALESCE((
            SELECT json_agg(json_build_object('id', employee.employee_id, 'name', employee.full_name, 'jobTitle', employee.job_title) ORDER BY employee.full_name)
            FROM public.team_leaders AS leader
            INNER JOIN public.employees AS employee ON employee.employee_id = leader.employee_id
            WHERE leader.team_id = team.team_id AND employee.is_active IS TRUE
          ), '[]'::json) AS leaders
        FROM public.teams AS team
        LEFT JOIN public.teams AS parent ON parent.team_id = team.parent_team_id
        WHERE team.is_active IS TRUE
        ORDER BY parent.name NULLS FIRST, team.name;
      `),
    ]);
    return response.json({ departments: departmentResult.rows, teams: teamResult.rows });
  } catch (error) {
    console.error("Could not load company directory:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as pessoas e áreas da empresa." });
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
      downloadName = resource.original_file_name;
      try {
        const contents = await readStoredFile(resource.storage_key);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.type(resource.fileMimeType ?? resource.mime_type ?? "application/octet-stream");
        response.attachment(downloadName);
        return response.send(contents);
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "BlobNotFound") return response.status(404).json({ error: "Arquivo não encontrado." });
        throw error;
      }
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

app.get("/api/resources", requireAuthenticated, async (request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        resource.resource_id AS id,
        resource.title,
        resource.description,
        resource.format,
        resource.mime_type,
        resource.owner_employee_id,
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
        AND ($1::boolean IS TRUE OR resource.owner_employee_id IS NOT NULL)
      ORDER BY category.name, resource.title;
    `, [request.authenticatedEmployee.is_hr_admin === true]);

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
  if (error.type === "entity.too.large" && request.path === "/api/me/profile-photo") {
    return response.status(413).json({ error: "A foto excede o limite de 2 MB." });
  }
  return next(error);
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found." });
});

const webRoot = path.resolve(process.cwd(), "dist");
app.use(express.static(webRoot));
app.get(/.*/, (_request, response, next) => {
  response.sendFile(path.join(webRoot, "index.html"), (error) => {
    if (error) next(error);
  });
});

const server = app.listen(port, listenHost, () => {
  console.log(`OnRamp server listening on ${listenHost}:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
