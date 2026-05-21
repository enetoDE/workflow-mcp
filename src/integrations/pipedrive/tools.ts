import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PipedriveApiError, PipedriveClient } from "./client.js";
import type { PipedriveConfig } from "./config.js";

const idSchema = z.number().int().positive();
const uuidSchema = z.string().uuid();
const cursorPaginationSchema = {
  limit: z.number().int().min(1).max(500).default(100),
  cursor: z.string().trim().min(1).optional(),
  fetchAll: z.boolean().default(false).describe("When true, follows every page. Keep false for normal chat use to avoid very large responses."),
};
const offsetPaginationSchema = {
  limit: z.number().int().min(1).max(500).default(100),
  start: z.number().int().min(0).default(0),
  fetchAll: z.boolean().default(false).describe("When true, follows every page. Keep false for normal chat use to avoid very large responses."),
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

function compactListResponse(response: unknown, itemName: string, mapper: (item: Record<string, unknown>) => Record<string, unknown>) {
  if (!response || typeof response !== "object") {
    return response;
  }

  const result = response as Record<string, unknown>;
  const data = Array.isArray(result.data) ? result.data : [];

  return {
    ...result,
    summary: `Returned ${data.length} ${itemName}.`,
    returned_count: data.length,
    data: data.map((item) => (item && typeof item === "object" ? mapper(item as Record<string, unknown>) : item)),
  };
}

function valueOf(item: Record<string, unknown>, key: string): unknown {
  return item[key];
}

function nestedName(item: Record<string, unknown>, key: string): unknown {
  const value = item[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>).name : undefined;
}

function summarizeDeal(deal: Record<string, unknown>) {
  return compactObject({
    id: valueOf(deal, "id"),
    title: valueOf(deal, "title"),
    value: valueOf(deal, "value"),
    currency: valueOf(deal, "currency"),
    status: valueOf(deal, "status"),
    probability: valueOf(deal, "probability"),
    stage_id: valueOf(deal, "stage_id"),
    stage_name: nestedName(deal, "stage"),
    pipeline_id: valueOf(deal, "pipeline_id"),
    pipeline_name: nestedName(deal, "pipeline"),
    owner_id: valueOf(deal, "owner_id"),
    owner_name: nestedName(deal, "owner"),
    organization_name: nestedName(deal, "org"),
    person_name: nestedName(deal, "person"),
    add_time: valueOf(deal, "add_time"),
    update_time: valueOf(deal, "update_time"),
    expected_close_date: valueOf(deal, "expected_close_date"),
    last_activity_date: valueOf(deal, "last_activity_date"),
    next_activity_date: valueOf(deal, "next_activity_date"),
    close_time: valueOf(deal, "close_time"),
  });
}

function summarizePerson(person: Record<string, unknown>) {
  return compactObject({
    id: valueOf(person, "id"),
    name: valueOf(person, "name"),
    owner_id: valueOf(person, "owner_id"),
    owner_name: nestedName(person, "owner"),
    organization_name: nestedName(person, "org"),
    email: valueOf(person, "email"),
    phone: valueOf(person, "phone"),
    add_time: valueOf(person, "add_time"),
    update_time: valueOf(person, "update_time"),
  });
}

function summarizeOrganization(org: Record<string, unknown>) {
  return compactObject({
    id: valueOf(org, "id"),
    name: valueOf(org, "name"),
    owner_id: valueOf(org, "owner_id"),
    owner_name: nestedName(org, "owner"),
    address: valueOf(org, "address"),
    add_time: valueOf(org, "add_time"),
    update_time: valueOf(org, "update_time"),
  });
}

function summarizeActivity(activity: Record<string, unknown>) {
  return compactObject({
    id: valueOf(activity, "id"),
    subject: valueOf(activity, "subject"),
    type: valueOf(activity, "type"),
    done: valueOf(activity, "done"),
    owner_id: valueOf(activity, "owner_id"),
    deal_id: valueOf(activity, "deal_id"),
    person_id: valueOf(activity, "person_id"),
    org_id: valueOf(activity, "org_id"),
    due_date: valueOf(activity, "due_date"),
    due_time: valueOf(activity, "due_time"),
    duration: valueOf(activity, "duration"),
    update_time: valueOf(activity, "update_time"),
  });
}

function summarizeLead(lead: Record<string, unknown>) {
  return compactObject({
    id: valueOf(lead, "id"),
    title: valueOf(lead, "title"),
    owner_id: valueOf(lead, "owner_id"),
    person_id: valueOf(lead, "person_id"),
    organization_id: valueOf(lead, "organization_id"),
    value: valueOf(lead, "value"),
    currency: valueOf(lead, "currency"),
    add_time: valueOf(lead, "add_time"),
    update_time: valueOf(lead, "update_time"),
  });
}

function summarizeStage(stage: Record<string, unknown>) {
  return compactObject({
    id: valueOf(stage, "id"),
    name: valueOf(stage, "name"),
    pipeline_id: valueOf(stage, "pipeline_id"),
    order_nr: valueOf(stage, "order_nr"),
    active_flag: valueOf(stage, "active_flag"),
    deal_probability: valueOf(stage, "deal_probability"),
  });
}

function getV2List(client: PipedriveClient, path: string, query: Record<string, string | number | boolean | undefined>, fetchAll: boolean) {
  return fetchAll ? client.getAllV2(path, query) : client.getV2(path, query);
}

function getV1OffsetList(client: PipedriveClient, path: string, query: Record<string, string | number | boolean | undefined>, fetchAll: boolean) {
  return fetchAll ? client.getAllV1Offset(path, query) : client.getV1(path, query);
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
      description: "Lists matching deals with the official /api/v2/deals endpoint. Set fetchAll true only when all pages are needed.",
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
        const response = await getV2List(
          client,
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
          input.fetchAll,
        );

        return jsonText(
          compactListResponse(response, "deals", summarizeDeal),
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
      description: "Lists matching persons with /api/v2/persons. Set fetchAll true only when all pages are needed.",
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
        const response = await getV2List(
          client,
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
          input.fetchAll,
        );

        return jsonText(
          compactListResponse(response, "persons", summarizePerson),
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
      description: "Lists matching organizations with /api/v2/organizations. Set fetchAll true only when all pages are needed.",
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
        const response = await getV2List(
          client,
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
          input.fetchAll,
        );

        return jsonText(
          compactListResponse(response, "organizations", summarizeOrganization),
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
      description: "Lists matching activities with /api/v2/activities. Set fetchAll true only when all pages are needed.",
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
        const response = await getV2List(
          client,
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
          input.fetchAll,
        );

        return jsonText(
          compactListResponse(response, "activities", summarizeActivity),
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
      description: "Lists matching leads with /api/v1/leads. Set fetchAll true only when all pages are needed.",
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
        const response = await getV1OffsetList(
          client,
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
          input.fetchAll,
        );

        return jsonText(
          compactListResponse(response, "leads", summarizeLead),
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
      description: "Searches matching deals, persons, organizations, leads, and other supported item types with /api/v2/itemSearch. Set fetchAll true only when all pages are needed.",
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
          await getV2List(
            client,
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
            input.fetchAll,
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
      description: "Lists pipelines with /api/v2/pipelines. Set fetchAll true only when all pages are needed.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        sortBy: z.enum(["id", "update_time", "add_time"]).optional(),
        sortDirection: sortDirectionSchema,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, cursor, fetchAll, sortBy, sortDirection }) => {
      try {
        const response = await getV2List(client, "pipelines", compactObject({ limit, cursor, sort_by: sortBy, sort_direction: sortDirection }), fetchAll);
        return jsonText(compactListResponse(response, "pipelines", (pipeline) => compactObject({
          id: valueOf(pipeline, "id"),
          name: valueOf(pipeline, "name"),
          order_nr: valueOf(pipeline, "order_nr"),
          active: valueOf(pipeline, "is_active"),
          update_time: valueOf(pipeline, "update_time"),
        })));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_stages",
    {
      title: "List Pipedrive stages",
      description: "Lists matching stages with /api/v2/stages. Set fetchAll true only when all pages are needed.",
      inputSchema: z.object({
        ...cursorPaginationSchema,
        pipelineId: idSchema.optional(),
        sortBy: z.enum(["id", "update_time", "add_time", "order_nr"]).optional(),
        sortDirection: sortDirectionSchema,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, cursor, fetchAll, pipelineId, sortBy, sortDirection }) => {
      try {
        const response = await getV2List(
          client,
          "stages",
          compactObject({ limit, cursor, pipeline_id: pipelineId, sort_by: sortBy, sort_direction: sortDirection }),
          fetchAll,
        );

        return jsonText(
          compactListResponse(response, "stages", summarizeStage),
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
