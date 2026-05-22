import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SevdeskApiError, SevdeskClient } from "./client.js";
import type { SevdeskConfig } from "./config.js";

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
} as const;

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
const createAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

const paginationSchema = {
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  countAll: z.boolean().default(true),
};

const idSchema = z.number().int().positive();

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

export function registerSevdeskTools(server: McpServer, config: SevdeskConfig): void {
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
}
