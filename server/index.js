import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const buildDirectory = path.resolve(currentDirectory, "../dist");

app.disable("x-powered-by");

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("PostgreSQL health check failed:", error.message);
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

function requireAuthenticated(request, response, next) {
  if (process.env.NODE_ENV !== "production" && process.env.LOCAL_AUTH_BYPASS === "true") {
    return next();
  }

  const encodedPrincipal = request.get("x-ms-client-principal");
  if (!encodedPrincipal) {
    return response.status(401).json({ error: "Authentication required." });
  }

  try {
    const principal = JSON.parse(Buffer.from(encodedPrincipal, "base64").toString("utf8"));
    if (!principal?.userId) {
      return response.status(401).json({ error: "Authentication required." });
    }

    request.authenticatedUser = principal;
    next();
  } catch {
    response.status(401).json({ error: "Authentication required." });
  }
}

app.use("/api", requireAuthenticated);

app.get("/api/stages", async (_request, response) => {
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

app.get("/api/resources", async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        resource.resource_id AS id,
        resource.title,
        resource.description,
        resource.format,
        resource.mime_type,
        resource.estimated_minutes,
        category.slug AS category_slug,
        category.name AS category,
        department.name AS owner_department,
        resource.blob_name,
        resource.external_url
      FROM public.resources AS resource
      INNER JOIN public.resource_categories AS category
        ON category.resource_category_id = resource.resource_category_id
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

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found." });
});

app.use(express.static(buildDirectory, { index: false }));

app.use((request, response) => {
  if (request.method === "GET" && !request.path.startsWith("/api")) {
    return response.sendFile(path.join(buildDirectory, "index.html"));
  }
  response.status(404).end();
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`OnRamp web app listening on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
