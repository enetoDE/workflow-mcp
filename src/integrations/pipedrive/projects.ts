import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PipedriveApiError, PipedriveClient } from "./client.js";
import type { PipedriveConfig } from "./config.js";

const idSchema = z.number().int().positive();
const cursorPaginationSchema = {
  limit: z.number().int().min(1).max(500).default(100),
  cursor: z.string().trim().min(1).optional(),
  fetchAll: z.boolean().default(false).describe("When true, follows every page. Keep false for normal chat use to avoid very large responses."),
};
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const customFieldsSchema = z.record(z.string(), z.unknown()).optional();
const projectStatusSchema = z.enum(["open", "completed", "canceled", "deleted"]);
const searchableProjectFieldSchema = z.enum(["custom_fields", "notes", "title", "description"]);

function jsonText(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function errorText(error: unknown) {
  if (error instanceof PipedriveApiError) {
    return jsonText({
      ok: false,
      error: error.message,
      status: error.status,
      details: error.details,
    });
  }

  return jsonText({
    ok: false,
    error: error instanceof Error ? error.message : "Unknown error.",
  });
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function getV2List(client: PipedriveClient, path: string, query: Record<string, string | number | boolean | undefined>, fetchAll: boolean) {
  return fetchAll ? client.getAllV2(path, query) : client.getV2(path, query);
}

const projectWriteSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  status: projectStatusSchema.optional(),
  boardId: idSchema.optional(),
  phaseId: idSchema.optional(),
  ownerId: idSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  dealIds: z.array(idSchema).optional(),
  personIds: z.array(idSchema).optional(),
  orgIds: z.array(idSchema).optional(),
  labelIds: z.array(idSchema).optional(),
  templateId: idSchema.optional().describe("Only used by Pipedrive when creating a new project."),
  customFields: customFieldsSchema,
});

const taskWriteSchema = z.object({
  title: z.string().trim().min(1),
  projectId: idSchema,
  parentTaskId: idSchema.optional(),
  description: z.string().trim().min(1).optional(),
  done: z.boolean().optional(),
  milestone: z.boolean().optional(),
  dueDate: dateSchema.optional(),
  startDate: dateSchema.optional(),
  assigneeId: idSchema.optional(),
  assigneeIds: z.array(idSchema).optional(),
  priority: z.number().int().optional(),
});

export function registerPipedriveProjectTools(server: McpServer, config: PipedriveConfig): void {
  const client = new PipedriveClient(config);

  server.registerTool(
    "test_pipedrive_connection",
    {
      title: "Test Pipedrive connection",
      description: "Checks Pipedrive configuration and calls the official /api/v1/users/me endpoint.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      if (!client.isConfigured()) {
        return jsonText({
          ok: false,
          configured: false,
          message: "Set PIPEDRIVE_API_TOKEN and PIPEDRIVE_DOMAIN in the Claude Desktop MCP server environment.",
          domain: config.domain,
        });
      }

      try {
        return jsonText({ ok: true, response: await client.getV1("users/me") });
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List Pipedrive projects",
      description: "Lists matching non-archived projects with the official /api/v2/projects endpoint. Set fetchAll true only when all pages are needed.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        filterId: idSchema.optional(),
        status: z.string().trim().min(1).optional().describe("open, completed, canceled, deleted, or comma-separated statuses."),
        phaseId: idSchema.optional(),
        dealId: idSchema.optional(),
        personId: idSchema.optional(),
        orgId: idSchema.optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await getV2List(
            client,
            "projects",
            compactObject({
              limit: input.limit,
              cursor: input.cursor,
              filter_id: input.filterId,
              status: input.status,
              phase_id: input.phaseId,
              deal_id: input.dealId,
              person_id: input.personId,
              org_id: input.orgId,
            }),
            input.fetchAll,
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get Pipedrive project",
      description: "Gets a project by ID with /api/v2/projects/{id}.",
      inputSchema: z.object({ projectId: idSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ projectId }) => {
      try {
        return jsonText(await client.getV2(`projects/${projectId}`));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "create_project",
    {
      title: "Create Pipedrive project",
      description: "Creates a project with /api/v2/projects. Custom fields must be supplied in customFields.",
      inputSchema: projectWriteSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        return jsonText(await client.postV2("projects", projectBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "update_project",
    {
      title: "Update Pipedrive project",
      description: "Updates a project with PATCH /api/v2/projects/{id}.",
      inputSchema: projectWriteSchema.partial().extend({ projectId: idSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ projectId, ...input }) => {
      try {
        return jsonText(await client.patchV2(`projects/${projectId}`, projectBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  // Pipedrive marks project phases as beta in the official API reference.
  server.registerTool(
    "list_project_phases",
    {
      title: "List Pipedrive project phases",
      description: "Lists active project phases for a board with beta /api/v2/phases.",
      inputSchema: z.object({ boardId: idSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ boardId }) => {
      try {
        return jsonText(await client.getV2("phases", { board_id: boardId }));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_project_templates",
    {
      title: "List Pipedrive project templates",
      description: "Lists not-deleted project templates with /api/v2/projectTemplates. Set fetchAll true only when all pages are needed.",
      inputSchema: z.object(cursorPaginationSchema),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, cursor, fetchAll }) => {
      try {
        return jsonText(await getV2List(client, "projectTemplates", compactObject({ limit, cursor }), fetchAll));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_project_template",
    {
      title: "Get Pipedrive project template",
      description: "Gets a project template by ID with /api/v2/projectTemplates/{id}. Project templates are read-only in the official API reference.",
      inputSchema: z.object({ templateId: idSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId }) => {
      try {
        return jsonText(await client.getV2(`projectTemplates/${templateId}`));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  // Pipedrive marks Tasks API v2 as beta in the official API reference.
  server.registerTool(
    "list_project_tasks",
    {
      title: "List Pipedrive project tasks",
      description: "Lists matching tasks for a project with beta /api/v2/tasks?project_id=... Set fetchAll true only when all pages are needed.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        projectId: idSchema,
        isDone: z.boolean().optional(),
        isMilestone: z.boolean().optional(),
        assigneeId: idSchema.optional(),
        parentTaskId: z.union([idSchema, z.literal("null")]).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await getV2List(
            client,
            "tasks",
            compactObject({
              limit: input.limit,
              cursor: input.cursor,
              project_id: input.projectId,
              is_done: input.isDone,
              is_milestone: input.isMilestone,
              assignee_id: input.assigneeId,
              parent_task_id: input.parentTaskId,
            }),
            input.fetchAll,
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_project_task",
    {
      title: "Get Pipedrive project task",
      description: "Gets a task by ID with beta /api/v2/tasks/{id}.",
      inputSchema: z.object({ taskId: idSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ taskId }) => {
      try {
        return jsonText(await client.getV2(`tasks/${taskId}`));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "create_project_task",
    {
      title: "Create Pipedrive project task",
      description: "Creates a project task with beta /api/v2/tasks.",
      inputSchema: taskWriteSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        return jsonText(await client.postV2("tasks", taskBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "update_project_task",
    {
      title: "Update Pipedrive project task",
      description: "Updates a task with beta PATCH /api/v2/tasks/{id}.",
      inputSchema: taskWriteSchema.partial().extend({ taskId: idSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ taskId, ...input }) => {
      try {
        return jsonText(await client.patchV2(`tasks/${taskId}`, taskBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "search_projects",
    {
      title: "Search Pipedrive projects",
      description: "Searches matching projects with beta /api/v2/projects/search. Set fetchAll true only when all pages are needed.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        term: z.string().trim().min(1),
        fields: z.array(searchableProjectFieldSchema).optional(),
        exactMatch: z.boolean().optional(),
        personId: idSchema.optional(),
        organizationId: idSchema.optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await getV2List(
            client,
            "projects/search",
            compactObject({
              term: input.term,
              limit: input.limit,
              cursor: input.cursor,
              fields: input.fields?.join(","),
              exact_match: input.exactMatch,
              person_id: input.personId,
              organization_id: input.organizationId,
            }),
            input.fetchAll,
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );
}

function projectBody(input: Record<string, unknown>) {
  return compactObject({
    title: input.title,
    description: input.description,
    status: input.status,
    board_id: input.boardId,
    phase_id: input.phaseId,
    owner_id: input.ownerId,
    start_date: input.startDate,
    end_date: input.endDate,
    deal_ids: input.dealIds,
    person_ids: input.personIds,
    org_ids: input.orgIds,
    label_ids: input.labelIds,
    template_id: input.templateId,
    custom_fields: input.customFields,
  });
}

function taskBody(input: Record<string, unknown>) {
  return compactObject({
    title: input.title,
    project_id: input.projectId,
    parent_task_id: input.parentTaskId,
    description: input.description,
    done: typeof input.done === "boolean" ? (input.done ? 1 : 0) : undefined,
    milestone: typeof input.milestone === "boolean" ? (input.milestone ? 1 : 0) : undefined,
    due_date: input.dueDate,
    start_date: input.startDate,
    assignee_id: input.assigneeId,
    assignee_ids: input.assigneeIds,
    priority: input.priority,
  });
}
