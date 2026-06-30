import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SevdeskApiError, SevdeskClient } from "./client.js";
import type { SevdeskConfig } from "./config.js";

type ToolServer = Pick<McpServer, "registerTool">;
type JsonObject = Record<string, unknown>;
type SevdeskListResponse = JsonObject & {
  objects?: unknown[];
  total?: string | number;
};
type QueryValue = string | number | boolean | undefined;

const TOOL_NAMES = {
  testConnection: "test_sevdesk_connection",
  listContacts: "list_contacts",
  getContact: "get_contact",
  createContact: "create_contact",
  listInvoices: "list_invoices",
  getInvoice: "get_invoice",
  createInvoiceDraft: "create_invoice_draft",
  listUnpaidInvoices: "list_unpaid_invoices",
  listRecentTransactions: "list_recent_transactions",
  getInvoicePositions: "get_invoice_positions",
  getContactCommunication: "get_contact_communication",
  listVouchers: "list_vouchers",
  getVoucher: "get_voucher",
  getOverdueInvoices: "get_overdue_invoices",
  revenueSummary: "revenue_summary",
} as const;

const TOOL_TITLES = {
  testConnection: "Test sevDesk connection",
  listContacts: "List sevDesk contacts",
  getContact: "Get sevDesk contact",
  createContact: "Create sevDesk contact",
  listInvoices: "List sevDesk invoices",
  getInvoice: "Get sevDesk invoice",
  createInvoiceDraft: "Create sevDesk invoice draft",
  listUnpaidInvoices: "List unpaid sevDesk invoices",
  listRecentTransactions: "List recent sevDesk transactions",
  getInvoicePositions: "Get sevDesk invoice positions",
  getContactCommunication: "Get sevDesk contact communication",
  listVouchers: "List sevDesk vouchers",
  getVoucher: "Get sevDesk voucher",
  getOverdueInvoices: "Get overdue sevDesk invoices",
  revenueSummary: "Summarize sevDesk revenue",
} as const;

const TOOL_DESCRIPTIONS = {
  testConnection: "Read-only health check. Verifies the sevDesk API token by reading a small page of contacts.",
  listContacts: "Read-only. Lists sevDesk contacts from the official /Contact endpoint with pagination and optional filters.",
  getContact: "Read-only. Gets one sevDesk contact by contact ID from the official /Contact/{contactId} endpoint.",
  createContact: "Creates a new sevDesk contact. It does not update existing contacts.",
  listInvoices: "Read-only. Lists sevDesk invoices from the official /Invoice endpoint with pagination and optional filters.",
  getInvoice: "Read-only. Gets one sevDesk invoice by invoice ID from the official /Invoice/{invoiceId} endpoint.",
  createInvoiceDraft: "Creates a sevDesk invoice draft only. It does not send, finalize, book, or email the invoice.",
  listUnpaidInvoices: "Read-only. Lists open/due sevDesk invoices by calling /Invoice with status 200.",
  listRecentTransactions: "Read-only. Lists sevDesk bank/payment account transactions from the official /CheckAccountTransaction endpoint.",
  getInvoicePositions: "Read-only. Gets line items for one sevDesk invoice from the official /Invoice/{invoiceId}/getPositions endpoint.",
  getContactCommunication: "Read-only. Lists email, phone, mobile, or web communication ways for one sevDesk contact from the official /CommunicationWay endpoint.",
  listVouchers: "Read-only. Lists sevDesk vouchers from the official /Voucher endpoint with pagination and optional filters.",
  getVoucher: "Read-only. Gets one sevDesk voucher by voucher ID from the official /Voucher/{voucherId} endpoint.",
  getOverdueInvoices: "Read-only. Lists open sevDesk invoices whose invoice date plus payment term is before the reference date. It does not send reminders or change invoices.",
  revenueSummary: "Read-only. Builds a compact revenue dashboard summary from sevDesk invoices. It does not create, update, send, book, or delete anything.",
} as const;

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
const createAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

const paginationSchema = {
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  countAll: z.boolean().default(true),
};

const idSchema = z.number().int().positive();
const pageSizeSchema = z.number().int().min(1).max(1000).default(100);
const maxResultsSchema = z.number().int().min(1).max(10000).default(2000);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd.");

const contactInputSchema = z
  .object({
    name: z.string().trim().min(1).optional().describe("Organization name. Use this for company contacts."),
    surename: z.string().trim().min(1).optional().describe("First name for person contacts. sevDesk spells this field 'surename'."),
    familyname: z.string().trim().min(1).optional().describe("Last name for person contacts."),
    categoryId: idSchema.optional().describe("sevDesk contact category ID. Defaults to SEVDESK_DEFAULT_CONTACT_CATEGORY_ID or 3."),
    status: z.enum(["100", "500", "1000"]).default("100").describe("100 Lead, 500 Pending, 1000 Active."),
    customerNumber: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    vatNumber: z.string().trim().min(1).optional(),
    taxNumber: z.string().trim().min(1).optional(),
  })
  .refine((value) => isValidContactInput(value), {
    message: "Provide either organization name or both surename and familyname.",
  });

const invoicePositionSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).default(19),
  unityId: idSchema.optional().describe("sevDesk unity ID. Defaults to SEVDESK_DEFAULT_UNITY_ID or 1."),
  text: z.string().trim().min(1).optional(),
  discount: z.number().min(0).max(100).optional(),
});

const createInvoiceDraftSchema = z.object({
  contactId: idSchema,
  contactPersonId: idSchema.optional().describe("sevDesk user ID. Defaults to SEVDESK_CONTACT_PERSON_ID when configured."),
  invoiceDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "Use dd.mm.yyyy."),
  deliveryDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "Use dd.mm.yyyy.").optional(),
  header: z.string().trim().min(1).optional(),
  headText: z.string().trim().min(1).optional(),
  footText: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  addressCountryId: idSchema.optional().describe("sevDesk StaticCountry ID. Defaults to SEVDESK_DEFAULT_COUNTRY_ID or 1."),
  currency: z.string().length(3).default("EUR"),
  timeToPay: z.number().int().positive().optional(),
  taxRuleId: z.enum(["1", "2", "3", "4", "5", "11", "17", "18", "19", "20", "21"]).default("1"),
  taxText: z.string().trim().min(1).default("Umsatzsteuer 19%"),
  taxType: z.enum(["default", "eu", "noteu", "custom"]).default("default"),
  positions: z.array(invoicePositionSchema).min(1).max(100),
});

function jsonText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function validationErrorText(operation: string, message: string) {
  return jsonText({
    ok: false,
    operation,
    error: message,
  });
}

function errorText(error: unknown, operation: string) {
  if (error instanceof SevdeskApiError) {
    return jsonText({
      ok: false,
      operation,
      status: error.status,
      error: error.status ? `sevDesk API request failed with HTTP ${error.status}.` : error.message,
      sevdeskMessage: error.sevdeskMessage,
    });
  }

  return jsonText({
    ok: false,
    operation,
    error: error instanceof Error ? error.message : "Unknown error.",
  });
}

function isValidContactInput(value: { name?: string; surename?: string; familyname?: string }): boolean {
  return Boolean(value.name) || (Boolean(value.surename) && Boolean(value.familyname));
}

function validateCreateInvoiceDraftInput(input: z.infer<typeof createInvoiceDraftSchema>, contactPersonId: number | undefined): string | undefined {
  if (!input.contactId) {
    return "contactId is required.";
  }
  if (!contactPersonId) {
    return "Provide contactPersonId or configure SEVDESK_CONTACT_PERSON_ID.";
  }
  if (!input.invoiceDate) {
    return "invoiceDate is required in dd.mm.yyyy format.";
  }
  if (!input.positions || input.positions.length === 0) {
    return "At least one invoice position is required.";
  }

  return undefined;
}

function objectsFromResponse(response: unknown): unknown[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const objects = (response as SevdeskListResponse).objects;
  return Array.isArray(objects) ? objects : [];
}

function totalFromResponse(response: unknown): number | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const total = (response as SevdeskListResponse).total;
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchAllObjects(
  client: SevdeskClient,
  path: string,
  query: Record<string, QueryValue>,
  options: { pageSize: number; maxResults: number },
): Promise<{ objects: unknown[]; total?: number; fetched: number; truncated: boolean }> {
  const objects: unknown[] = [];
  let offset = 0;
  let total: number | undefined;

  while (objects.length < options.maxResults) {
    const limit = Math.min(options.pageSize, options.maxResults - objects.length);
    const response = await client.get<SevdeskListResponse>(path, {
      ...query,
      limit,
      offset,
      countAll: true,
    });
    const page = objectsFromResponse(response);
    total ??= totalFromResponse(response);

    objects.push(...page);
    offset += page.length;

    if (page.length < limit || page.length === 0) {
      break;
    }
    if (total !== undefined && objects.length >= total) {
      break;
    }
  }

  return {
    objects,
    total,
    fetched: objects.length,
    truncated: total !== undefined ? objects.length < total : objects.length >= options.maxResults,
  };
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringField(value: JsonObject, key: string): string | undefined {
  const field = value[key];
  if (typeof field === "string" && field.trim()) {
    return field.trim();
  }
  if (typeof field === "number" && Number.isFinite(field)) {
    return String(field);
  }
  return undefined;
}

function numberField(value: JsonObject, key: string): number | undefined {
  const field = value[key];
  const parsed = typeof field === "string" || typeof field === "number" ? Number(field) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nestedId(value: JsonObject, key: string): string | undefined {
  const nested = asObject(value[key]);
  return stringField(nested, "id");
}

function parseSevdeskDate(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  const germanDate = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (germanDate) {
    const [, day, month, year] = germanDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(later: Date, earlier: Date): number {
  const millisecondsPerDay = 86_400_000;
  return Math.floor((Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate()) - Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate())) / millisecondsPerDay);
}

function monthKey(value: Date | undefined): string {
  return value ? value.toISOString().slice(0, 7) : "unknown";
}

function emptyMoney() {
  return {
    invoiceCount: 0,
    net: 0,
    gross: 0,
    tax: 0,
  };
}

function addMoney(target: ReturnType<typeof emptyMoney>, invoice: JsonObject): void {
  target.invoiceCount += 1;
  target.net += numberField(invoice, "sumNet") ?? 0;
  target.gross += numberField(invoice, "sumGross") ?? 0;
  target.tax += numberField(invoice, "sumTax") ?? 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function finalizeMoney(value: ReturnType<typeof emptyMoney>) {
  return {
    invoiceCount: value.invoiceCount,
    net: roundMoney(value.net),
    gross: roundMoney(value.gross),
    tax: roundMoney(value.tax),
  };
}

function contactLabel(contact: unknown): string {
  const object = asObject(contact);
  return stringField(object, "name") ?? stringField(object, "familyname") ?? nestedId({ contact }, "contact") ?? "unknown";
}

export function registerSevdeskTools(server: ToolServer, config: SevdeskConfig): void {
  const client = new SevdeskClient(config);

  server.registerTool(
    TOOL_NAMES.testConnection,
    {
      title: TOOL_TITLES.testConnection,
      description: TOOL_DESCRIPTIONS.testConnection,
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    async () => {
      const operation = "Test sevDesk connection";

      try {
        const response = await client.get("Contact", { limit: 1, offset: 0, countAll: true });
        return jsonText({
          ok: true,
          configured: true,
          baseUrl: config.baseUrl,
          response,
        });
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.listContacts,
    {
      title: TOOL_TITLES.listContacts,
      description: TOOL_DESCRIPTIONS.listContacts,
      inputSchema: z.object({
        ...paginationSchema,
        depth: z.enum(["0", "1"]).default("1").describe("0 returns organizations only; 1 returns organizations and persons."),
        customerNumber: z.string().trim().min(1).optional(),
        embed: z.string().trim().min(1).optional().describe("Optional sevDesk embed value, for example category."),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ limit, offset, countAll, depth, customerNumber, embed }) => {
      const operation = "List sevDesk contacts";

      try {
        return jsonText(await client.get("Contact", { limit, offset, countAll, depth, customerNumber, embed }));
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.getContact,
    {
      title: TOOL_TITLES.getContact,
      description: TOOL_DESCRIPTIONS.getContact,
      inputSchema: z.object({
        contactId: idSchema,
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ contactId, embed }) => {
      const operation = "Get sevDesk contact";
      if (!contactId) {
        return validationErrorText(operation, "contactId is required.");
      }

      try {
        return jsonText(await client.get(`Contact/${contactId}`, { embed }));
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.createContact,
    {
      title: TOOL_TITLES.createContact,
      description: TOOL_DESCRIPTIONS.createContact,
      inputSchema: contactInputSchema,
      annotations: createAnnotations,
    },
    async (input) => {
      const operation = "Create sevDesk contact";
      if (!isValidContactInput(input)) {
        return validationErrorText(operation, "Provide either organization name or both surename and familyname.");
      }

      const body = {
        ...input,
        category: { id: input.categoryId ?? config.defaultContactCategoryId, objectName: "Category" },
        status: Number(input.status),
      };
      delete (body as { categoryId?: number }).categoryId;

      try {
        return jsonText(await client.post("Contact", body));
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.listInvoices,
    {
      title: TOOL_TITLES.listInvoices,
      description: TOOL_DESCRIPTIONS.listInvoices,
      inputSchema: z.object({
        ...paginationSchema,
        status: z.enum(["100", "200", "1000"]).optional().describe("100 Draft, 200 Open/Due, 1000 Paid."),
        invoiceNumber: z.string().trim().min(1).optional(),
        startDate: z.number().int().optional().describe("sevDesk accepts an integer timestamp for this filter."),
        endDate: z.number().int().optional().describe("sevDesk accepts an integer timestamp for this filter."),
        contactId: idSchema.optional(),
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ limit, offset, countAll, status, invoiceNumber, startDate, endDate, contactId, embed }) => {
      const operation = "List sevDesk invoices";

      try {
        return jsonText(
          await client.get("Invoice", {
            limit,
            offset,
            countAll,
            status,
            invoiceNumber,
            startDate,
            endDate,
            "contact[id]": contactId,
            "contact[objectName]": contactId ? "Contact" : undefined,
            embed,
          }),
        );
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.getInvoice,
    {
      title: TOOL_TITLES.getInvoice,
      description: TOOL_DESCRIPTIONS.getInvoice,
      inputSchema: z.object({
        invoiceId: idSchema,
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ invoiceId, embed }) => {
      const operation = "Get sevDesk invoice";
      if (!invoiceId) {
        return validationErrorText(operation, "invoiceId is required.");
      }

      try {
        return jsonText(await client.get(`Invoice/${invoiceId}`, { embed }));
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.createInvoiceDraft,
    {
      title: TOOL_TITLES.createInvoiceDraft,
      description: TOOL_DESCRIPTIONS.createInvoiceDraft,
      inputSchema: createInvoiceDraftSchema,
      annotations: createAnnotations,
    },
    async (input) => {
      const operation = "Create sevDesk invoice draft";
      const contactPersonId = input.contactPersonId ?? config.defaultContactPersonId;
      const validationError = validateCreateInvoiceDraftInput(input, contactPersonId);
      if (validationError) {
        return validationErrorText(operation, validationError);
      }

      // This tool intentionally creates draft invoices only. Do not send, finalize,
      // book, or email invoices from this function.
      const body = {
        invoice: {
          objectName: "Invoice",
          mapAll: true,
          contact: { id: input.contactId, objectName: "Contact" },
          contactPerson: { id: contactPersonId, objectName: "SevUser" },
          invoiceDate: input.invoiceDate,
          deliveryDate: input.deliveryDate ?? input.invoiceDate,
          status: "100",
          invoiceType: "RE",
          currency: input.currency.toUpperCase(),
          discount: 0,
          address: input.address,
          addressCountry: { id: input.addressCountryId ?? config.defaultCountryId, objectName: "StaticCountry" },
          header: input.header,
          headText: input.headText,
          footText: input.footText,
          timeToPay: input.timeToPay,
          taxRate: 0,
          taxRule: { id: input.taxRuleId, objectName: "TaxRule" },
          taxText: input.taxText,
          taxType: input.taxType,
        },
        invoicePosSave: input.positions.map((position) => ({
          objectName: "InvoicePos",
          mapAll: true,
          name: position.name,
          quantity: position.quantity,
          price: position.price,
          taxRate: position.taxRate,
          unity: { id: position.unityId ?? config.defaultUnityId, objectName: "Unity" },
          text: position.text,
          discount: position.discount,
        })),
        invoicePosDelete: null,
        discountSave: [],
        discountDelete: null,
      };

      try {
        return jsonText(await client.post("Invoice/Factory/saveInvoice", body));
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.listUnpaidInvoices,
    {
      title: TOOL_TITLES.listUnpaidInvoices,
      description: TOOL_DESCRIPTIONS.listUnpaidInvoices,
      inputSchema: z.object({
        ...paginationSchema,
        contactId: idSchema.optional(),
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ limit, offset, countAll, contactId, embed }) => {
      const operation = "List unpaid sevDesk invoices";

      try {
        return jsonText(
          await client.get("Invoice", {
            limit,
            offset,
            countAll,
            status: 200,
            "contact[id]": contactId,
            "contact[objectName]": contactId ? "Contact" : undefined,
            embed,
          }),
        );
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.listRecentTransactions,
    {
      title: TOOL_TITLES.listRecentTransactions,
      description: TOOL_DESCRIPTIONS.listRecentTransactions,
      inputSchema: z.object({
        ...paginationSchema,
        checkAccountId: idSchema.optional(),
        isBooked: z.boolean().optional(),
        paymtPurpose: z.string().trim().min(1).optional(),
        startDate: z.string().datetime({ offset: true }).optional(),
        endDate: z.string().datetime({ offset: true }).optional(),
        payeePayerName: z.string().trim().min(1).optional(),
        onlyCredit: z.boolean().optional(),
        onlyDebit: z.boolean().optional(),
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ limit, offset, countAll, checkAccountId, isBooked, paymtPurpose, startDate, endDate, payeePayerName, onlyCredit, onlyDebit, embed }) => {
      const operation = "List recent sevDesk transactions";

      try {
        return jsonText(
          await client.get("CheckAccountTransaction", {
            limit,
            offset,
            countAll,
            "checkAccount[id]": checkAccountId,
            "checkAccount[objectName]": checkAccountId ? "CheckAccount" : undefined,
            isBooked,
            paymtPurpose,
            startDate,
            endDate,
            payeePayerName,
            onlyCredit,
            onlyDebit,
            embed,
          }),
        );
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.getInvoicePositions,
    {
      title: TOOL_TITLES.getInvoicePositions,
      description: TOOL_DESCRIPTIONS.getInvoicePositions,
      inputSchema: z.object({
        invoiceId: idSchema,
        limit: z.number().int().min(1).max(1000).default(100),
        offset: z.number().int().min(0).default(0),
        embed: z.string().trim().min(1).optional().describe("Optional comma-separated sevDesk embed value."),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ invoiceId, limit, offset, embed }) => {
      const operation = "Get sevDesk invoice positions";
      if (!invoiceId) {
        return validationErrorText(operation, "invoiceId is required.");
      }

      try {
        return jsonText(await client.get(`Invoice/${invoiceId}/getPositions`, { limit, offset, embed }));
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.getContactCommunication,
    {
      title: TOOL_TITLES.getContactCommunication,
      description: TOOL_DESCRIPTIONS.getContactCommunication,
      inputSchema: z.object({
        contactId: idSchema,
        type: z.enum(["PHONE", "EMAIL", "WEB", "MOBILE"]).optional(),
        mainOnly: z.boolean().optional().describe("When true, only returns the main communication way."),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ contactId, type, mainOnly }) => {
      const operation = "Get sevDesk contact communication";
      if (!contactId) {
        return validationErrorText(operation, "contactId is required.");
      }

      try {
        return jsonText(
          await client.get("CommunicationWay", {
            "contact[id]": contactId,
            "contact[objectName]": "Contact",
            type,
            main: mainOnly === undefined ? undefined : mainOnly ? "1" : "0",
          }),
        );
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.listVouchers,
    {
      title: TOOL_TITLES.listVouchers,
      description: TOOL_DESCRIPTIONS.listVouchers,
      inputSchema: z.object({
        ...paginationSchema,
        status: z.enum(["50", "100", "1000"]).optional(),
        creditDebit: z.enum(["C", "D"]).optional().describe("C credit vouchers, D debit vouchers."),
        descriptionLike: z.string().trim().min(1).optional(),
        startDate: z.number().int().optional().describe("sevDesk accepts an integer timestamp for this filter."),
        endDate: z.number().int().optional().describe("sevDesk accepts an integer timestamp for this filter."),
        contactId: idSchema.optional(),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ limit, offset, countAll, status, creditDebit, descriptionLike, startDate, endDate, contactId }) => {
      const operation = "List sevDesk vouchers";

      try {
        return jsonText(
          await client.get("Voucher", {
            limit,
            offset,
            countAll,
            status,
            creditDebit,
            descriptionLike,
            startDate,
            endDate,
            "contact[id]": contactId,
            "contact[objectName]": contactId ? "Contact" : undefined,
          }),
        );
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.getVoucher,
    {
      title: TOOL_TITLES.getVoucher,
      description: TOOL_DESCRIPTIONS.getVoucher,
      inputSchema: z.object({
        voucherId: idSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ voucherId }) => {
      const operation = "Get sevDesk voucher";
      if (!voucherId) {
        return validationErrorText(operation, "voucherId is required.");
      }

      try {
        return jsonText(await client.get(`Voucher/${voucherId}`));
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.getOverdueInvoices,
    {
      title: TOOL_TITLES.getOverdueInvoices,
      description: TOOL_DESCRIPTIONS.getOverdueInvoices,
      inputSchema: z.object({
        referenceDate: dateOnlySchema.optional().describe("Date used to calculate overdue status. Defaults to today."),
        minDaysOverdue: z.number().int().min(0).default(1),
        contactId: idSchema.optional(),
        pageSize: pageSizeSchema,
        maxResults: maxResultsSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ referenceDate, minDaysOverdue, contactId, pageSize, maxResults }) => {
      const operation = "Get overdue sevDesk invoices";
      const reference = referenceDate ? new Date(`${referenceDate}T00:00:00.000Z`) : new Date();

      try {
        const fetched = await fetchAllObjects(
          client,
          "Invoice",
          {
            status: 200,
            "contact[id]": contactId,
            "contact[objectName]": contactId ? "Contact" : undefined,
          },
          { pageSize, maxResults },
        );

        const unknownDueDate: unknown[] = [];
        const overdueInvoices = fetched.objects.flatMap((rawInvoice) => {
          const invoice = asObject(rawInvoice);
          const invoiceDate = parseSevdeskDate(invoice.invoiceDate);
          const timeToPay = numberField(invoice, "timeToPay");

          if (!invoiceDate || timeToPay === undefined) {
            unknownDueDate.push(rawInvoice);
            return [];
          }

          const dueDate = addDays(invoiceDate, timeToPay);
          const daysOverdue = daysBetween(reference, dueDate);
          if (daysOverdue < minDaysOverdue) {
            return [];
          }

          return [
            {
              id: stringField(invoice, "id"),
              invoiceNumber: stringField(invoice, "invoiceNumber"),
              invoiceDate: toDateOnly(invoiceDate),
              dueDate: toDateOnly(dueDate),
              daysOverdue,
              contact: invoice.contact,
              currency: stringField(invoice, "currency"),
              net: numberField(invoice, "sumNet"),
              gross: numberField(invoice, "sumGross"),
              status: stringField(invoice, "status"),
              timeToPay,
            },
          ];
        });

        overdueInvoices.sort((left, right) => right.daysOverdue - left.daysOverdue);

        return jsonText({
          referenceDate: toDateOnly(reference),
          minDaysOverdue,
          totalOpenFromSevDesk: fetched.total,
          fetched: fetched.fetched,
          truncated: fetched.truncated,
          overdueCount: overdueInvoices.length,
          unknownDueDateCount: unknownDueDate.length,
          overdueInvoices,
        });
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );

  server.registerTool(
    TOOL_NAMES.revenueSummary,
    {
      title: TOOL_TITLES.revenueSummary,
      description: TOOL_DESCRIPTIONS.revenueSummary,
      inputSchema: z.object({
        status: z.enum(["100", "200", "1000"]).optional().describe("100 Draft, 200 Open/Due, 1000 Paid."),
        startDate: z.number().int().optional().describe("sevDesk accepts an integer timestamp for this filter."),
        endDate: z.number().int().optional().describe("sevDesk accepts an integer timestamp for this filter."),
        contactId: idSchema.optional(),
        pageSize: pageSizeSchema,
        maxResults: maxResultsSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ status, startDate, endDate, contactId, pageSize, maxResults }) => {
      const operation = "Summarize sevDesk revenue";

      try {
        const fetched = await fetchAllObjects(
          client,
          "Invoice",
          {
            status,
            startDate,
            endDate,
            "contact[id]": contactId,
            "contact[objectName]": contactId ? "Contact" : undefined,
          },
          { pageSize, maxResults },
        );

        const total = emptyMoney();
        const byMonth = new Map<string, ReturnType<typeof emptyMoney>>();
        const byStatus = new Map<string, ReturnType<typeof emptyMoney>>();
        const byCurrency = new Map<string, ReturnType<typeof emptyMoney>>();
        const byContact = new Map<string, ReturnType<typeof emptyMoney>>();

        for (const rawInvoice of fetched.objects) {
          const invoice = asObject(rawInvoice);
          const invoiceDate = parseSevdeskDate(invoice.invoiceDate);
          const statusKey = stringField(invoice, "status") ?? "unknown";
          const currencyKey = stringField(invoice, "currency") ?? "unknown";
          const contactKey = contactLabel(invoice.contact);

          addMoney(total, invoice);

          for (const [key, map] of [
            [monthKey(invoiceDate), byMonth],
            [statusKey, byStatus],
            [currencyKey, byCurrency],
            [contactKey, byContact],
          ] as const) {
            const bucket = map.get(key) ?? emptyMoney();
            addMoney(bucket, invoice);
            map.set(key, bucket);
          }
        }

        const mapToObject = (map: Map<string, ReturnType<typeof emptyMoney>>) =>
          Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, finalizeMoney(value)]));

        return jsonText({
          filters: {
            status,
            startDate,
            endDate,
            contactId,
          },
          totalFromSevDesk: fetched.total,
          fetched: fetched.fetched,
          truncated: fetched.truncated,
          summary: finalizeMoney(total),
          byMonth: mapToObject(byMonth),
          byStatus: mapToObject(byStatus),
          byCurrency: mapToObject(byCurrency),
          topContactsByGross: [...byContact.entries()]
            .sort(([, left], [, right]) => right.gross - left.gross)
            .slice(0, 25)
            .map(([contact, values]) => ({ contact, ...finalizeMoney(values) })),
        });
      } catch (error) {
        return errorText(error, operation);
      }
    },
  );
}
