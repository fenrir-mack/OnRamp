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
          plan_task.responsible_department_id AS "responsibleDepartmentId",
          plan_task.due_offset_days AS "dueOffsetDays", plan_task.is_required AS required,
          CASE WHEN lower(plan_task.category) = 'equipamento' THEN plan_task.shipping_tracking_url END AS "trackingUrl",
          COALESCE(progress.is_completed, FALSE) AS completed,
          CASE WHEN progress.is_completed THEN 'ready' ELSE COALESCE(progress.status, 'not_started') END AS status,
          (COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days) AS "dueDate",
          (COALESCE(progress.is_completed, FALSE) IS FALSE
            AND COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days < CURRENT_DATE) AS overdue,
          COALESCE((SELECT json_agg(json_build_object('id', entry.id, 'actorName', entry.actor_name,
            'action', entry.action, 'newValue', entry.new_value, 'createdAt', entry.created_at) ORDER BY entry.created_at DESC)
            FROM (SELECT history.employee_plan_task_history_id AS id, actor.full_name AS actor_name,
              history.action, history.new_value, history.created_at FROM public.employee_plan_task_history AS history
              INNER JOIN public.employees AS actor ON actor.employee_id = history.actor_employee_id
              WHERE history.employee_plan_task_id = plan_task.employee_plan_task_id
              ORDER BY history.created_at DESC LIMIT 5) AS entry), '[]'::json) AS history,
          COALESCE((SELECT json_agg(json_build_object('id', issue.employee_plan_task_issue_id, 'description', issue.description, 'status', issue.status, 'resolutionNote', issue.resolution_note, 'createdAt', issue.created_at) ORDER BY issue.created_at DESC)
            FROM public.employee_plan_task_issues AS issue
            WHERE issue.employee_plan_task_id = plan_task.employee_plan_task_id AND issue.employee_id = $1
              AND (issue.status <> 'resolved' OR issue.resolved_at >= CURRENT_TIMESTAMP - INTERVAL '2 months')),
            '[]'::json) AS issues
        FROM public.employee_plan_tasks AS plan_task
        INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
        INNER JOIN public.employees AS employee ON employee.employee_id = plan_task.employee_id
        LEFT JOIN LATERAL (
          SELECT onboarding.start_date
          FROM public.onboardings AS onboarding
          WHERE onboarding.employee_id = employee.employee_id AND onboarding.status = 'active'
          ORDER BY onboarding.updated_at DESC, onboarding.onboarding_id DESC
          LIMIT 1
        ) AS onboarding ON TRUE
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
          AND (NOT EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id)
            OR EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id AND audience.employee_id = $1))
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

app.get("/api/me/plan/overdue-count", requireAuthenticated, async (request, response) => {
  const employeeId = request.authenticatedEmployee.employee_id;
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE stage.stage_code = 'pre-entry')::int AS "preEntryCount"
      FROM public.employee_plan_tasks AS plan_task
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
      INNER JOIN public.employees AS employee ON employee.employee_id = plan_task.employee_id
      LEFT JOIN public.employee_plan_task_progress AS progress
        ON progress.employee_plan_task_id = plan_task.employee_plan_task_id AND progress.employee_id = $1
      LEFT JOIN LATERAL (
        SELECT onboarding.start_date
        FROM public.onboardings AS onboarding
        WHERE onboarding.employee_id = employee.employee_id AND onboarding.status = 'active'
        ORDER BY onboarding.updated_at DESC, onboarding.onboarding_id DESC
        LIMIT 1
      ) AS onboarding ON TRUE
      WHERE plan_task.employee_id = $1
        AND COALESCE(progress.is_completed, FALSE) IS FALSE
        AND COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days < CURRENT_DATE
    `, [employeeId]);
    return response.json(result.rows[0] ?? { count: 0, preEntryCount: 0 });
  } catch (error) {
    console.error("Could not load overdue task count:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar os itens atrasados." });
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
      INSERT INTO public.employee_plan_task_progress (employee_plan_task_id, employee_id, is_completed, status, completed_at, updated_by_employee_id, updated_at)
      VALUES ($1, $2, $3, CASE WHEN $3 THEN 'ready' ELSE 'not_started' END, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_plan_task_id) DO UPDATE
      SET is_completed = EXCLUDED.is_completed, status = EXCLUDED.status,
        completed_at = EXCLUDED.completed_at, updated_by_employee_id = EXCLUDED.updated_by_employee_id, updated_at = CURRENT_TIMESTAMP
    `, [taskId, employeeId, completed]);
    await pool.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value)
      VALUES ($1, $2, 'employee_confirmation', $3)`, [taskId, employeeId, completed ? "ready" : "not_started"]);
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query("SELECT 1 FROM public.employee_plan_tasks WHERE employee_plan_task_id = $1 AND employee_id = $2", [taskId, employeeId]);
    if (!task.rowCount) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Tarefa não encontrada na sua jornada." });
    }
    const result = await client.query(`
      INSERT INTO public.employee_plan_task_issues (employee_plan_task_id, employee_id, description)
      VALUES ($1, $2, $3)
      RETURNING employee_plan_task_issue_id AS id, description, status, resolution_note AS "resolutionNote", created_at AS "createdAt"
    `, [taskId, employeeId, description]);
    const conversation = await client.query(`
      INSERT INTO public.employee_plan_task_issue_conversations (employee_plan_task_issue_id)
      VALUES ($1)
      RETURNING employee_plan_task_issue_conversation_id AS id
    `, [result.rows[0].id]);
    await client.query(`
      INSERT INTO public.employee_plan_task_issue_messages
        (employee_plan_task_issue_conversation_id, sender_employee_id, body, sent_at)
      VALUES ($1, $2, $3, $4)
    `, [conversation.rows[0].id, employeeId, description, result.rows[0].createdAt]);
    await client.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value)
      VALUES ($1, $2, 'issue_reported', $3)`, [taskId, employeeId, description]);
    await client.query("COMMIT");
    return response.status(201).json({ ...result.rows[0], conversationId: conversation.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not save employee task issue:", error.message);
    return response.status(500).json({ error: "Não foi possível enviar o problema." });
  } finally {
    client.release();
  }
});

app.get("/api/me/support-requests", requireAuthenticated, async (request, response) => {
  try {
    const result = await pool.query(`
      SELECT request.employee_support_request_id AS id, request.category, request.subject, request.description, request.status,
        request.follow_up_note AS "followUpNote", request.submitted_at AS "submittedAt", request.updated_at AS "updatedAt",
        EXISTS (SELECT 1 FROM public.employee_support_request_messages AS message WHERE message.employee_support_request_id = request.employee_support_request_id) AS "hasChat"
      FROM public.employee_support_requests AS request WHERE request.employee_id = $1
      ORDER BY request.submitted_at DESC, request.employee_support_request_id DESC
    `, [request.authenticatedEmployee.employee_id]);
    return response.json({ requests: result.rows });
  } catch (error) {
    console.error("Could not load employee support requests:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar seus pedidos." });
  }
});

app.post("/api/me/support-requests", requireAuthenticated, async (request, response) => {
  const category = request.body?.category;
  const subject = typeof request.body?.subject === "string" ? request.body.subject.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  if (!["question", "support"].includes(category) || !subject || subject.length > 180 || !description || description.length > 2000) {
    return response.status(400).json({ error: "Informe o tipo, o assunto e uma descrição de até 2.000 caracteres." });
  }
  try {
    const result = await pool.query(`
      INSERT INTO public.employee_support_requests (employee_id, category, subject, description)
      VALUES ($1, $2, $3, $4)
      RETURNING employee_support_request_id AS id, category, subject, description, status,
        follow_up_note AS "followUpNote", submitted_at AS "submittedAt", updated_at AS "updatedAt"
    `, [request.authenticatedEmployee.employee_id, category, subject, description]);
    return response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Could not create employee support request:", error.message);
    return response.status(500).json({ error: "Não foi possível enviar seu pedido." });
  }
});

app.get("/api/support/requests/:requestId/messages", requireAuthenticated, async (request, response) => {
  const requestId = parseAccountId(request.params.requestId);
  if (!requestId) return response.status(400).json({ error: "Pedido inválido." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  try {
    const supportRequest = await pool.query(`SELECT employee_support_request_id FROM public.employee_support_requests WHERE employee_support_request_id = $1 AND ($2::boolean OR employee_id = $3)`, [requestId, isHrAdmin, employeeId]);
    if (!supportRequest.rowCount) return response.status(404).json({ error: "Pedido não encontrado." });
    const messages = await pool.query(`
      SELECT message.employee_support_request_message_id AS id, message.sender_employee_id AS "senderEmployeeId",
        sender.full_name AS "senderName", message.body, message.sent_at AS "sentAt",
        (message.sender_employee_id = $2) AS "isMine"
      FROM public.employee_support_request_messages AS message
      INNER JOIN public.employees AS sender ON sender.employee_id = message.sender_employee_id
      WHERE message.employee_support_request_id = $1
      ORDER BY message.sent_at, message.employee_support_request_message_id
    `, [requestId, employeeId]);
    return response.json({ messages: messages.rows });
  } catch (error) {
    console.error("Could not load support request chat:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar o chat deste pedido." });
  }
});

app.get("/api/support/requests/conversations", requireAuthenticated, async (request, response) => {
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  try {
    const result = await pool.query(`
      SELECT support_request.employee_support_request_id AS id,
        support_request.employee_id AS "employeeId", employee.full_name AS "employeeName",
        department.name AS "employeeDepartment", support_request.subject, support_request.description,
        support_request.status, support_request.submitted_at AS "submittedAt",
        EXISTS (SELECT 1 FROM public.employee_support_request_messages AS message
          WHERE message.employee_support_request_id = support_request.employee_support_request_id) AS "hasChat",
        COALESCE(last_message.body, support_request.description) AS "lastMessage",
        COALESCE(last_message.sent_at, support_request.submitted_at) AS "lastMessageAt"
      FROM public.employee_support_requests AS support_request
      INNER JOIN public.employees AS employee ON employee.employee_id = support_request.employee_id
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      LEFT JOIN LATERAL (
        SELECT message.body, message.sent_at
        FROM public.employee_support_request_messages AS message
        WHERE message.employee_support_request_id = support_request.employee_support_request_id
        ORDER BY message.sent_at DESC, message.employee_support_request_message_id DESC LIMIT 1
      ) AS last_message ON TRUE
      WHERE ($1::boolean OR support_request.employee_id = $2)
      ORDER BY COALESCE(last_message.sent_at, support_request.submitted_at) DESC,
        support_request.employee_support_request_id DESC
    `, [isHrAdmin, employeeId]);
    return response.json({ conversations: result.rows });
  } catch (error) {
    console.error("Could not load support request conversations:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as conversas de pedidos gerais." });
  }
});

async function ensureSupportRequestOpeningMessage(client, requestId, requesterId, subject, description) {
  const openingBody = `${subject}\n\n${description}`;
  const existingOpening = await client.query(`
    SELECT 1 FROM public.employee_support_request_messages
    WHERE employee_support_request_id = $1 AND sender_employee_id = $2 AND body = $3 LIMIT 1
  `, [requestId, requesterId, openingBody]);
  if (existingOpening.rowCount) return false;
  const firstMessage = await client.query(`
    SELECT MIN(sent_at) AS "firstSentAt"
    FROM public.employee_support_request_messages
    WHERE employee_support_request_id = $1
  `, [requestId]);
  if (firstMessage.rows[0].firstSentAt) {
    await client.query(`
      INSERT INTO public.employee_support_request_messages (employee_support_request_id, sender_employee_id, body, sent_at)
      VALUES ($1, $2, $3, $4::timestamptz - INTERVAL '1 second')
    `, [requestId, requesterId, openingBody, firstMessage.rows[0].firstSentAt]);
  } else {
    await client.query(`
      INSERT INTO public.employee_support_request_messages (employee_support_request_id, sender_employee_id, body)
      VALUES ($1, $2, $3)
    `, [requestId, requesterId, openingBody]);
  }
  return true;
}

app.post("/api/support/requests/:requestId/start", requireHr, async (request, response) => {
  const requestId = parseAccountId(request.params.requestId);
  if (!requestId) return response.status(400).json({ error: "Pedido inválido." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const supportRequest = await client.query(`SELECT employee_support_request_id, employee_id, subject, description FROM public.employee_support_requests WHERE employee_support_request_id = $1 FOR UPDATE`, [requestId]);
    if (!supportRequest.rowCount) { await client.query("ROLLBACK"); return response.status(404).json({ error: "Pedido não encontrado." }); }
    await ensureSupportRequestOpeningMessage(client, requestId, supportRequest.rows[0].employee_id, supportRequest.rows[0].subject, supportRequest.rows[0].description);
    await client.query(`UPDATE public.employee_support_requests SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, handled_by_employee_id = $2, updated_at = CURRENT_TIMESTAMP WHERE employee_support_request_id = $1`, [requestId, request.authenticatedEmployee.employee_id]);
    await client.query("COMMIT");
    return response.json({ started: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not start support request chat:", error.message);
    return response.status(500).json({ error: "Não foi possível iniciar o chat." });
  } finally { client.release(); }
});

app.post("/api/support/requests/:requestId/messages", requireAuthenticated, async (request, response) => {
  const requestId = parseAccountId(request.params.requestId);
  const body = typeof request.body?.body === "string" ? request.body.body.trim() : "";
  if (!requestId || !body || body.length > 4000) return response.status(400).json({ error: "Escreva uma mensagem de até 4.000 caracteres." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const supportRequest = await client.query(`SELECT employee_support_request_id, employee_id, subject, description FROM public.employee_support_requests WHERE employee_support_request_id = $1 AND ($2::boolean OR employee_id = $3) FOR UPDATE`, [requestId, isHrAdmin, employeeId]);
    if (!supportRequest.rowCount) { await client.query("ROLLBACK"); return response.status(404).json({ error: "Pedido não encontrado." }); }
    const requesterId = supportRequest.rows[0].employee_id;
    const openingRequest = `${supportRequest.rows[0].subject}\n\n${supportRequest.rows[0].description}`;
    const createdOpeningMessage = await ensureSupportRequestOpeningMessage(client, requestId, requesterId, supportRequest.rows[0].subject, supportRequest.rows[0].description);
    const duplicateOpeningMessage = createdOpeningMessage && employeeId === requesterId && body === openingRequest;
    const inserted = duplicateOpeningMessage
      ? await client.query(`
          SELECT employee_support_request_message_id AS id, sender_employee_id AS "senderEmployeeId", body, sent_at AS "sentAt"
          FROM public.employee_support_request_messages
          WHERE employee_support_request_id = $1
          ORDER BY sent_at, employee_support_request_message_id LIMIT 1
        `, [requestId])
      : await client.query(`
          INSERT INTO public.employee_support_request_messages (employee_support_request_id, sender_employee_id, body)
          VALUES ($1, $2, $3)
          RETURNING employee_support_request_message_id AS id, sender_employee_id AS "senderEmployeeId", body, sent_at AS "sentAt"
        `, [requestId, employeeId, body]);
    await client.query(`UPDATE public.employee_support_requests SET status = CASE WHEN $2 AND status = 'open' THEN 'in_progress' ELSE status END, follow_up_note = CASE WHEN $2 AND follow_up_note = $4 THEN NULL ELSE follow_up_note END, handled_by_employee_id = CASE WHEN $2 THEN $3 ELSE handled_by_employee_id END, updated_at = CURRENT_TIMESTAMP WHERE employee_support_request_id = $1`, [requestId, isHrAdmin, employeeId, body]);
    await client.query("COMMIT");
    return response.status(201).json({ ...inserted.rows[0], senderName: request.authenticatedEmployee.full_name, isMine: inserted.rows[0].senderEmployeeId === employeeId });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not send support request chat message:", error.message);
    return response.status(500).json({ error: "Não foi possível enviar a mensagem." });
  } finally { client.release(); }
});

app.post("/api/me/plan/tasks/:taskId/check-in", requireAuthenticated, async (request, response) => {
  const taskId = parseAccountId(request.params.taskId);
  const feeling = request.body?.feeling;
  const comment = typeof request.body?.comment === "string" ? request.body.comment.trim() : "";
  const difficulties = typeof request.body?.difficulties === "string" ? request.body.difficulties.trim() : "";
  const supportRequest = typeof request.body?.supportRequest === "string" ? request.body.supportRequest.trim() : "";
  const wantsSupport = request.body?.needsSupport === true;
  if (!taskId || !["great", "good", "neutral", "struggling"].includes(feeling) || comment.length > 2000 || difficulties.length > 2000 || supportRequest.length > 2000) {
    return response.status(400).json({ error: "Revise como está se sentindo e mantenha cada resposta em até 2.000 caracteres." });
  }
  const employeeId = request.authenticatedEmployee.employee_id;
  const needsSupport = wantsSupport || feeling === "struggling" || Boolean(difficulties || supportRequest);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query(`
      SELECT plan_task.employee_plan_task_id FROM public.employee_plan_tasks AS plan_task
      WHERE plan_task.employee_plan_task_id = $1 AND plan_task.employee_id = $2 AND plan_task.task_type = 'checkin'
        AND lower(plan_task.category || ' ' || plan_task.title) NOT LIKE '%feedback%'
    `, [taskId, employeeId]);
    if (!task.rowCount) { await client.query("ROLLBACK"); return response.status(404).json({ error: "Tarefa de check-in não encontrada na sua jornada." }); }
    const result = await client.query(`
      INSERT INTO public.check_ins
        (employee_id, employee_plan_task_id, feeling, comment, difficulties, support_request, needs_support, follow_up_status)
      VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7, $8)
      RETURNING check_in_id AS id, feeling, comment, difficulties, support_request AS "supportRequest",
        needs_support AS "needsSupport", follow_up_status AS "followUpStatus", submitted_at AS "submittedAt"
    `, [employeeId, taskId, feeling, comment, difficulties, supportRequest, needsSupport, needsSupport ? "open" : "not_needed"]);
    await client.query(`
      INSERT INTO public.employee_plan_task_progress (employee_plan_task_id, employee_id, is_completed, status, completed_at, updated_by_employee_id, updated_at)
      VALUES ($1, $2, TRUE, 'ready', CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_plan_task_id) DO UPDATE SET is_completed = TRUE, status = 'ready', completed_at = CURRENT_TIMESTAMP, updated_by_employee_id = $2, updated_at = CURRENT_TIMESTAMP
    `, [taskId, employeeId]);
    await client.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value)
      VALUES ($1, $2, 'employee_confirmation', 'ready')`, [taskId, employeeId]);
    await client.query("COMMIT");
    return response.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error.code === "23505") return response.status(409).json({ error: "Este check-in já foi enviado." });
    console.error("Could not save employee check-in:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar seu check-in." });
  } finally { client.release(); }
});

app.post("/api/me/plan/tasks/:taskId/feedback", requireAuthenticated, async (request, response) => {
  const taskId = parseAccountId(request.params.taskId);
  const rating = Number(request.body?.rating);
  const whatWentWell = typeof request.body?.whatWentWell === "string" ? request.body.whatWentWell.trim() : "";
  const whatToImprove = typeof request.body?.whatToImprove === "string" ? request.body.whatToImprove.trim() : "";
  if (!taskId || !Number.isInteger(rating) || rating < 1 || rating > 5 || whatWentWell.length > 2000 || whatToImprove.length > 2000) {
    return response.status(400).json({ error: "Informe uma nota de 1 a 5 e respostas de até 2.000 caracteres." });
  }
  const employeeId = request.authenticatedEmployee.employee_id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query(`
      SELECT plan_task.employee_plan_task_id FROM public.employee_plan_tasks AS plan_task
      WHERE plan_task.employee_plan_task_id = $1 AND plan_task.employee_id = $2 AND plan_task.task_type = 'checkin'
        AND lower(plan_task.category || ' ' || plan_task.title) LIKE '%feedback%'
    `, [taskId, employeeId]);
    if (!task.rowCount) { await client.query("ROLLBACK"); return response.status(404).json({ error: "Tarefa de feedback não encontrada na sua jornada." }); }
    await client.query("SELECT employee_id FROM public.employees WHERE employee_id = $1 FOR UPDATE", [employeeId]);
    let onboarding = await client.query(`SELECT onboarding_id FROM public.onboardings WHERE employee_id = $1 AND status = 'active' ORDER BY updated_at DESC, onboarding_id DESC LIMIT 1`, [employeeId]);
    if (!onboarding.rowCount) onboarding = await client.query(`
      INSERT INTO public.onboardings (employee_id, start_date, status)
      SELECT employee_id, created_at::date, 'active' FROM public.employees WHERE employee_id = $1
      RETURNING onboarding_id
    `, [employeeId]);
    const result = await client.query(`
      INSERT INTO public.onboarding_feedback (onboarding_id, employee_id, employee_plan_task_id, rating, what_went_well, what_to_improve)
      VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''))
      RETURNING onboarding_feedback_id AS id, rating, what_went_well AS "whatWentWell",
        what_to_improve AS "whatToImprove", submitted_at AS "submittedAt"
    `, [onboarding.rows[0].onboarding_id, employeeId, taskId, rating, whatWentWell, whatToImprove]);
    await client.query(`
      INSERT INTO public.employee_plan_task_progress (employee_plan_task_id, employee_id, is_completed, status, completed_at, updated_by_employee_id, updated_at)
      VALUES ($1, $2, TRUE, 'ready', CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_plan_task_id) DO UPDATE SET is_completed = TRUE, status = 'ready', completed_at = CURRENT_TIMESTAMP, updated_by_employee_id = $2, updated_at = CURRENT_TIMESTAMP
    `, [taskId, employeeId]);
    await client.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value)
      VALUES ($1, $2, 'employee_confirmation', 'ready')`, [taskId, employeeId]);
    await client.query("COMMIT");
    return response.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error.code === "23505") return response.status(409).json({ error: "O feedback deste onboarding já foi enviado." });
    console.error("Could not save onboarding feedback:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar seu feedback." });
  } finally { client.release(); }
});

app.get("/api/hr/onboarding-support", requireHr, async (_request, response) => {
  try {
    const [checkIns, requests, feedback] = await Promise.all([
      pool.query(`SELECT checkin.check_in_id AS id, checkin.employee_id AS "employeeId", employee.full_name AS "employeeName", employee.email AS "employeeEmail", employee.job_title AS "jobTitle", department.name AS department, task.title AS "taskTitle", checkin.feeling, checkin.comment, checkin.difficulties, checkin.support_request AS "supportRequest", checkin.needs_support AS "needsSupport", checkin.follow_up_status AS "followUpStatus", checkin.submitted_at AS "submittedAt" FROM public.check_ins AS checkin INNER JOIN public.employees AS employee ON employee.employee_id = checkin.employee_id LEFT JOIN public.departments AS department ON department.department_id = employee.department_id LEFT JOIN public.employee_plan_tasks AS task ON task.employee_plan_task_id = checkin.employee_plan_task_id ORDER BY checkin.needs_support DESC, checkin.submitted_at DESC`),
      pool.query(`SELECT request.employee_support_request_id AS id, request.employee_id AS "employeeId", employee.full_name AS "employeeName", employee.email AS "employeeEmail", employee.job_title AS "jobTitle", department.name AS department, request.category, request.subject, request.description, request.status, request.follow_up_note AS "followUpNote", request.submitted_at AS "submittedAt", request.updated_at AS "updatedAt", EXISTS (SELECT 1 FROM public.employee_support_request_messages AS message WHERE message.employee_support_request_id = request.employee_support_request_id) AS "hasChat" FROM public.employee_support_requests AS request INNER JOIN public.employees AS employee ON employee.employee_id = request.employee_id LEFT JOIN public.departments AS department ON department.department_id = employee.department_id ORDER BY CASE request.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, request.submitted_at DESC`),
      pool.query(`SELECT feedback.onboarding_feedback_id AS id, feedback.employee_id AS "employeeId", employee.full_name AS "employeeName", employee.email AS "employeeEmail", employee.job_title AS "jobTitle", department.name AS department, feedback.rating, feedback.what_went_well AS "whatWentWell", feedback.what_to_improve AS "whatToImprove", feedback.submitted_at AS "submittedAt" FROM public.onboarding_feedback AS feedback INNER JOIN public.employees AS employee ON employee.employee_id = feedback.employee_id LEFT JOIN public.departments AS department ON department.department_id = employee.department_id ORDER BY feedback.submitted_at DESC`),
    ]);
    return response.json({ checkIns: checkIns.rows, requests: requests.rows, feedback: feedback.rows });
  } catch (error) {
    console.error("Could not load HR onboarding support:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar os acompanhamentos." });
  }
});

app.patch("/api/hr/check-ins/:checkInId", requireHr, async (request, response) => {
  const checkInId = parseAccountId(request.params.checkInId);
  const status = request.body?.status;
  if (!checkInId || !["open", "in_progress", "resolved"].includes(status)) return response.status(400).json({ error: "Informe um status válido para o acompanhamento." });
  try {
    const result = await pool.query(`UPDATE public.check_ins SET follow_up_status = $2, needs_support = TRUE WHERE check_in_id = $1 RETURNING check_in_id AS id, follow_up_status AS status`, [checkInId, status]);
    if (!result.rowCount) return response.status(404).json({ error: "Check-in não encontrado." });
    return response.json(result.rows[0]);
  } catch (error) {
    console.error("Could not update check-in follow-up:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar o acompanhamento." });
  }
});

app.patch("/api/hr/support-requests/:requestId", requireHr, async (request, response) => {
  const requestId = parseAccountId(request.params.requestId);
  const status = request.body?.status;
  const followUpNote = typeof request.body?.followUpNote === "string" ? request.body.followUpNote.trim() : "";
  if (!requestId || !["open", "in_progress", "resolved"].includes(status) || followUpNote.length > 1000) return response.status(400).json({ error: "Informe um status válido e uma observação de até 1.000 caracteres." });
  try {
    const result = await pool.query(`UPDATE public.employee_support_requests SET status = $2, follow_up_note = NULLIF($3, ''), handled_by_employee_id = $4, updated_at = CURRENT_TIMESTAMP WHERE employee_support_request_id = $1 RETURNING employee_support_request_id AS id, status, follow_up_note AS "followUpNote", updated_at AS "updatedAt"`, [requestId, status, followUpNote, request.authenticatedEmployee.employee_id]);
    if (!result.rowCount) return response.status(404).json({ error: "Pedido não encontrado." });
    return response.json(result.rows[0]);
  } catch (error) {
    console.error("Could not update employee support request:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar o pedido." });
  }
});

app.get("/api/support/conversations", requireAuthenticated, async (request, response) => {
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  try {
    const result = await pool.query(`
      SELECT conversation.employee_plan_task_issue_conversation_id AS "conversationId",
        issue.employee_plan_task_issue_id AS "issueId", issue.employee_id AS "employeeId",
        employee.full_name AS "employeeName", employee.email AS "employeeEmail",
        employee.job_title AS "employeeJobTitle", department.name AS "employeeDepartment",
        plan_task.title AS "taskTitle", stage.name AS "stageName",
        plan_task.owner_employee_id AS "ownerEmployeeId", owner.full_name AS "ownerName",
        issue.description AS "issueDescription", conversation.status,
        conversation.resolution_requested_by_employee_id AS "resolutionRequestedByEmployeeId",
        conversation.resolution_respondent_employee_id AS "resolutionRespondentEmployeeId",
        requester.full_name AS "resolutionRequestedByName", respondent.full_name AS "resolutionRespondentName",
        conversation.resolution_requested_at AS "resolutionRequestedAt",
        conversation.resolution_due_at AS "resolutionDueAt",
        conversation.created_at AS "createdAt", conversation.last_message_at AS "lastMessageAt",
        conversation.last_message_at + INTERVAL '2 months' AS "expiresAt",
        latest.body AS "lastMessage", latest.sender_employee_id AS "lastSenderId"
      FROM public.employee_plan_task_issue_conversations AS conversation
      INNER JOIN public.employee_plan_task_issues AS issue
        ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
      INNER JOIN public.employee_plan_tasks AS plan_task
        ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
      INNER JOIN public.employees AS employee ON employee.employee_id = issue.employee_id
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      LEFT JOIN public.employees AS owner ON owner.employee_id = plan_task.owner_employee_id
      LEFT JOIN public.employees AS requester ON requester.employee_id = conversation.resolution_requested_by_employee_id
      LEFT JOIN public.employees AS respondent ON respondent.employee_id = conversation.resolution_respondent_employee_id
      LEFT JOIN LATERAL (
        SELECT message.body, message.sender_employee_id
        FROM public.employee_plan_task_issue_messages AS message
        WHERE message.employee_plan_task_issue_conversation_id = conversation.employee_plan_task_issue_conversation_id
        ORDER BY message.sent_at DESC, message.employee_plan_task_issue_message_id DESC
        LIMIT 1
      ) AS latest ON TRUE
      WHERE conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
        AND ($1::boolean IS TRUE OR issue.employee_id = $2 OR plan_task.owner_employee_id = $2)
      ORDER BY (conversation.status = 'pending_confirmation') DESC,
        (conversation.status = 'open') DESC, conversation.last_message_at DESC;
    `, [isHrAdmin, employeeId]);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load support conversations:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as mensagens de suporte." });
  }
});

app.get("/api/support/unread-count", requireAuthenticated, async (request, response) => {
  try {
    const unreadCount = await getUnreadSupportMessageCount(
      request.authenticatedEmployee.employee_id,
      request.authenticatedEmployee.is_hr_admin === true,
    );
    return response.json({ unreadCount });
  } catch (error) {
    console.error("Could not load unread support message count:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as notificações." });
  }
});

app.get("/api/support/conversations/:conversationId", requireAuthenticated, async (request, response) => {
  const conversationId = parseAccountId(request.params.conversationId);
  if (!conversationId) return response.status(400).json({ error: "Conversa inválida." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  try {
    const conversation = await pool.query(`
      SELECT conversation.employee_plan_task_issue_conversation_id AS "conversationId",
        issue.employee_plan_task_issue_id AS "issueId", issue.employee_id AS "employeeId",
        employee.full_name AS "employeeName", employee.email AS "employeeEmail",
        employee.job_title AS "employeeJobTitle", department.name AS "employeeDepartment",
        plan_task.title AS "taskTitle", stage.name AS "stageName",
        plan_task.owner_employee_id AS "ownerEmployeeId", owner.full_name AS "ownerName",
        issue.description AS "issueDescription", conversation.status,
        conversation.resolution_requested_by_employee_id AS "resolutionRequestedByEmployeeId",
        conversation.resolution_respondent_employee_id AS "resolutionRespondentEmployeeId",
        requester.full_name AS "resolutionRequestedByName", respondent.full_name AS "resolutionRespondentName",
        conversation.resolution_requested_at AS "resolutionRequestedAt",
        conversation.resolution_due_at AS "resolutionDueAt",
        conversation.created_at AS "createdAt", conversation.last_message_at AS "lastMessageAt",
        conversation.last_message_at + INTERVAL '2 months' AS "expiresAt"
      FROM public.employee_plan_task_issue_conversations AS conversation
      INNER JOIN public.employee_plan_task_issues AS issue
        ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
      INNER JOIN public.employee_plan_tasks AS plan_task
        ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
      INNER JOIN public.employees AS employee ON employee.employee_id = issue.employee_id
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      LEFT JOIN public.employees AS owner ON owner.employee_id = plan_task.owner_employee_id
      LEFT JOIN public.employees AS requester ON requester.employee_id = conversation.resolution_requested_by_employee_id
      LEFT JOIN public.employees AS respondent ON respondent.employee_id = conversation.resolution_respondent_employee_id
      WHERE conversation.employee_plan_task_issue_conversation_id = $1
        AND conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
        AND ($2::boolean IS TRUE OR issue.employee_id = $3 OR plan_task.owner_employee_id = $3)
    `, [conversationId, isHrAdmin, employeeId]);
    if (!conversation.rowCount) return response.status(404).json({ error: "Conversa não encontrada ou expirada." });
    const messages = await pool.query(`
      SELECT message.employee_plan_task_issue_message_id AS id,
        message.sender_employee_id AS "senderId", COALESCE(sender.full_name, 'OnRamp') AS "senderName",
        message.body, message.sent_at AS "sentAt"
      FROM public.employee_plan_task_issue_messages AS message
      LEFT JOIN public.employees AS sender ON sender.employee_id = message.sender_employee_id
      WHERE message.employee_plan_task_issue_conversation_id = $1
      ORDER BY message.sent_at, message.employee_plan_task_issue_message_id;
    `, [conversationId]);
    return response.json({ conversation: conversation.rows[0], messages: messages.rows });
  } catch (error) {
    console.error("Could not load support conversation:", error.message);
    return response.status(500).json({ error: "Não foi possível abrir esta conversa." });
  }
});

app.post("/api/support/conversations/:conversationId/read", requireAuthenticated, async (request, response) => {
  const conversationId = parseAccountId(request.params.conversationId);
  const lastReadMessageId = parseAccountId(request.body?.lastReadMessageId);
  if (!conversationId || !lastReadMessageId) return response.status(400).json({ error: "Conversa ou mensagem inválida." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  try {
    const result = await pool.query(`
      INSERT INTO public.employee_plan_task_issue_conversation_reads
        (employee_plan_task_issue_conversation_id, employee_id, last_read_message_id)
      SELECT $1, $2, $3
      WHERE EXISTS (
        SELECT 1
        FROM public.employee_plan_task_issue_conversations AS conversation
        INNER JOIN public.employee_plan_task_issues AS issue
          ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
        INNER JOIN public.employee_plan_tasks AS plan_task
          ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
        WHERE conversation.employee_plan_task_issue_conversation_id = $1
          AND conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
          AND ($4::boolean IS TRUE OR issue.employee_id = $2 OR plan_task.owner_employee_id = $2)
      )
        AND EXISTS (
          SELECT 1 FROM public.employee_plan_task_issue_messages AS message
          WHERE message.employee_plan_task_issue_conversation_id = $1
            AND message.employee_plan_task_issue_message_id = $3
        )
      ON CONFLICT (employee_plan_task_issue_conversation_id, employee_id) DO UPDATE
      SET last_read_message_id = GREATEST(
            public.employee_plan_task_issue_conversation_reads.last_read_message_id,
            EXCLUDED.last_read_message_id
          ),
          updated_at = CURRENT_TIMESTAMP
      RETURNING last_read_message_id
    `, [conversationId, employeeId, lastReadMessageId, isHrAdmin]);
    if (!result.rowCount) return response.status(404).json({ error: "Conversa não encontrada ou expirada." });
    const unreadCount = await getUnreadSupportMessageCount(employeeId, isHrAdmin);
    return response.json({ unreadCount });
  } catch (error) {
    console.error("Could not mark support messages as read:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar as notificações." });
  }
});

app.post("/api/support/conversations/:conversationId/messages", requireAuthenticated, async (request, response) => {
  const conversationId = parseAccountId(request.params.conversationId);
  const body = typeof request.body?.body === "string" ? request.body.body.trim() : "";
  if (!conversationId || !body || body.length > 4000) return response.status(400).json({ error: "Escreva uma mensagem de até 4.000 caracteres." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query(`
      SELECT conversation.employee_plan_task_issue_conversation_id
      FROM public.employee_plan_task_issue_conversations AS conversation
      INNER JOIN public.employee_plan_task_issues AS issue
        ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
      INNER JOIN public.employee_plan_tasks AS plan_task
        ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
      WHERE conversation.employee_plan_task_issue_conversation_id = $1
        AND conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
        AND ($2::boolean IS TRUE OR issue.employee_id = $3 OR plan_task.owner_employee_id = $3)
      FOR UPDATE OF conversation
    `, [conversationId, isHrAdmin, employeeId]);
    if (!access.rowCount) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Conversa não encontrada ou expirada." });
    }
    const message = await client.query(`
      INSERT INTO public.employee_plan_task_issue_messages
        (employee_plan_task_issue_conversation_id, sender_employee_id, body)
      VALUES ($1, $2, $3)
      RETURNING employee_plan_task_issue_message_id AS id, sender_employee_id AS "senderId",
        body, sent_at AS "sentAt"
    `, [conversationId, employeeId, body]);
    const sender = await client.query("SELECT full_name FROM public.employees WHERE employee_id = $1", [employeeId]);
    await client.query(`
      UPDATE public.employee_plan_task_issue_conversations
      SET last_message_at = $2, updated_at = CURRENT_TIMESTAMP
      WHERE employee_plan_task_issue_conversation_id = $1
    `, [conversationId, message.rows[0].sentAt]);
    await client.query("COMMIT");
    return response.status(201).json({ ...message.rows[0], senderName: sender.rows[0]?.full_name ?? "" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not send support message:", error.message);
    return response.status(500).json({ error: "Não foi possível enviar a mensagem." });
  } finally {
    client.release();
  }
});

app.post("/api/support/conversations/:conversationId/resolution-request", requireAuthenticated, async (request, response) => {
  const conversationId = parseAccountId(request.params.conversationId);
  if (!conversationId) return response.status(400).json({ error: "Conversa inválida." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query(`
      SELECT conversation.status, issue.employee_id AS "reporterId",
        plan_task.owner_employee_id AS "ownerId", reporter.full_name AS "reporterName",
        owner.full_name AS "ownerName", actor.full_name AS "actorName"
      FROM public.employee_plan_task_issue_conversations AS conversation
      INNER JOIN public.employee_plan_task_issues AS issue
        ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
      INNER JOIN public.employee_plan_tasks AS plan_task
        ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
      INNER JOIN public.employees AS reporter ON reporter.employee_id = issue.employee_id
      INNER JOIN public.employees AS actor ON actor.employee_id = $2
      LEFT JOIN public.employees AS owner ON owner.employee_id = plan_task.owner_employee_id
      WHERE conversation.employee_plan_task_issue_conversation_id = $1
        AND conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
        AND ($3::boolean IS TRUE OR issue.employee_id = $2 OR plan_task.owner_employee_id = $2)
      FOR UPDATE OF conversation
    `, [conversationId, employeeId, isHrAdmin]);
    if (!access.rowCount) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Conversa não encontrada ou expirada." });
    }
    const conversation = access.rows[0];
    if (conversation.status !== "open") {
      await client.query("ROLLBACK");
      return response.status(409).json({ error: "Esta conversa não está aberta para uma nova solicitação." });
    }
    const respondentId = Number(employeeId) === Number(conversation.reporterId)
      ? conversation.ownerId
      : conversation.reporterId;
    const respondentName = Number(employeeId) === Number(conversation.reporterId)
      ? conversation.ownerName
      : conversation.reporterName;
    if (!respondentId || Number(respondentId) === Number(employeeId)) {
      await client.query("ROLLBACK");
      return response.status(409).json({ error: "Não há outra pessoa nesta conversa para confirmar a resolução." });
    }
    await client.query(`
      UPDATE public.employee_plan_task_issue_conversations
      SET status = 'pending_confirmation', resolution_requested_by_employee_id = $2,
        resolution_respondent_employee_id = $3, resolution_requested_at = CURRENT_TIMESTAMP,
        resolution_due_at = CURRENT_TIMESTAMP + INTERVAL '3 days', updated_at = CURRENT_TIMESTAMP
      WHERE employee_plan_task_issue_conversation_id = $1
    `, [conversationId, employeeId, respondentId]);
    await insertSupportSystemMessage(client, conversationId,
      `${conversation.actorName} solicitou a confirmação da resolução. ${respondentName} tem três dias para confirmar ou rejeitar.`);
    await client.query("COMMIT");
    return response.json({ status: "pending_confirmation" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not request support resolution:", error.message);
    return response.status(500).json({ error: "Não foi possível solicitar a confirmação." });
  } finally {
    client.release();
  }
});

app.post("/api/support/conversations/:conversationId/resolution-response", requireAuthenticated, async (request, response) => {
  const conversationId = parseAccountId(request.params.conversationId);
  const action = request.body?.action;
  const reason = typeof request.body?.reason === "string" ? request.body.reason.trim() : "";
  if (!conversationId || !["confirm", "reject"].includes(action)) return response.status(400).json({ error: "Informe uma decisão válida." });
  if (action === "reject" && (!reason || reason.length > 2000)) return response.status(400).json({ error: "Escreva uma justificativa de até 2.000 caracteres." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query(`
      SELECT conversation.status, conversation.resolution_due_at AS "resolutionDueAt",
        conversation.resolution_requested_by_employee_id AS "requestedById",
        conversation.resolution_respondent_employee_id AS "respondentId", actor.full_name AS "actorName"
      FROM public.employee_plan_task_issue_conversations AS conversation
      INNER JOIN public.employee_plan_task_issues AS issue
        ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
      INNER JOIN public.employee_plan_tasks AS plan_task
        ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
      INNER JOIN public.employees AS actor ON actor.employee_id = $2
      WHERE conversation.employee_plan_task_issue_conversation_id = $1
        AND conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
        AND ($3::boolean IS TRUE OR issue.employee_id = $2 OR plan_task.owner_employee_id = $2)
      FOR UPDATE OF conversation
    `, [conversationId, employeeId, isHrAdmin]);
    if (!access.rowCount) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Conversa não encontrada ou expirada." });
    }
    const conversation = access.rows[0];
    if (conversation.status !== "pending_confirmation") {
      await client.query("ROLLBACK");
      return response.status(409).json({ error: "Não há uma resolução aguardando confirmação." });
    }
    if (new Date(conversation.resolutionDueAt).getTime() <= Date.now()) {
      await client.query(`
        UPDATE public.employee_plan_task_issue_conversations
        SET status = 'resolved', resolution_due_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE employee_plan_task_issue_conversation_id = $1
      `, [conversationId]);
      await insertSupportSystemMessage(client, conversationId,
        "O prazo de três dias terminou sem rejeição. A resolução foi confirmada automaticamente.");
      await client.query("COMMIT");
      return response.json({ status: "resolved", autoConfirmed: true });
    }
    if (Number(conversation.requestedById) === Number(employeeId) ||
      (Number(conversation.respondentId) !== Number(employeeId) && !isHrAdmin)) {
      await client.query("ROLLBACK");
      return response.status(403).json({ error: "Apenas a outra pessoa da conversa pode responder à solicitação." });
    }
    if (action === "confirm") {
      await client.query(`
        UPDATE public.employee_plan_task_issue_conversations
        SET status = 'resolved', resolution_due_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE employee_plan_task_issue_conversation_id = $1
      `, [conversationId]);
      await insertSupportSystemMessage(client, conversationId,
        `${conversation.actorName} confirmou a resolução do problema.`);
    } else {
      const message = await client.query(`
        INSERT INTO public.employee_plan_task_issue_messages
          (employee_plan_task_issue_conversation_id, sender_employee_id, body)
        VALUES ($1, $2, $3)
        RETURNING sent_at AS "sentAt"
      `, [conversationId, employeeId, `Solicitação de resolução rejeitada. Justificativa: ${reason}`]);
      await client.query(`
        UPDATE public.employee_plan_task_issue_conversations
        SET status = 'open', resolution_requested_by_employee_id = NULL,
          resolution_respondent_employee_id = NULL, resolution_requested_at = NULL,
          resolution_due_at = NULL, last_message_at = $2, updated_at = CURRENT_TIMESTAMP
        WHERE employee_plan_task_issue_conversation_id = $1
      `, [conversationId, message.rows[0].sentAt]);
    }
    await client.query("COMMIT");
    return response.json({ status: action === "confirm" ? "resolved" : "open" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not respond to support resolution:", error.message);
    return response.status(500).json({ error: "Não foi possível registrar a decisão." });
  } finally {
    client.release();
  }
});

app.patch("/api/support/conversations/:conversationId/status", requireAuthenticated, async (request, response) => {
  const conversationId = parseAccountId(request.params.conversationId);
  if (!conversationId || request.body?.status !== "open") return response.status(400).json({ error: "Estado de conversa inválido." });
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query(`
      SELECT conversation.status, actor.full_name AS "actorName"
      FROM public.employee_plan_task_issue_conversations AS conversation
      INNER JOIN public.employee_plan_task_issues AS issue
        ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
      INNER JOIN public.employee_plan_tasks AS plan_task
        ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
      INNER JOIN public.employees AS actor ON actor.employee_id = $2
      WHERE conversation.employee_plan_task_issue_conversation_id = $1
        AND conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
        AND ($3::boolean IS TRUE OR issue.employee_id = $2 OR plan_task.owner_employee_id = $2)
      FOR UPDATE OF conversation
    `, [conversationId, employeeId, isHrAdmin]);
    if (!access.rowCount) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Conversa não encontrada ou expirada." });
    }
    if (access.rows[0].status !== "resolved") {
      await client.query("ROLLBACK");
      return response.status(409).json({ error: "Somente uma conversa resolvida pode ser reaberta." });
    }
    await client.query(`
      UPDATE public.employee_plan_task_issue_conversations
      SET status = 'open', resolution_requested_by_employee_id = NULL,
        resolution_respondent_employee_id = NULL, resolution_requested_at = NULL,
        resolution_due_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE employee_plan_task_issue_conversation_id = $1
    `, [conversationId]);
    await insertSupportSystemMessage(client, conversationId,
      `${access.rows[0].actorName} reabriu o problema.`);
    await client.query("COMMIT");
    return response.json({ status: "open" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not reopen support conversation:", error.message);
    return response.status(500).json({ error: "Não foi possível reabrir a conversa." });
  } finally {
    client.release();
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

function parseResourceAudienceIds(values) {
  if (!Array.isArray(values)) return null;
  const parsed = values.map(parseAccountId);
  if (parsed.some((employeeId) => !employeeId)) return null;
  return [...new Set(parsed)];
}

async function hasActiveResourceAudience(ids, executor = pool) {
  if (!ids.length) return true;
  const result = await executor.query("SELECT employee_id FROM public.employees WHERE is_active IS TRUE AND employee_id = ANY($1::int[])", [ids]);
  return result.rowCount === ids.length;
}

async function replaceResourceAudience(executor, resourceId, employeeIds) {
  await executor.query("DELETE FROM public.resource_audiences WHERE resource_id = $1", [resourceId]);
  if (employeeIds.length) {
    await executor.query(`INSERT INTO public.resource_audiences (resource_id, employee_id)
      SELECT $1, audience.employee_id FROM unnest($2::int[]) AS audience(employee_id)
      ON CONFLICT (resource_id, employee_id) DO NOTHING`, [resourceId, employeeIds]);
  }
}

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

async function canManagePreparationTask(employeeId, isHrAdmin, taskId, client = pool) {
  const result = await client.query(`
    SELECT task.employee_plan_task_id
    FROM public.employee_plan_tasks AS task
    WHERE task.employee_plan_task_id = $1
      AND task.task_type = 'preparation'
      AND EXISTS (SELECT 1 FROM public.stage_templates AS stage
        WHERE stage.stage_template_id = task.stage_template_id AND stage.stage_code = 'pre-entry')
      AND ($3::boolean OR task.owner_employee_id = $2 OR EXISTS (
        SELECT 1 FROM public.employee_preparation_department_access AS access
        WHERE access.employee_id = $2 AND access.department_id = ANY(CASE WHEN cardinality(task.responsible_department_ids) > 0
          THEN task.responsible_department_ids ELSE ARRAY[task.responsible_department_id] END)
      ))
  `, [taskId, employeeId, isHrAdmin]);
  return result.rowCount > 0;
}

app.get("/api/preparation/access", requireAuthenticated, async (request, response) => {
  try {
    const employeeId = request.authenticatedEmployee.employee_id;
    const departments = request.authenticatedEmployee.is_hr_admin
      ? await pool.query("SELECT department_id AS id, name FROM public.departments ORDER BY name")
      : await pool.query(`SELECT department.department_id AS id, department.name
          FROM public.employee_preparation_department_access AS access
          INNER JOIN public.departments AS department ON department.department_id = access.department_id
          WHERE access.employee_id = $1 ORDER BY department.name`, [employeeId]);
    const assigned = await pool.query(`SELECT 1 FROM public.employee_plan_tasks AS task
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = task.stage_template_id
      WHERE task.owner_employee_id = $1 AND task.task_type = 'preparation' AND stage.stage_code = 'pre-entry' LIMIT 1`, [employeeId]);
    return response.json({ canManage: request.authenticatedEmployee.is_hr_admin || departments.rowCount > 0 || assigned.rowCount > 0, departments: departments.rows });
  } catch (error) {
    console.error("Could not load preparation access:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as permissões de preparação." });
  }
});

app.get("/api/preparation/tasks", requireAuthenticated, async (request, response) => {
  const employeeId = request.authenticatedEmployee.employee_id;
  const isHrAdmin = request.authenticatedEmployee.is_hr_admin === true;
  try {
    const result = await pool.query(`
      SELECT task.employee_plan_task_id AS id, task.employee_id AS "employeeId", employee.full_name AS "employeeName",
        task.title, task.description, task.category, task.owner_employee_id AS "ownerEmployeeId",
        owner.full_name AS "ownerName", task.owner_role AS "ownerRole", task.responsible_department_id AS "departmentId",
        department.name AS department, task.due_offset_days AS "dueOffsetDays",
        COALESCE(onboarding.start_date, employee.created_at::date) AS "startDate",
        COALESCE(onboarding.start_date, employee.created_at::date) + task.due_offset_days AS "dueDate",
        COALESCE(progress.status, 'not_started') AS status,
        CASE WHEN lower(task.category) = 'equipamento' THEN task.shipping_tracking_url END AS "trackingUrl",
        (SELECT COUNT(*)::int FROM public.employee_plan_task_issues AS issue
          WHERE issue.employee_plan_task_id = task.employee_plan_task_id AND issue.status <> 'resolved') AS "openIssueCount",
        COALESCE((SELECT json_agg(json_build_object('id', issue.employee_plan_task_issue_id, 'description', issue.description,
          'status', issue.status, 'resolutionNote', issue.resolution_note, 'createdAt', issue.created_at) ORDER BY issue.created_at DESC)
          FROM public.employee_plan_task_issues AS issue WHERE issue.employee_plan_task_id = task.employee_plan_task_id), '[]'::json) AS issues,
        COALESCE((SELECT json_agg(json_build_object('id', entry.id, 'actorName', entry.actor_name,
          'action', entry.action, 'previousValue', entry.previous_value, 'newValue', entry.new_value, 'comment', entry.comment, 'createdAt', entry.created_at) ORDER BY entry.created_at DESC)
          FROM (SELECT history.employee_plan_task_history_id AS id, actor.full_name AS actor_name,
            history.action, history.previous_value, history.new_value, history.comment, history.created_at FROM public.employee_plan_task_history AS history
            INNER JOIN public.employees AS actor ON actor.employee_id = history.actor_employee_id
            WHERE history.employee_plan_task_id = task.employee_plan_task_id ORDER BY history.created_at DESC) AS entry), '[]'::json) AS history
      FROM public.employee_plan_tasks AS task
      INNER JOIN public.employees AS employee ON employee.employee_id = task.employee_id
      LEFT JOIN public.employees AS owner ON owner.employee_id = task.owner_employee_id
      LEFT JOIN public.departments AS department ON department.department_id = task.responsible_department_id
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = task.stage_template_id
      LEFT JOIN public.employee_plan_task_progress AS progress ON progress.employee_plan_task_id = task.employee_plan_task_id
        AND progress.employee_id = task.employee_id
      LEFT JOIN LATERAL (SELECT start_date FROM public.onboardings WHERE employee_id = employee.employee_id AND status = 'active'
        ORDER BY updated_at DESC, onboarding_id DESC LIMIT 1) AS onboarding ON TRUE
      WHERE task.task_type = 'preparation' AND stage.stage_code = 'pre-entry' AND employee.is_active IS TRUE
        AND ($2::boolean OR task.owner_employee_id = $1 OR EXISTS (
          SELECT 1 FROM public.employee_preparation_department_access AS access
          WHERE access.employee_id = $1 AND access.department_id = ANY(CASE WHEN cardinality(task.responsible_department_ids) > 0
            THEN task.responsible_department_ids ELSE ARRAY[task.responsible_department_id] END)
        ))
      ORDER BY COALESCE(onboarding.start_date, employee.created_at::date), department.name, "dueDate", employee.full_name, task.display_order
    `, [employeeId, isHrAdmin]);
    return response.json({ tasks: result.rows });
  } catch (error) {
    console.error("Could not load preparation tasks:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as novas admissões." });
  }
});

app.patch("/api/preparation/tasks/:taskId/status", requireAuthenticated, async (request, response) => {
  const taskId = parseAccountId(request.params.taskId);
  const status = request.body?.status;
  const comment = typeof request.body?.comment === "string" ? request.body.comment.trim() : "";
  const statuses = new Set(["not_started", "in_progress", "waiting_third_party", "blocked", "ready", "cancelled", "not_applicable"]);
  if (!taskId || !statuses.has(status) || comment.length > 2000) return response.status(400).json({ error: "Selecione um estado válido e escreva um comentário de até 2.000 caracteres." });
  const actorId = request.authenticatedEmployee.employee_id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query(`SELECT employee_id FROM public.employee_plan_tasks WHERE employee_plan_task_id = $1 AND task_type = 'preparation' FOR UPDATE`, [taskId]);
    if (!task.rowCount || !(await canManagePreparationTask(actorId, request.authenticatedEmployee.is_hr_admin === true, taskId, client))) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Item de preparação não encontrado." });
    }
    const targetEmployeeId = task.rows[0].employee_id;
    const prior = await client.query("SELECT status FROM public.employee_plan_task_progress WHERE employee_plan_task_id = $1 AND employee_id = $2", [taskId, targetEmployeeId]);
    await client.query(`INSERT INTO public.employee_plan_task_progress
        (employee_plan_task_id, employee_id, status, is_completed, completed_at, updated_by_employee_id, updated_at)
      VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN CURRENT_TIMESTAMP END, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (employee_plan_task_id) DO UPDATE SET status = EXCLUDED.status,
        is_completed = EXCLUDED.is_completed, completed_at = EXCLUDED.completed_at,
        updated_by_employee_id = EXCLUDED.updated_by_employee_id, updated_at = CURRENT_TIMESTAMP`,
    [taskId, targetEmployeeId, status, status === "ready", actorId]);
    const history = await client.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, previous_value, new_value, comment)
      VALUES ($1, $2, 'status', $3, $4, NULLIF($5, ''))
      RETURNING employee_plan_task_history_id AS id, action, previous_value AS "previousValue", new_value AS "newValue", comment, created_at AS "createdAt"`, [taskId, actorId, prior.rows[0]?.status ?? "not_started", status, comment]);
    await client.query("COMMIT");
    return response.json({ id: taskId, status, history: { ...history.rows[0], actorName: request.authenticatedEmployee.full_name } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not update preparation status:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar o estado do item." });
  } finally {
    client.release();
  }
});

app.post("/api/preparation/tasks/:taskId/claim", requireAuthenticated, async (request, response) => {
  const taskId = parseAccountId(request.params.taskId);
  if (!taskId) return response.status(400).json({ error: "Tarefa inválida." });
  const actorId = request.authenticatedEmployee.employee_id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const task = await client.query(`SELECT employee_plan_task_id, owner_employee_id FROM public.employee_plan_tasks
      WHERE employee_plan_task_id = $1 AND task_type = 'preparation' FOR UPDATE`, [taskId]);
    if (!task.rowCount || !(await canManagePreparationTask(actorId, request.authenticatedEmployee.is_hr_admin === true, taskId, client))) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Item de preparação não encontrado." });
    }
    if (task.rows[0].owner_employee_id) {
      await client.query("ROLLBACK");
      return response.status(409).json({ error: "Esta tarefa já tem uma pessoa responsável." });
    }
    const owner = await client.query(`UPDATE public.employee_plan_tasks SET owner_employee_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE employee_plan_task_id = $1 AND owner_employee_id IS NULL
      RETURNING owner_employee_id AS "ownerEmployeeId"`, [taskId, actorId]);
    if (!owner.rowCount) {
      await client.query("ROLLBACK");
      return response.status(409).json({ error: "Esta tarefa já foi assumida por outra pessoa." });
    }
    const history = await client.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, previous_value, new_value)
      VALUES ($1, $2, 'owner', NULL, $3)
      RETURNING employee_plan_task_history_id AS id, action, previous_value AS "previousValue", new_value AS "newValue", comment, created_at AS "createdAt"`, [taskId, actorId, request.authenticatedEmployee.full_name]);
    await client.query("COMMIT");
    return response.json({ ...owner.rows[0], ownerName: request.authenticatedEmployee.full_name, history: { ...history.rows[0], actorName: request.authenticatedEmployee.full_name } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not claim preparation task:", error.message);
    return response.status(500).json({ error: "Não foi possível assumir a tarefa." });
  } finally {
    client.release();
  }
});

app.patch("/api/preparation/tasks/:taskId/shipment", requireAuthenticated, async (request, response) => {
  const taskId = parseAccountId(request.params.taskId);
  const trackingUrl = typeof request.body?.trackingUrl === "string" ? request.body.trackingUrl.trim() : "";
  if (!taskId || trackingUrl.length > 1000) return response.status(400).json({ error: "Confira o link de rastreio." });
  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) return response.status(400).json({ error: "O link de rastreio deve começar com http:// ou https://." });
  const actorId = request.authenticatedEmployee.employee_id;
  try {
    if (!(await canManagePreparationTask(actorId, request.authenticatedEmployee.is_hr_admin === true, taskId))) return response.status(404).json({ error: "Item de preparação não encontrado." });
    const result = await pool.query(`UPDATE public.employee_plan_tasks SET shipping_tracking_url = NULLIF($2, ''), updated_at = CURRENT_TIMESTAMP
      WHERE employee_plan_task_id = $1 AND task_type = 'preparation' AND lower(category) = 'equipamento'
      RETURNING employee_plan_task_id AS id`, [taskId, trackingUrl]);
    if (!result.rowCount) return response.status(404).json({ error: "Item de preparação não encontrado." });
    await pool.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, new_value)
      VALUES ($1, $2, 'shipment', $3)`, [taskId, actorId, trackingUrl]);
    return response.json({ id: taskId, trackingUrl });
  } catch (error) {
    console.error("Could not save shipment tracking:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar os dados de rastreio." });
  }
});

app.patch("/api/preparation/issues/:issueId", requireAuthenticated, async (request, response) => {
  const issueId = parseAccountId(request.params.issueId);
  const status = request.body?.status;
  const resolutionNote = typeof request.body?.resolutionNote === "string" ? request.body.resolutionNote.trim() : "";
  if (!issueId || !["in_review", "resolved"].includes(status) || resolutionNote.length > 2000) {
    return response.status(400).json({ error: "Informe um estado e uma observação válidos." });
  }
  const actorId = request.authenticatedEmployee.employee_id;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const issue = await client.query(`SELECT issue.employee_plan_task_id AS "taskId", issue.status
      FROM public.employee_plan_task_issues AS issue WHERE issue.employee_plan_task_issue_id = $1 FOR UPDATE`, [issueId]);
    if (!issue.rowCount || !(await canManagePreparationTask(actorId, request.authenticatedEmployee.is_hr_admin === true, issue.rows[0]?.taskId, client))) {
      await client.query("ROLLBACK");
      return response.status(404).json({ error: "Problema não encontrado." });
    }
    await client.query(`UPDATE public.employee_plan_task_issues SET status = $2,
      resolution_note = NULLIF($3, ''), resolved_by_employee_id = CASE WHEN $2 = 'resolved' THEN $4 ELSE NULL END,
      resolved_at = CASE WHEN $2 = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE employee_plan_task_issue_id = $1`, [issueId, status, resolutionNote, actorId]);
    await client.query(`INSERT INTO public.employee_plan_task_history (employee_plan_task_id, actor_employee_id, action, previous_value, new_value)
      VALUES ($1, $2, 'issue_status', $3, $4)`, [issue.rows[0].taskId, actorId, issue.rows[0].status, status]);
    await client.query("COMMIT");
    return response.json({ id: issueId, status, resolutionNote });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not update preparation issue:", error.message);
    return response.status(500).json({ error: "Não foi possível atualizar o problema." });
  } finally {
    client.release();
  }
});

async function getUnreadSupportMessageCount(employeeId, isHrAdmin) {
  const result = await pool.query(`
    SELECT COUNT(message.employee_plan_task_issue_message_id)::int AS count
    FROM public.employee_plan_task_issue_messages AS message
    INNER JOIN public.employee_plan_task_issue_conversations AS conversation
      ON conversation.employee_plan_task_issue_conversation_id = message.employee_plan_task_issue_conversation_id
    INNER JOIN public.employee_plan_task_issues AS issue
      ON issue.employee_plan_task_issue_id = conversation.employee_plan_task_issue_id
    INNER JOIN public.employee_plan_tasks AS plan_task
      ON plan_task.employee_plan_task_id = issue.employee_plan_task_id
    LEFT JOIN public.employee_plan_task_issue_conversation_reads AS conversation_read
      ON conversation_read.employee_plan_task_issue_conversation_id = conversation.employee_plan_task_issue_conversation_id
      AND conversation_read.employee_id = $2
    WHERE conversation.last_message_at >= CURRENT_TIMESTAMP - INTERVAL '2 months'
      AND message.sender_employee_id IS DISTINCT FROM $2
      AND (conversation_read.last_read_message_id IS NULL
        OR message.employee_plan_task_issue_message_id > conversation_read.last_read_message_id)
      AND ($1::boolean IS TRUE OR issue.employee_id = $2 OR plan_task.owner_employee_id = $2)
  `, [isHrAdmin, employeeId]);
  return result.rows[0]?.count ?? 0;
}

async function insertSupportSystemMessage(client, conversationId, body) {
  const message = await client.query(`
    INSERT INTO public.employee_plan_task_issue_messages
      (employee_plan_task_issue_conversation_id, sender_employee_id, body, is_system)
    VALUES ($1, NULL, $2, TRUE)
    RETURNING sent_at AS "sentAt"
  `, [conversationId, body]);
  await client.query(`
    UPDATE public.employee_plan_task_issue_conversations
    SET last_message_at = $2, updated_at = CURRENT_TIMESTAMP
    WHERE employee_plan_task_issue_conversation_id = $1
  `, [conversationId, message.rows[0].sentAt]);
  return message.rows[0].sentAt;
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
      VALUES ($1, $2, CASE WHEN $3::int[] @> ARRAY[$1::int] THEN 'Líder' ELSE NULL END)
    `, [memberId, teamId, leaderIds]);
  }
}

function teamWriteError(error, action) {
  if (error.code === "23505") {
    return { status: 409, body: { error: "Já existe uma equipe com esse nome." } };
  }
  const diagnosticId = randomUUID();
  console.error(`Could not ${action} HR team:`, { diagnosticId, code: error.code, message: error.message });
  if (isTeamSchemaError(error)) {
    return {
      status: 503,
      body: { error: "O banco está sem as migrações de equipes necessárias. Aplique as migrações 014 e 015 no banco do Azure e tente novamente.", diagnosticId },
    };
  }
  return { status: 500, body: { error: "Não foi possível salvar a equipe.", diagnosticId } };
}

function isTeamSchemaError(error) {
  return error.code === "42P01" || error.code === "42703";
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

async function saveEmployeePreparationAccess(client, employeeId, departmentIds, grantedByEmployeeId) {
  await client.query("DELETE FROM public.employee_preparation_department_access WHERE employee_id = $1", [employeeId]);
  for (const departmentId of departmentIds) {
    await client.query(`INSERT INTO public.employee_preparation_department_access
      (employee_id, department_id, granted_by_employee_id) VALUES ($1, $2, $3)`, [employeeId, departmentId, grantedByEmployeeId]);
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
    if (task.ownerEmployeeId !== null && task.ownerEmployeeId !== undefined && task.ownerEmployeeId !== "" &&
      (!Number.isSafeInteger(Number(task.ownerEmployeeId)) || Number(task.ownerEmployeeId) <= 0)) return "Selecione uma pessoa responsável válida.";
    if (task.responsibleDepartmentId !== undefined && task.responsibleDepartmentId !== null && task.responsibleDepartmentId !== "" &&
      (!Number.isSafeInteger(Number(task.responsibleDepartmentId)) || Number(task.responsibleDepartmentId) <= 0)) return "Selecione uma área responsável válida.";
    if (task.responsibleDepartmentIds !== undefined && (!Array.isArray(task.responsibleDepartmentIds) || task.responsibleDepartmentIds.length > 100 ||
      task.responsibleDepartmentIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0))) return "Selecione áreas válidas para assumir a tarefa.";
    if (!validTypes.has(task.taskType)) return "O tipo de tarefa é inválido.";
    if (!Number.isSafeInteger(Number(task.dueOffsetDays)) || Number(task.dueOffsetDays) < -32768 || Number(task.dueOffsetDays) > 32767) return "O prazo deve ser um número de dias entre -32.768 e 32.767.";
    if (typeof task.required !== "boolean") return "Informe se a tarefa é obrigatória.";
  }
  return null;
}

function normalizeTaskTypesForStages(tasks, stages) {
  const stageCodes = new Map(stages.map((stage) => [stage.stage_template_id, stage.stage_code]));
  return tasks.map((task) => {
    const isPreEntry = stageCodes.get(Number(task.stageTemplateId)) === "pre-entry";
    return { ...task, taskType: isPreEntry ? "preparation" : task.taskType === "preparation" ? "task" : task.taskType };
  });
}

function validateTaskAssignments(tasks, stages) {
  const stageCodes = new Map(stages.map((stage) => [stage.stage_template_id, stage.stage_code]));
  for (const task of tasks) {
    const hasPerson = task.ownerEmployeeId !== null && task.ownerEmployeeId !== undefined && task.ownerEmployeeId !== "";
    if (hasPerson && stageCodes.get(Number(task.stageTemplateId)) === "pre-entry") return "A tarefa de pré-entrada deve ter uma equipe ou departamento responsável para que alguém possa assumi-la.";
    if (!hasPerson && stageCodes.get(Number(task.stageTemplateId)) !== "pre-entry") return "Selecione uma pessoa responsável para cada tarefa fora da pré-entrada.";
    if (!hasPerson && !(task.responsibleDepartmentIds?.length || Number.isSafeInteger(Number(task.responsibleDepartmentId)) && Number(task.responsibleDepartmentId) > 0)) return "Selecione ao menos uma área com permissão para assumir cada tarefa de equipe ou departamento.";
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
        task.category,
        task.task_type AS "taskType",
        task.owner_role AS "ownerRole", task.owner_employee_id AS "ownerEmployeeId",
        task.responsible_department_id AS "responsibleDepartmentId",
        COALESCE(NULLIF(task.responsible_department_ids, '{}'), ARRAY[task.responsible_department_id]) AS "responsibleDepartmentIds",
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
        ownerEmployeeId: row.ownerEmployeeId, ownerName: row.ownerName, responsibleDepartmentId: row.responsibleDepartmentId, responsibleDepartmentIds: row.responsibleDepartmentIds?.filter(Boolean) ?? [],
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stageIds = [...new Set(tasks.map((task) => Number(task.stageTemplateId)))];
    const validStages = await client.query("SELECT stage_template_id, stage_code FROM public.stage_templates WHERE is_active IS TRUE AND stage_template_id = ANY($1::int[])", [stageIds]);
    if (validStages.rowCount !== stageIds.length) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: "Um pacote contém uma etapa inexistente ou inativa." });
    }
    const tasksForStorage = normalizeTaskTypesForStages(tasks, validStages.rows);
    const assignmentError = validateTaskAssignments(tasksForStorage, validStages.rows);
    if (assignmentError) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: assignmentError });
    }
    const ownerIds = [...new Set(tasksForStorage.map((task) => Number(task.ownerEmployeeId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    const validOwners = await client.query("SELECT employee_id FROM public.employees WHERE is_active IS TRUE AND employee_id = ANY($1::int[])", [ownerIds]);
    if (validOwners.rowCount !== ownerIds.length) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: "Um pacote contém uma pessoa responsável inexistente ou inativa." });
    }
    const departmentIds = [...new Set(tasksForStorage.flatMap((task) => [...(task.responsibleDepartmentIds ?? []), task.responsibleDepartmentId].map(Number)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    const validDepartments = departmentIds.length ? await client.query("SELECT department_id FROM public.departments WHERE department_id = ANY($1::int[])", [departmentIds]) : { rowCount: 0 };
    if (validDepartments.rowCount !== departmentIds.length) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: "Um pacote contém uma área responsável inexistente." });
    }
    const presetResult = await client.query(`
      INSERT INTO public.hr_task_presets (name, description, created_by)
      VALUES ($1, $2, $3)
      RETURNING hr_task_preset_id AS id, name, description
    `, [name, description, request.authenticatedEmployee.employee_id]);
    const preset = presetResult.rows[0];
    const stageOrder = new Map();
    for (const task of tasksForStorage) {
      const stageId = Number(task.stageTemplateId);
      const displayOrder = stageOrder.get(stageId) ?? 0;
      stageOrder.set(stageId, displayOrder + 1);
      await client.query(`
        INSERT INTO public.hr_task_preset_tasks (
          hr_task_preset_id, stage_template_id, title, description, category, task_type, owner_employee_id,
          owner_role, due_offset_days, is_required, display_order, responsible_department_id, responsible_department_ids
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::int,
          (SELECT COALESCE((SELECT membership.department_id FROM public.employee_departments AS membership
            WHERE membership.employee_id = owner.employee_id AND membership.is_primary IS TRUE LIMIT 1), owner.department_id)
            FROM public.employees AS owner WHERE owner.employee_id = $7)), $13::int[])
      `, [preset.id, stageId, task.title.trim(), task.description.trim(), task.category, task.taskType,
        task.ownerEmployeeId == null || task.ownerEmployeeId === "" ? null : Number(task.ownerEmployeeId), task.ownerRole.trim(), Number(task.dueOffsetDays), task.required, displayOrder, task.responsibleDepartmentId || task.responsibleDepartmentIds?.[0] || null, task.responsibleDepartmentIds?.map(Number) ?? []]);
    }
    await client.query("COMMIT");
    return response.status(201).json({ ...preset, tasks: tasksForStorage });
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
        COALESCE((SELECT json_agg(access.department_id ORDER BY department.name)
          FROM public.employee_preparation_department_access AS access
          INNER JOIN public.departments AS department ON department.department_id = access.department_id
          WHERE access.employee_id = employee.employee_id), '[]'::json) AS "preparationDepartmentIds",
        employee.manager_employee_id AS "managerEmployeeId",
        manager.full_name AS "managerName", employee.is_active AS "isActive",
        onboarding.mentor_employee_id AS "mentorEmployeeId",
        to_char(onboarding.start_date, 'YYYY-MM-DD') AS "startDate",
        mentor.full_name AS "mentorName",
        (SELECT COUNT(*)::int FROM public.employee_plan_tasks AS plan_task
          WHERE plan_task.employee_id = employee.employee_id) AS "planTaskCount"
      FROM public.employees AS employee
      LEFT JOIN public.employees AS manager ON manager.employee_id = employee.manager_employee_id
      LEFT JOIN LATERAL (
        SELECT onboarding.mentor_employee_id, onboarding.start_date
        FROM public.onboardings AS onboarding
        WHERE onboarding.employee_id = employee.employee_id AND onboarding.status = 'active'
        ORDER BY onboarding.updated_at DESC, onboarding.onboarding_id DESC
        LIMIT 1
      ) AS onboarding ON TRUE
      LEFT JOIN public.employees AS mentor ON mentor.employee_id = onboarding.mentor_employee_id
      WHERE employee.is_hr_admin IS FALSE
      ORDER BY employee.full_name;
    `);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load HR accounts:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar as contas." });
  }
});

app.get("/api/hr/overdue-count", requireHr, async (_request, response) => {
  try {
    const result = await pool.query(`
      WITH employee_tasks AS (
        SELECT stage.stage_code,
          COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days AS due_date,
          COALESCE(progress.is_completed, FALSE) AS is_completed
        FROM public.employee_plan_tasks AS plan_task
        INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
        INNER JOIN public.employees AS employee ON employee.employee_id = plan_task.employee_id
        LEFT JOIN public.employee_plan_task_progress AS progress
          ON progress.employee_plan_task_id = plan_task.employee_plan_task_id AND progress.employee_id = plan_task.employee_id
        LEFT JOIN LATERAL (
          SELECT onboarding.start_date
          FROM public.onboardings AS onboarding
          WHERE onboarding.employee_id = employee.employee_id AND onboarding.status = 'active'
          ORDER BY onboarding.updated_at DESC, onboarding.onboarding_id DESC
          LIMIT 1
        ) AS onboarding ON TRUE
        WHERE employee.is_active IS TRUE AND employee.is_hr_admin IS FALSE
      )
      SELECT COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE stage_code = 'pre-entry')::int AS "preEntryCount"
      FROM employee_tasks
      WHERE is_completed IS FALSE AND due_date < CURRENT_DATE
    `);
    return response.json(result.rows[0] ?? { count: 0, preEntryCount: 0 });
  } catch (error) {
    console.error("Could not load HR overdue task count:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar a quantidade de itens atrasados." });
  }
});

app.get("/api/hr/overdue-tasks", requireHr, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT employee.employee_id AS "employeeId", employee.full_name AS "employeeName",
        employee.email AS "employeeEmail", employee.job_title AS "employeeJobTitle",
        stage.stage_template_id AS "stageTemplateId", stage.stage_code AS "stageCode", stage.name AS "stageName",
        plan_task.employee_plan_task_id AS "taskId", plan_task.title AS "taskTitle",
        plan_task.due_offset_days AS "dueOffsetDays", owner.full_name AS "ownerName",
        plan_task.owner_role AS "ownerRole",
        COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days AS "dueDate",
        CURRENT_DATE - (COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days) AS "overdueDays",
        COUNT(*) OVER()::int AS "totalCount"
      FROM public.employee_plan_tasks AS plan_task
      INNER JOIN public.employees AS employee ON employee.employee_id = plan_task.employee_id
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
      LEFT JOIN public.employees AS owner ON owner.employee_id = plan_task.owner_employee_id
      LEFT JOIN public.employee_plan_task_progress AS progress
        ON progress.employee_plan_task_id = plan_task.employee_plan_task_id AND progress.employee_id = plan_task.employee_id
      LEFT JOIN LATERAL (
        SELECT onboarding.start_date
        FROM public.onboardings AS onboarding
        WHERE onboarding.employee_id = employee.employee_id AND onboarding.status = 'active'
        ORDER BY onboarding.updated_at DESC, onboarding.onboarding_id DESC
        LIMIT 1
      ) AS onboarding ON TRUE
      WHERE employee.is_active IS TRUE AND employee.is_hr_admin IS FALSE
        AND COALESCE(progress.is_completed, FALSE) IS FALSE
        AND COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days < CURRENT_DATE
      ORDER BY (stage.stage_code = 'pre-entry') DESC,
        COALESCE(onboarding.start_date, employee.created_at::date) + plan_task.due_offset_days ASC,
        employee.full_name, plan_task.title
      LIMIT 100
    `);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load HR overdue tasks:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar os itens atrasados das jornadas." });
  }
});

app.get("/api/hr/responsibles", requireHr, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT employee.employee_id AS id, employee.full_name AS name,
        employee.job_title AS "jobTitle", employee.department_id AS "departmentId",
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
    const diagnosticId = randomUUID();
    console.error("Could not load HR teams:", { diagnosticId, code: error.code, message: error.message });
    if (isTeamSchemaError(error)) {
      return response.status(503).json({ error: "O banco está sem as migrações de equipes necessárias. Aplique as migrações 014 e 015 no banco do Azure.", diagnosticId });
    }
    return response.status(500).json({ error: "Não foi possível carregar as equipes.", diagnosticId });
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
    const failure = teamWriteError(error, "create");
    return response.status(failure.status).json(failure.body);
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
    const failure = teamWriteError(error, "update");
    return response.status(failure.status).json(failure.body);
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
  const audienceRaw = decodeHeader("x-resource-employee-ids").trim();
  const audienceEmployeeIds = parseResourceAudienceIds(audienceRaw ? audienceRaw.split(",") : []);
  const originalName = path.basename(decodeHeader("x-file-name").replaceAll("\\", "/"));
  const mimeType = (request.get("x-file-type") ?? "application/octet-stream").toLowerCase().split(";")[0].trim() || "application/octet-stream";
  const contents = request.body;
  if (!Buffer.isBuffer(contents)) return response.status(400).json({ error: "Envie um arquivo válido." });
  if (!title || title.length > 180 || description.length > 1200 || !categorySlug || originalName.length < 1 || originalName.length > 255) {
    return response.status(400).json({ error: "Confira o título, a categoria, a descrição e o nome do arquivo." });
  }
  if (!contents.length || contents.length > maximumResourceFileSize) return response.status(400).json({ error: "O arquivo deve ter até 25 MB e não pode estar vazio." });
  if (!audienceEmployeeIds) return response.status(400).json({ error: "Confira as pessoas selecionadas para este arquivo." });
  if (!(await hasActiveResourceAudience(audienceEmployeeIds))) return response.status(400).json({ error: "Uma ou mais pessoas selecionadas não estão ativas." });
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
      ) VALUES ($1, $2, NULLIF($3, ''), $4, $5, NULL, 'draft')
      RETURNING resource_id AS id
    `, [category.rows[0].id, title, description, extension, mimeType]);
    await replaceResourceAudience(client, resource.rows[0].id, audienceEmployeeIds);
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
  const audienceValue = request.body?.audienceEmployeeIds ?? (request.body?.audienceEmployeeId ? [request.body.audienceEmployeeId] : []);
  const audienceEmployeeIds = parseResourceAudienceIds(audienceValue);
  if (!audienceEmployeeIds) return response.status(400).json({ error: "Confira as pessoas selecionadas para este arquivo." });
  if (!(await hasActiveResourceAudience(audienceEmployeeIds))) return response.status(400).json({ error: "Uma ou mais pessoas selecionadas não estão ativas." });
  let parsedUrl;
  try { parsedUrl = new URL(externalUrl); } catch { return response.status(400).json({ error: "Informe um link válido." }); }
  if (!title || title.length > 180 || description.length > 1200 || !categorySlug || externalUrl.length > 1000 || !["http:", "https:"].includes(parsedUrl.protocol)) {
    return response.status(400).json({ error: "Confira o título, a descrição, a categoria e o link do material." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      INSERT INTO public.resources (
        resource_category_id, title, description, format, mime_type, owner_employee_id,
        external_url, status
      )
      SELECT category.resource_category_id, $2, NULLIF($3, ''), 'LINK', 'text/uri-list', NULL, $4, 'published'
      FROM public.resource_categories AS category
      WHERE category.slug = $1
      RETURNING resource_id AS id
    `, [categorySlug, title, description, externalUrl]);
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: "A categoria selecionada não existe." });
    }
    await replaceResourceAudience(client, result.rows[0].id, audienceEmployeeIds);
    await client.query("COMMIT");
    return response.status(201).json({ id: result.rows[0].id, title, description: description || null, format: "LINK", external_url: externalUrl });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not store HR resource link:", error.message);
    return response.status(500).json({ error: "Não foi possível salvar o link do material." });
  } finally {
    client.release();
  }
});

app.patch("/api/hr/resources/:resourceId", requireHr, async (request, response) => {
  const resourceId = parseAccountId(request.params.resourceId);
  const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
  const description = typeof request.body?.description === "string" ? request.body.description.trim() : "";
  const categorySlug = typeof request.body?.categorySlug === "string" ? request.body.categorySlug.trim() : "";
  const sourceType = request.body?.sourceType;
  const externalUrl = typeof request.body?.externalUrl === "string" ? request.body.externalUrl.trim() : "";
  const audienceValue = request.body?.audienceEmployeeIds ?? (request.body?.audienceEmployeeId ? [request.body.audienceEmployeeId] : []);
  const audienceEmployeeIds = parseResourceAudienceIds(audienceValue);
  if (!audienceEmployeeIds) return response.status(400).json({ error: "Confira as pessoas selecionadas para este arquivo." });
  if (!(await hasActiveResourceAudience(audienceEmployeeIds))) return response.status(400).json({ error: "Uma ou mais pessoas selecionadas não estão ativas." });
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
        owner_employee_id = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE resource_id = $1
    `, [resourceId, category.rows[0].resource_category_id, title, description, sourceType, sourceType === "link" ? externalUrl : null]);
    await replaceResourceAudience(client, resourceId, audienceEmployeeIds);
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
  const audienceRaw = decodeHeader("x-resource-employee-ids").trim();
  const audienceEmployeeIds = parseResourceAudienceIds(audienceRaw ? audienceRaw.split(",") : []);
  const originalName = path.basename(decodeHeader("x-file-name").replaceAll("\\", "/"));
  const mimeType = (request.get("x-file-type") ?? "application/octet-stream").toLowerCase().split(";")[0].trim() || "application/octet-stream";
  const contents = request.body;
  if (!resourceId || !Buffer.isBuffer(contents) || !title || title.length > 180 || description.length > 1200 || !categorySlug || !originalName || originalName.length > 255 || mimeType.length > 120) {
    return response.status(400).json({ error: "Confira os dados do material e o arquivo selecionado." });
  }
  if (!contents.length || contents.length > maximumResourceFileSize) return response.status(400).json({ error: "O arquivo deve ter até 25 MB e não pode estar vazio." });
  if (!audienceEmployeeIds) return response.status(400).json({ error: "Confira as pessoas selecionadas para este arquivo." });
  if (!(await hasActiveResourceAudience(audienceEmployeeIds))) return response.status(400).json({ error: "Uma ou mais pessoas selecionadas não estão ativas." });
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
        owner_employee_id = NULL,
        status = 'published', updated_at = CURRENT_TIMESTAMP
      WHERE resource_id = $1
    `, [resourceId, category.rows[0].resource_category_id, title, description, extension, mimeType, `private:${storageKey}`]);
    await replaceResourceAudience(client, resourceId, audienceEmployeeIds);
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
  const preparationDepartmentIds = parseOrganizationIds(request.body?.preparationDepartmentIds);
  const teamIds = parseOrganizationIds(request.body?.teamIds);
  const departmentId = departmentIds?.[0] ?? null;
  const managerEmployeeId = request.body?.managerEmployeeId === "" || request.body?.managerEmployeeId == null ? null : Number(request.body.managerEmployeeId);
  const mentorEmployeeId = request.body?.mentorEmployeeId === "" || request.body?.mentorEmployeeId == null ? null : Number(request.body.mentorEmployeeId);
  const requestedStartDate = request.body?.startDate;
  const startDate = typeof requestedStartDate === "string" && requestedStartDate.trim() ? requestedStartDate.trim() : null;
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!name || name.length > 160 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Informe nome e um e-mail válido." });
  }
  if (jobTitle.length > 120) return response.status(400).json({ error: "O cargo pode ter até 120 caracteres." });
  if (startDate && !isValidDateOnly(startDate)) return response.status(400).json({ error: "Informe uma data de entrada válida." });
  if (!password || password.length < 8 || password.length > 1024) {
    return response.status(400).json({ error: "A senha inicial deve ter entre 8 e 1.024 caracteres." });
  }
  if (managerEmployeeId !== null && (!Number.isSafeInteger(managerEmployeeId) || managerEmployeeId <= 0)) {
    return response.status(400).json({ error: "Selecione uma liderança válida." });
  }
  if (mentorEmployeeId !== null && (!Number.isSafeInteger(mentorEmployeeId) || mentorEmployeeId <= 0 || mentorEmployeeId === managerEmployeeId)) {
    return response.status(400).json({ error: "Selecione uma pessoa mentora diferente da liderança direta." });
  }

  try {
    const organizationError = await validateOrganizationIds(departmentIds, teamIds);
    if (organizationError) return response.status(400).json({ error: organizationError });
    const preparationAccessError = await validateOrganizationIds(preparationDepartmentIds, []);
    if (preparationAccessError) return response.status(400).json({ error: "Selecione áreas válidas para as permissões de preparação." });
    if (managerEmployeeId !== null) {
      const manager = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_active IS TRUE AND is_hr_admin IS FALSE", [managerEmployeeId]);
      if (!manager.rowCount) return response.status(400).json({ error: "A liderança selecionada não existe ou está inativa." });
    }
    if (mentorEmployeeId !== null) {
      const mentor = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_active IS TRUE AND is_hr_admin IS FALSE", [mentorEmployeeId]);
      if (!mentor.rowCount) return response.status(400).json({ error: "A pessoa mentora selecionada não existe ou está inativa." });
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
      await saveEmployeePreparationAccess(client, result.rows[0].id, preparationDepartmentIds, request.authenticatedEmployee.employee_id);
      if (startDate || mentorEmployeeId !== null) {
        await client.query(`
          INSERT INTO public.onboardings (employee_id, mentor_employee_id, start_date, status)
          VALUES ($1, $2, $3::date, 'active')
        `, [result.rows[0].id, mentorEmployeeId, startDate]);
      }
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
  const hasPreparationDepartmentIds = Object.hasOwn(request.body ?? {}, "preparationDepartmentIds");
  const preparationDepartmentIds = hasPreparationDepartmentIds ? parseOrganizationIds(request.body?.preparationDepartmentIds) : null;
  const teamIds = parseOrganizationIds(request.body?.teamIds);
  const departmentId = departmentIds?.[0] ?? null;
  const managerEmployeeId = request.body?.managerEmployeeId === "" || request.body?.managerEmployeeId == null ? null : Number(request.body.managerEmployeeId);
  const mentorEmployeeId = request.body?.mentorEmployeeId === "" || request.body?.mentorEmployeeId == null ? null : Number(request.body.mentorEmployeeId);
  const requestedStartDate = request.body?.startDate;
  const startDate = typeof requestedStartDate === "string" && requestedStartDate.trim() ? requestedStartDate.trim() : null;
  const isActive = request.body?.isActive;
  if (!name || name.length > 160 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Informe nome e um e-mail válido." });
  }
  if (jobTitle.length > 120) return response.status(400).json({ error: "O cargo pode ter até 120 caracteres." });
  if (startDate && !isValidDateOnly(startDate)) return response.status(400).json({ error: "Informe uma data de entrada válida." });
  if (typeof isActive !== "boolean") return response.status(400).json({ error: "Informe se a conta está ativa." });
  if (managerEmployeeId !== null && (!Number.isSafeInteger(managerEmployeeId) || managerEmployeeId <= 0 || managerEmployeeId === accountId)) return response.status(400).json({ error: "Selecione uma liderança válida." });
  if (mentorEmployeeId !== null && (!Number.isSafeInteger(mentorEmployeeId) || mentorEmployeeId <= 0 || mentorEmployeeId === accountId || mentorEmployeeId === managerEmployeeId)) return response.status(400).json({ error: "Selecione uma pessoa mentora diferente do funcionário e da liderança direta." });
  try {
    const organizationError = await validateOrganizationIds(departmentIds, teamIds);
    if (organizationError) return response.status(400).json({ error: organizationError });
    if (hasPreparationDepartmentIds) {
      const preparationAccessError = await validateOrganizationIds(preparationDepartmentIds, []);
      if (preparationAccessError) return response.status(400).json({ error: "Selecione áreas válidas para as permissões de preparação." });
    }
    const target = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_hr_admin IS FALSE", [accountId]);
    if (!target.rowCount) return response.status(404).json({ error: "Pessoa não encontrada." });
    if (managerEmployeeId !== null) {
      const manager = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_hr_admin IS FALSE", [managerEmployeeId]);
      if (!manager.rowCount) return response.status(400).json({ error: "A liderança selecionada não existe ou está inativa." });
    }
    if (mentorEmployeeId !== null) {
      const mentor = await pool.query("SELECT 1 FROM public.employees WHERE employee_id = $1 AND is_active IS TRUE AND is_hr_admin IS FALSE", [mentorEmployeeId]);
      if (!mentor.rowCount) return response.status(400).json({ error: "A pessoa mentora selecionada não existe ou está inativa." });
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
      if (hasPreparationDepartmentIds) await saveEmployeePreparationAccess(client, accountId, preparationDepartmentIds, request.authenticatedEmployee.employee_id);
      const activeOnboarding = await client.query(`
        UPDATE public.onboardings AS onboarding
        SET mentor_employee_id = $2, start_date = $3::date, updated_at = CURRENT_TIMESTAMP
        WHERE onboarding.onboarding_id = (
          SELECT candidate.onboarding_id
          FROM public.onboardings AS candidate
          WHERE candidate.employee_id = $1 AND candidate.status = 'active'
          ORDER BY candidate.updated_at DESC, candidate.onboarding_id DESC
          LIMIT 1
        )
        RETURNING onboarding.onboarding_id
      `, [accountId, mentorEmployeeId, startDate]);
      if (!activeOnboarding.rowCount) {
        if (startDate || mentorEmployeeId !== null) {
          await client.query(`
            INSERT INTO public.onboardings (employee_id, mentor_employee_id, start_date, status)
            VALUES ($1, $2, $3::date, 'active')
          `, [accountId, mentorEmployeeId, startDate]);
        }
      }
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
        plan_task.category,
        plan_task.task_type AS "taskType",
        plan_task.owner_role AS "ownerRole", plan_task.owner_employee_id AS "ownerEmployeeId",
        task_owner.full_name AS "ownerName", plan_task.due_offset_days AS "dueOffsetDays",
        plan_task.responsible_department_id AS "responsibleDepartmentId", department.name AS "responsibleDepartment",
        COALESCE(NULLIF(plan_task.responsible_department_ids, '{}'), ARRAY[plan_task.responsible_department_id]) AS "responsibleDepartmentIds",
        plan_task.is_required AS required
      FROM public.employee_plan_tasks AS plan_task
      INNER JOIN public.stage_templates AS stage ON stage.stage_template_id = plan_task.stage_template_id
      LEFT JOIN public.employees AS task_owner ON task_owner.employee_id = plan_task.owner_employee_id
      LEFT JOIN public.departments AS department ON department.department_id = plan_task.responsible_department_id
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
        AND (NOT EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id)
          OR EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id AND audience.employee_id = $1))
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
    let validatedStages = [];
    if (stageIds.length) {
      const stageResult = await client.query("SELECT stage_template_id, stage_code FROM public.stage_templates WHERE is_active IS TRUE AND stage_template_id = ANY($1::int[])", [stageIds]);
      if (stageResult.rowCount !== stageIds.length) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: "Uma ou mais etapas não existem ou estão inativas." });
      }
      validatedStages = stageResult.rows;
    }
    const tasksForStorage = normalizeTaskTypesForStages(tasks, validatedStages);
    const assignmentError = validateTaskAssignments(tasksForStorage, validatedStages);
    if (assignmentError) {
      await client.query("ROLLBACK");
      return response.status(400).json({ error: assignmentError });
    }
    const ownerIds = [...new Set(tasksForStorage.map((task) => Number(task.ownerEmployeeId)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (ownerIds.length) {
      const owners = await client.query("SELECT employee_id FROM public.employees WHERE is_active IS TRUE AND employee_id = ANY($1::int[])", [ownerIds]);
      if (owners.rowCount !== ownerIds.length) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: "Uma ou mais pessoas responsáveis não existem ou estão inativas." });
      }
    }
    const departmentIds = [...new Set(tasksForStorage.flatMap((task) => [...(task.responsibleDepartmentIds ?? []), task.responsibleDepartmentId].map(Number)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (departmentIds.length) {
      const validDepartments = await client.query("SELECT department_id FROM public.departments WHERE department_id = ANY($1::int[])", [departmentIds]);
      if (validDepartments.rowCount !== departmentIds.length) {
        await client.query("ROLLBACK");
        return response.status(400).json({ error: "Uma ou mais áreas responsáveis não existem." });
      }
    }
    const resourceIds = [...new Set(resources.flatMap((resource) => resource.resourceIds.map(Number)))];
    if (resourceIds.length) {
      const published = await client.query(`SELECT resource.resource_id FROM public.resources AS resource
        WHERE resource.status = 'published'
          AND (NOT EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id)
            OR EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id AND audience.employee_id = $2))
          AND resource.resource_id = ANY($1::bigint[])`, [resourceIds, accountId]);
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
    for (const task of tasksForStorage) {
      const stageId = Number(task.stageTemplateId);
      const displayOrder = stageOrders.get(stageId) ?? 0;
      stageOrders.set(stageId, displayOrder + 1);
      await client.query(`
        INSERT INTO public.employee_plan_tasks (
          employee_id, stage_template_id, title, description, category, task_type,
          owner_employee_id, owner_role, due_offset_days, is_required, display_order, responsible_department_id, responsible_department_ids, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::int,
          (SELECT COALESCE((SELECT membership.department_id FROM public.employee_departments AS membership
            WHERE membership.employee_id = employee.employee_id AND membership.is_primary IS TRUE LIMIT 1), employee.department_id)
            FROM public.employees AS employee WHERE employee.employee_id = $7)), $13::int[], CURRENT_TIMESTAMP)
      `, [accountId, stageId, task.title.trim(), task.description.trim(), task.category, task.taskType,
        task.ownerEmployeeId == null || task.ownerEmployeeId === "" ? null : Number(task.ownerEmployeeId),
        task.ownerRole.trim(), Number(task.dueOffsetDays), task.required, displayOrder, task.responsibleDepartmentId || task.responsibleDepartmentIds?.[0] || null, task.responsibleDepartmentIds?.map(Number) ?? []]);
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
    return response.json({ saved: tasksForStorage.length, savedResources: resourceIds.length });
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

app.get("/api/me/mentor", requireAuthenticated, async (request, response) => {
  try {
    const result = await pool.query(`
      SELECT mentor.employee_id AS id, mentor.full_name AS name, mentor.email,
        mentor.job_title AS "jobTitle", department.name AS department
      FROM public.onboardings AS onboarding
      INNER JOIN public.employees AS mentor ON mentor.employee_id = onboarding.mentor_employee_id
      LEFT JOIN public.departments AS department ON department.department_id = mentor.department_id
      WHERE onboarding.employee_id = $1 AND onboarding.status = 'active'
        AND mentor.is_active IS TRUE
      ORDER BY onboarding.updated_at DESC, onboarding.onboarding_id DESC
      LIMIT 1
    `, [request.authenticatedEmployee.employee_id]);
    return response.json(result.rows[0] ?? null);
  } catch (error) {
    console.error("Could not load employee mentor:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar sua pessoa mentora." });
  }
});

app.get("/api/people/new", requireAuthenticated, async (request, response) => {
  try {
    const result = await pool.query(`
      SELECT employee.employee_id AS id, employee.full_name AS name, employee.email,
        employee.job_title AS "jobTitle", department.name AS department,
        COALESCE(onboarding.start_date, employee.created_at::date) AS "startDate"
      FROM public.employees AS employee
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      LEFT JOIN LATERAL (
        SELECT onboarding.start_date
        FROM public.onboardings AS onboarding
        WHERE onboarding.employee_id = employee.employee_id AND onboarding.status = 'active'
        ORDER BY onboarding.updated_at DESC, onboarding.onboarding_id DESC
        LIMIT 1
      ) AS onboarding ON TRUE
      WHERE employee.is_active IS TRUE AND employee.is_hr_admin IS FALSE
        AND employee.employee_id <> $1
        AND COALESCE(onboarding.start_date, employee.created_at::date) >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY COALESCE(onboarding.start_date, employee.created_at::date) DESC, employee.full_name
      LIMIT 12
    `, [request.authenticatedEmployee.employee_id]);
    return response.json(result.rows);
  } catch (error) {
    console.error("Could not load new employee profiles:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar os novos perfis." });
  }
});

app.get("/api/employees/:employeeId", requireAuthenticated, async (request, response) => {
  const employeeId = parseAccountId(request.params.employeeId);
  if (!employeeId) return response.status(400).json({ error: "Pessoa inválida." });
  try {
    const result = await pool.query(`
      SELECT employee.employee_id AS id, employee.full_name AS name, employee.email,
        employee.job_title AS "jobTitle", department.name AS department, FALSE AS "isHrAdmin"
      FROM public.employees AS employee
      LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
      WHERE employee.employee_id = $1 AND employee.is_active IS TRUE
    `, [employeeId]);
    if (!result.rowCount) return response.status(404).json({ error: "Pessoa não encontrada." });
    return response.json(result.rows[0]);
  } catch (error) {
    console.error("Could not load employee profile:", error.message);
    return response.status(500).json({ error: "Não foi possível carregar o perfil." });
  }
});

app.get("/api/employees/:employeeId/profile-photo", requireAuthenticated, async (request, response) => {
  const employeeId = parseAccountId(request.params.employeeId);
  if (!employeeId) return response.status(400).json({ error: "Pessoa inválida." });
  try {
    const employee = await pool.query("SELECT full_name, is_active FROM public.employees WHERE employee_id = $1", [employeeId]);
    if (!employee.rowCount || (!employee.rows[0].is_active && request.authenticatedEmployee.is_hr_admin !== true)) {
      return response.status(404).json({ error: "Foto de perfil não encontrada." });
    }
    const storageKey = `profile-${employeeId}`;
    let contents;
    let mimeType;
    try {
      [contents, mimeType] = await Promise.all([
        readStoredFile(storageKey),
        getStoredFileContentType(storageKey),
      ]);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "BlobNotFound") throw error;
      const initials = employee.rows[0].full_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
      const safeInitials = initials.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]);
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.type("image/svg+xml");
      return response.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#eeedff"/><text x="50" y="54" dominant-baseline="middle" text-anchor="middle" fill="#5556d8" font-family="Arial,sans-serif" font-size="32" font-weight="700">${safeInitials}</text></svg>`);
    }
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
    const [employeeResult, departmentResult, teamResult] = await Promise.all([
      pool.query(`
        SELECT employee.employee_id AS id, employee.full_name AS name, employee.email,
          employee.job_title AS "jobTitle", department.name AS department
        FROM public.employees AS employee
        LEFT JOIN public.departments AS department ON department.department_id = employee.department_id
        WHERE employee.is_active IS TRUE AND employee.is_hr_admin IS FALSE
        ORDER BY employee.full_name;
      `),
      pool.query(`
        SELECT department.department_id AS id, department.name, department.description,
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', employee.employee_id, 'name', employee.full_name, 'email', employee.email, 'jobTitle', employee.job_title
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
              'id', employee.employee_id, 'name', employee.full_name, 'email', employee.email, 'jobTitle', employee.job_title,
              'isLeader', EXISTS (SELECT 1 FROM public.team_leaders AS leader
                WHERE leader.team_id = team.team_id AND leader.employee_id = employee.employee_id)
            ) ORDER BY employee.full_name)
            FROM public.employee_teams AS membership
            INNER JOIN public.employees AS employee ON employee.employee_id = membership.employee_id
            WHERE membership.team_id = team.team_id AND employee.is_active IS TRUE
          ), '[]'::json) AS members,
          COALESCE((
            SELECT json_agg(json_build_object('id', employee.employee_id, 'name', employee.full_name, 'email', employee.email, 'jobTitle', employee.job_title) ORDER BY employee.full_name)
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
    return response.json({ employees: employeeResult.rows, departments: departmentResult.rows, teams: teamResult.rows });
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
        AND ($2::boolean IS TRUE
          OR NOT EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id)
          OR EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id AND audience.employee_id = $3))
    `, [resourceId, request.authenticatedEmployee.is_hr_admin === true, request.authenticatedEmployee.employee_id]);
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
        NOT EXISTS (SELECT 1 FROM public.resource_audiences AS visibility WHERE visibility.resource_id = resource.resource_id) AS is_public,
        CASE WHEN $1::boolean IS TRUE THEN COALESCE((SELECT json_agg(audience.employee_id ORDER BY employee.full_name)
          FROM public.resource_audiences AS audience
          INNER JOIN public.employees AS employee ON employee.employee_id = audience.employee_id
          WHERE audience.resource_id = resource.resource_id), '[]'::json) ELSE '[]'::json END AS audience_employee_ids,
        CASE WHEN $1::boolean IS TRUE THEN COALESCE((SELECT json_agg(employee.full_name ORDER BY employee.full_name)
          FROM public.resource_audiences AS audience
          INNER JOIN public.employees AS employee ON employee.employee_id = audience.employee_id
          WHERE audience.resource_id = resource.resource_id), '[]'::json) ELSE '[]'::json END AS audience_names,
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
        AND ($1::boolean IS TRUE
          OR NOT EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id)
          OR EXISTS (SELECT 1 FROM public.resource_audiences AS audience WHERE audience.resource_id = resource.resource_id AND audience.employee_id = $2))
      ORDER BY category.name, resource.title;
    `, [request.authenticatedEmployee.is_hr_admin === true, request.authenticatedEmployee.employee_id]);

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

async function cleanupExpiredSupportConversations() {
  const result = await pool.query(`
    DELETE FROM public.employee_plan_task_issues AS issue
    USING public.employee_plan_task_issue_conversations AS conversation
    WHERE conversation.employee_plan_task_issue_id = issue.employee_plan_task_issue_id
      AND conversation.last_message_at < CURRENT_TIMESTAMP - INTERVAL '2 months'
  `);
  if (result.rowCount > 0) console.log(`Deleted ${result.rowCount} expired support conversation${result.rowCount === 1 ? "" : "s"}.`);
  await autoConfirmExpiredSupportResolutions();
}

async function autoConfirmExpiredSupportResolutions() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const due = await client.query(`
      SELECT conversation.employee_plan_task_issue_conversation_id AS id
      FROM public.employee_plan_task_issue_conversations AS conversation
      WHERE conversation.status = 'pending_confirmation'
        AND conversation.resolution_due_at <= CURRENT_TIMESTAMP
      ORDER BY conversation.resolution_due_at
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `);
    for (const { id } of due.rows) {
      await client.query(`
        UPDATE public.employee_plan_task_issue_conversations
        SET status = 'resolved', resolution_due_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE employee_plan_task_issue_conversation_id = $1
      `, [id]);
      await insertSupportSystemMessage(client, id,
        "O prazo de três dias terminou sem rejeição. A resolução foi confirmada automaticamente.");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

void cleanupExpiredSupportConversations().catch((error) => console.error("Could not delete expired support conversations:", error.message));
const supportConversationCleanupTimer = setInterval(() => {
  void cleanupExpiredSupportConversations().catch((error) => console.error("Could not delete expired support conversations:", error.message));
}, 60_000);
supportConversationCleanupTimer.unref();

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
