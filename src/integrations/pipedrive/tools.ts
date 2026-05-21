import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PipedriveApiError, PipedriveClient } from "./client.js";
import type { PipedriveConfig } from "./config.js";

const idSchema = z.number().int().positive();
const uuidSchema = z.string().uuid();
const cursorPaginationSchema = {
  limit: z.number().int().min(1).max(500).default(500),
  cursor: z.string().trim().min(1).optional(),
};
const offsetPaginationSchema = {
  limit: z.number().int().min(1).max(500).default(500),
  start: z.number().int().min(0).default(0),
};
const sortDirectionSchema = z.enum(["asc", "desc"]).optional();
const rfc3339Schema = z.string().datetime({ offset: true });
const customFieldsSchema = z.record(z.string(), z.unknown()).optional();

const emailOrPhoneSchema = z.object({
  value: z.string().trim().min(1),
  primary: z.boolean().optional(),
  label: z.string().trim().min(1).optional(),
});

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

export function registerPipedriveTools(server: McpServer, config: PipedriveConfig): void {
  const client = new PipedriveClient(config);

  server.registerTool(
    "test_pipedrive_crm_connection",
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
    "list_deals",
    {
      title: "List Pipedrive deals",
      description: "Lists all matching deals with the official /api/v2/deals endpoint by following cursor pagination.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        filterId: idSchema.optional(),
        ids: z.string().trim().min(1).optional().describe("Comma-separated deal IDs, up to 100."),
        ownerId: idSchema.optional(),
        personId: idSchema.optional(),
        orgId: idSchema.optional(),
        pipelineId: idSchema.optional(),
        stageId: idSchema.optional(),
        status: z.string().trim().min(1).optional().describe("open, won, lost, deleted, or comma-separated statuses."),
        updatedSince: rfc3339Schema.optional(),
        updatedUntil: rfc3339Schema.optional(),
        sortBy: z.enum(["id", "update_time", "add_time"]).optional(),
        sortDirection: sortDirectionSchema,
        includeFields: z.string().trim().min(1).optional(),
        customFields: z.string().trim().min(1).optional(),
        includeOptionLabels: z.boolean().optional(),
        includeLabels: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await client.getAllV2(
            "deals",
            compactObject({
              limit: input.limit,
              cursor: input.cursor,
              filter_id: input.filterId,
              ids: input.ids,
              owner_id: input.ownerId,
              person_id: input.personId,
              org_id: input.orgId,
              pipeline_id: input.pipelineId,
              stage_id: input.stageId,
              status: input.status,
              updated_since: input.updatedSince,
              updated_until: input.updatedUntil,
              sort_by: input.sortBy,
              sort_direction: input.sortDirection,
              include_fields: input.includeFields,
              custom_fields: input.customFields,
              include_option_labels: input.includeOptionLabels,
              include_labels: input.includeLabels,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_deal",
    {
      title: "Get Pipedrive deal",
      description: "Gets a deal by ID with /api/v2/deals/{id}.",
      inputSchema: z.object({
        dealId: idSchema,
        includeFields: z.string().trim().min(1).optional(),
        customFields: z.string().trim().min(1).optional(),
        includeOptionLabels: z.boolean().optional(),
        includeLabels: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ dealId, includeFields, customFields, includeOptionLabels, includeLabels }) => {
      try {
        return jsonText(
          await client.getV2(
            `deals/${dealId}`,
            compactObject({
              include_fields: includeFields,
              custom_fields: customFields,
              include_option_labels: includeOptionLabels,
              include_labels: includeLabels,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  const dealWriteSchema = z.object({
    title: z.string().trim().min(1),
    ownerId: idSchema.optional(),
    personId: idSchema.optional(),
    orgId: idSchema.optional(),
    pipelineId: idSchema.optional(),
    stageId: idSchema.optional(),
    value: z.number().optional(),
    currency: z.string().trim().length(3).optional(),
    status: z.enum(["open", "won", "lost", "deleted"]).optional(),
    probability: z.number().int().min(0).max(100).optional(),
    lostReason: z.string().trim().min(1).optional(),
    visibleTo: z.number().int().optional(),
    expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    labelIds: z.array(idSchema).optional(),
    customFields: customFieldsSchema,
  });

  server.registerTool(
    "create_deal",
    {
      title: "Create Pipedrive deal",
      description: "Creates a deal with the official /api/v2/deals endpoint.",
      inputSchema: dealWriteSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        return jsonText(await client.postV2("deals", dealBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "update_deal",
    {
      title: "Update Pipedrive deal",
      description: "Updates deal fields with the official PATCH /api/v2/deals/{id} endpoint.",
      inputSchema: dealWriteSchema.partial().extend({ dealId: idSchema }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ dealId, ...input }) => {
      try {
        return jsonText(await client.patchV2(`deals/${dealId}`, dealBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_persons",
    {
      title: "List Pipedrive persons",
      description: "Lists all matching persons with /api/v2/persons by following cursor pagination.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        filterId: idSchema.optional(),
        ids: z.string().trim().min(1).optional(),
        ownerId: idSchema.optional(),
        orgId: idSchema.optional(),
        dealId: idSchema.optional(),
        updatedSince: rfc3339Schema.optional(),
        updatedUntil: rfc3339Schema.optional(),
        sortBy: z.enum(["id", "update_time", "add_time"]).optional(),
        sortDirection: sortDirectionSchema,
        includeFields: z.string().trim().min(1).optional(),
        customFields: z.string().trim().min(1).optional(),
        includeOptionLabels: z.boolean().optional(),
        includeLabels: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await client.getAllV2(
            "persons",
            compactObject({
              limit: input.limit,
              cursor: input.cursor,
              filter_id: input.filterId,
              ids: input.ids,
              owner_id: input.ownerId,
              org_id: input.orgId,
              deal_id: input.dealId,
              updated_since: input.updatedSince,
              updated_until: input.updatedUntil,
              sort_by: input.sortBy,
              sort_direction: input.sortDirection,
              include_fields: input.includeFields,
              custom_fields: input.customFields,
              include_option_labels: input.includeOptionLabels,
              include_labels: input.includeLabels,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_person",
    {
      title: "Get Pipedrive person",
      description: "Gets a person by ID with /api/v2/persons/{id}.",
      inputSchema: z.object({
        personId: idSchema,
        includeFields: z.string().trim().min(1).optional(),
        customFields: z.string().trim().min(1).optional(),
        includeOptionLabels: z.boolean().optional(),
        includeLabels: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ personId, includeFields, customFields, includeOptionLabels, includeLabels }) => {
      try {
        return jsonText(
          await client.getV2(
            `persons/${personId}`,
            compactObject({
              include_fields: includeFields,
              custom_fields: customFields,
              include_option_labels: includeOptionLabels,
              include_labels: includeLabels,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "create_person",
    {
      title: "Create Pipedrive person",
      description: "Creates a person with /api/v2/persons.",
      inputSchema: z.object({
        name: z.string().trim().min(1),
        ownerId: idSchema.optional(),
        orgId: idSchema.optional(),
        emails: z.array(emailOrPhoneSchema).optional(),
        phones: z.array(emailOrPhoneSchema).optional(),
        visibleTo: z.number().int().optional(),
        labelIds: z.array(idSchema).optional(),
        marketingStatus: z.string().trim().min(1).optional(),
        customFields: customFieldsSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        return jsonText(await client.postV2("persons", personBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_organizations",
    {
      title: "List Pipedrive organizations",
      description: "Lists all matching organizations with /api/v2/organizations by following cursor pagination.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        filterId: idSchema.optional(),
        ids: z.string().trim().min(1).optional(),
        ownerId: idSchema.optional(),
        updatedSince: rfc3339Schema.optional(),
        updatedUntil: rfc3339Schema.optional(),
        sortBy: z.enum(["id", "update_time", "add_time"]).optional(),
        sortDirection: sortDirectionSchema,
        includeFields: z.string().trim().min(1).optional(),
        customFields: z.string().trim().min(1).optional(),
        includeOptionLabels: z.boolean().optional(),
        includeLabels: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await client.getAllV2(
            "organizations",
            compactObject({
              limit: input.limit,
              cursor: input.cursor,
              filter_id: input.filterId,
              ids: input.ids,
              owner_id: input.ownerId,
              updated_since: input.updatedSince,
              updated_until: input.updatedUntil,
              sort_by: input.sortBy,
              sort_direction: input.sortDirection,
              include_fields: input.includeFields,
              custom_fields: input.customFields,
              include_option_labels: input.includeOptionLabels,
              include_labels: input.includeLabels,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "create_organization",
    {
      title: "Create Pipedrive organization",
      description: "Creates an organization with /api/v2/organizations.",
      inputSchema: z.object({
        name: z.string().trim().min(1),
        ownerId: idSchema.optional(),
        visibleTo: z.number().int().optional(),
        labelIds: z.array(idSchema).optional(),
        address: z
          .object({
            value: z.string().trim().min(1),
            country: z.string().trim().min(1).optional(),
            locality: z.string().trim().min(1).optional(),
            postal_code: z.string().trim().min(1).optional(),
          })
          .optional(),
        customFields: customFieldsSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        return jsonText(await client.postV2("organizations", organizationBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_activities",
    {
      title: "List Pipedrive activities",
      description: "Lists all matching activities with /api/v2/activities by following cursor pagination.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        filterId: idSchema.optional(),
        ids: z.string().trim().min(1).optional(),
        ownerId: idSchema.optional(),
        dealId: idSchema.optional(),
        leadId: uuidSchema.optional(),
        personId: idSchema.optional(),
        orgId: idSchema.optional(),
        done: z.boolean().optional(),
        updatedSince: rfc3339Schema.optional(),
        updatedUntil: rfc3339Schema.optional(),
        sortBy: z.enum(["id", "update_time", "add_time", "due_date"]).optional(),
        sortDirection: sortDirectionSchema,
        includeFields: z.string().trim().min(1).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await client.getAllV2(
            "activities",
            compactObject({
              limit: input.limit,
              cursor: input.cursor,
              filter_id: input.filterId,
              ids: input.ids,
              owner_id: input.ownerId,
              deal_id: input.dealId,
              lead_id: input.leadId,
              person_id: input.personId,
              org_id: input.orgId,
              done: input.done,
              updated_since: input.updatedSince,
              updated_until: input.updatedUntil,
              sort_by: input.sortBy,
              sort_direction: input.sortDirection,
              include_fields: input.includeFields,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "create_activity",
    {
      title: "Create Pipedrive activity",
      description: "Creates an activity with /api/v2/activities.",
      inputSchema: z.object({
        subject: z.string().trim().min(1).optional(),
        type: z.string().trim().min(1).optional(),
        ownerId: idSchema.optional(),
        dealId: idSchema.optional(),
        leadId: uuidSchema.optional(),
        personId: idSchema.optional(),
        orgId: idSchema.optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dueTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        duration: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        busy: z.boolean().optional(),
        done: z.boolean().optional(),
        location: z.string().trim().min(1).optional(),
        note: z.string().trim().min(1).optional(),
        publicDescription: z.string().trim().min(1).optional(),
        priority: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        return jsonText(await client.postV2("activities", activityBody(input)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_leads",
    {
      title: "List Pipedrive leads",
      description: "Lists all matching leads with /api/v1/leads by following offset pagination because the official lead list endpoint is v1.",
      inputSchema: z.object({
        ...offsetPaginationSchema,
        ownerId: idSchema.optional(),
        personId: idSchema.optional(),
        organizationId: idSchema.optional(),
        filterId: idSchema.optional(),
        updatedSince: rfc3339Schema.optional(),
        sort: z.string().trim().min(1).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await client.getAllV1Offset(
            "leads",
            compactObject({
              limit: input.limit,
              start: input.start,
              owner_id: input.ownerId,
              person_id: input.personId,
              organization_id: input.organizationId,
              filter_id: input.filterId,
              updated_since: input.updatedSince,
              sort: input.sort,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_lead",
    {
      title: "Get Pipedrive lead",
      description: "Gets a lead by UUID with /api/v1/leads/{id}.",
      inputSchema: z.object({ leadId: uuidSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ leadId }) => {
      try {
        return jsonText(await client.getV1(`leads/${leadId}`));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "search_entities",
    {
      title: "Search Pipedrive entities",
      description: "Searches all matching deals, persons, organizations, leads, and other supported item types with /api/v2/itemSearch by following cursor pagination.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        term: z.string().trim().min(1),
        itemTypes: z.array(z.enum(["deal", "person", "organization", "product", "lead", "file", "mail_attachment", "project"])).optional(),
        fields: z.array(z.enum(["address", "code", "custom_fields", "email", "name", "notes", "phone", "title", "description"])).optional(),
        searchForRelatedItems: z.boolean().optional(),
        exactMatch: z.boolean().optional(),
        includeFields: z.string().trim().min(1).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (input) => {
      try {
        return jsonText(
          await client.getAllV2(
            "itemSearch",
            compactObject({
              term: input.term,
              limit: input.limit,
              cursor: input.cursor,
              item_types: input.itemTypes?.join(","),
              fields: input.fields?.join(","),
              search_for_related_items: input.searchForRelatedItems,
              exact_match: input.exactMatch,
              include_fields: input.includeFields,
            }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_pipelines",
    {
      title: "List Pipedrive pipelines",
      description: "Lists all pipelines with /api/v2/pipelines by following cursor pagination.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        sortBy: z.enum(["id", "update_time", "add_time"]).optional(),
        sortDirection: sortDirectionSchema,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, cursor, sortBy, sortDirection }) => {
      try {
        return jsonText(await client.getAllV2("pipelines", compactObject({ limit, cursor, sort_by: sortBy, sort_direction: sortDirection })));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_stages",
    {
      title: "List Pipedrive stages",
      description: "Lists all matching stages with /api/v2/stages by following cursor pagination.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        pipelineId: idSchema.optional(),
        sortBy: z.enum(["id", "update_time", "add_time", "order_nr"]).optional(),
        sortDirection: sortDirectionSchema,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, cursor, pipelineId, sortBy, sortDirection }) => {
      try {
        return jsonText(
          await client.getAllV2(
            "stages",
            compactObject({ limit, cursor, pipeline_id: pipelineId, sort_by: sortBy, sort_direction: sortDirection }),
          ),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );
}

function dealBody(input: Record<string, unknown>) {
  return compactObject({
    title: input.title,
    owner_id: input.ownerId,
    person_id: input.personId,
    org_id: input.orgId,
    pipeline_id: input.pipelineId,
    stage_id: input.stageId,
    value: input.value,
    currency: input.currency,
    status: input.status,
    probability: input.probability,
    lost_reason: input.lostReason,
    visible_to: input.visibleTo,
    expected_close_date: input.expectedCloseDate,
    label_ids: input.labelIds,
    custom_fields: input.customFields,
  });
}

function personBody(input: Record<string, unknown>) {
  return compactObject({
    name: input.name,
    owner_id: input.ownerId,
    org_id: input.orgId,
    emails: input.emails,
    phones: input.phones,
    visible_to: input.visibleTo,
    label_ids: input.labelIds,
    marketing_status: input.marketingStatus,
    custom_fields: input.customFields,
  });
}

function organizationBody(input: Record<string, unknown>) {
  return compactObject({
    name: input.name,
    owner_id: input.ownerId,
    visible_to: input.visibleTo,
    label_ids: input.labelIds,
    address: input.address,
    custom_fields: input.customFields,
  });
}

function activityBody(input: Record<string, unknown>) {
  return compactObject({
    subject: input.subject,
    type: input.type,
    owner_id: input.ownerId,
    deal_id: input.dealId,
    lead_id: input.leadId,
    person_id: input.personId,
    org_id: input.orgId,
    due_date: input.dueDate,
    due_time: input.dueTime,
    duration: input.duration,
    busy: input.busy,
    done: input.done,
    location: input.location,
    note: input.note,
    public_description: input.publicDescription,
    priority: input.priority,
  });
}
