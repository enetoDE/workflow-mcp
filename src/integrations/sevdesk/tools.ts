import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SevdeskApiError, SevdeskClient } from "./client.js";
import type { SevdeskConfig } from "./config.js";

const paginationSchema = {
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  countAll: z.boolean().default(true),
};

const idSchema = z.number().int().positive();

const contactInputSchema = z
  .object({
    name: z.string().trim().min(1).optional().describe("Organization name. Use this for company contacts."),
    surename: z.string().trim().min(1).optional().describe("First name for person contacts. sevdesk spells this field 'surename'."),
    familyname: z.string().trim().min(1).optional().describe("Last name for person contacts."),
    categoryId: idSchema.optional().describe("sevdesk contact category ID. Defaults to SEVDESK_DEFAULT_CONTACT_CATEGORY_ID or 3."),
    status: z.enum(["100", "500", "1000"]).default("100").describe("100 Lead, 500 Pending, 1000 Active."),
    customerNumber: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    vatNumber: z.string().trim().min(1).optional(),
    taxNumber: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.name) || (Boolean(value.surename) && Boolean(value.familyname)), {
    message: "Provide either organization name or both surename and familyname.",
  });

const invoicePositionSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).default(19),
  unityId: idSchema.optional().describe("sevdesk unity ID. Defaults to SEVDESK_DEFAULT_UNITY_ID or 1."),
  text: z.string().trim().min(1).optional(),
  discount: z.number().min(0).max(100).optional(),
});

const createInvoiceDraftSchema = z.object({
  contactId: idSchema,
  contactPersonId: idSchema.optional().describe("sevdesk user ID. Defaults to SEVDESK_CONTACT_PERSON_ID when configured."),
  invoiceDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "Use dd.mm.yyyy."),
  deliveryDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "Use dd.mm.yyyy.").optional(),
  header: z.string().trim().min(1).optional(),
  headText: z.string().trim().min(1).optional(),
  footText: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  addressCountryId: idSchema.optional().describe("sevdesk StaticCountry ID. Defaults to SEVDESK_DEFAULT_COUNTRY_ID or 1."),
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

function errorText(error: unknown) {
  if (error instanceof SevdeskApiError) {
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

export function registerSevdeskTools(server: McpServer, config: SevdeskConfig): void {
  const client = new SevdeskClient(config);

  server.registerTool(
    "test_sevdesk_connection",
    {
      title: "Test sevdesk connection",
      description: "Checks whether SEVDESK_API_TOKEN is configured and can read a tiny page of contacts from sevdesk.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      if (!client.hasToken()) {
        return jsonText({
          ok: false,
          configured: false,
          message: "Set SEVDESK_API_TOKEN in the Claude Desktop MCP server environment.",
          baseUrl: config.baseUrl,
        });
      }

      try {
        const response = await client.get("Contact", { limit: 1, offset: 0, countAll: true });
        return jsonText({
          ok: true,
          configured: true,
          baseUrl: config.baseUrl,
          response,
        });
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_contacts",
    {
      title: "List sevdesk contacts",
      description: "Retrieves sevdesk contacts using the official /Contact endpoint.",
      inputSchema: z.object({
        ...paginationSchema,
        depth: z.enum(["0", "1"]).default("1").describe("0 returns organizations only; 1 returns organizations and persons."),
        customerNumber: z.string().trim().min(1).optional(),
        embed: z.string().trim().min(1).optional().describe("Optional sevdesk embed value, for example category."),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, offset, countAll, depth, customerNumber, embed }) => {
      try {
        return jsonText(await client.get("Contact", { limit, offset, countAll, depth, customerNumber, embed }));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_contact",
    {
      title: "Get sevdesk contact",
      description: "Retrieves one sevdesk contact by ID using /Contact/{contactId}.",
      inputSchema: z.object({
        contactId: idSchema,
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ contactId, embed }) => {
      try {
        return jsonText(await client.get(`Contact/${contactId}`, { embed }));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "create_contact",
    {
      title: "Create sevdesk contact",
      description: "Creates a sevdesk contact with the official /Contact endpoint. Addresses and communication ways are intentionally separate sevdesk endpoints and are not bundled here.",
      inputSchema: contactInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      const body = {
        ...input,
        category: { id: input.categoryId ?? config.defaultContactCategoryId, objectName: "Category" },
        status: Number(input.status),
      };
      delete (body as { categoryId?: number }).categoryId;

      try {
        return jsonText(await client.post("Contact", body));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_invoices",
    {
      title: "List sevdesk invoices",
      description: "Retrieves sevdesk invoices using the official /Invoice endpoint.",
      inputSchema: z.object({
        ...paginationSchema,
        status: z.enum(["100", "200", "1000"]).optional().describe("100 Draft, 200 Open/Due, 1000 Paid."),
        invoiceNumber: z.string().trim().min(1).optional(),
        startDate: z.number().int().optional().describe("sevdesk accepts an integer timestamp for this filter."),
        endDate: z.number().int().optional().describe("sevdesk accepts an integer timestamp for this filter."),
        contactId: idSchema.optional(),
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, offset, countAll, status, invoiceNumber, startDate, endDate, contactId, embed }) => {
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
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "get_invoice",
    {
      title: "Get sevdesk invoice",
      description: "Retrieves one sevdesk invoice by ID using /Invoice/{invoiceId}.",
      inputSchema: z.object({
        invoiceId: idSchema,
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ invoiceId, embed }) => {
      try {
        return jsonText(await client.get(`Invoice/${invoiceId}`, { embed }));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "create_invoice_draft",
    {
      title: "Create sevdesk invoice draft",
      description: "Creates a draft normal invoice through /Invoice/Factory/saveInvoice. The tool always sets status 100 and does not send, book, enshrine, or mark invoices paid.",
      inputSchema: createInvoiceDraftSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      const contactPersonId = input.contactPersonId ?? config.defaultContactPersonId;
      if (!contactPersonId) {
        return jsonText({
          ok: false,
          error: "Provide contactPersonId or configure SEVDESK_CONTACT_PERSON_ID.",
        });
      }

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
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_unpaid_invoices",
    {
      title: "List unpaid sevdesk invoices",
      description: "Lists open/due invoices by calling /Invoice with status 200. The official filter enum includes 100, 200, and 1000; partially paid status 750 is documented but not exposed in that filter enum.",
      inputSchema: z.object({
        ...paginationSchema,
        contactId: idSchema.optional(),
        embed: z.string().trim().min(1).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, offset, countAll, contactId, embed }) => {
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
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "list_recent_transactions",
    {
      title: "List recent sevdesk transactions",
      description: "Retrieves bank/payment account transactions using the official /CheckAccountTransaction endpoint.",
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
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ limit, offset, countAll, checkAccountId, isBooked, paymtPurpose, startDate, endDate, payeePayerName, onlyCredit, onlyDebit, embed }) => {
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
        return errorText(error);
      }
    },
  );
}
