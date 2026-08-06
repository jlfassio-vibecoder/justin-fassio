import { z } from 'zod';

export const wholesaleOrderLineSchema = z.object({
  productId: z.uuid(),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  size: z.string().min(1).max(64),
  wholesaleUsd: z.number().min(0),
  quantity: z.number().int().positive().max(10_000),
});

const optionalBlank = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v ?? '');

export const wholesaleOrderRequestBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(80),
    requestType: z.enum(['order', 'inquiry']).default('order'),
    businessName: z.string().trim().min(1).max(200),
    buyerName: z.string().trim().min(1).max(120),
    email: z.email().max(200),
    phone: optionalBlank(40),
    city: optionalBlank(120),
    province: optionalBlank(80),
    postalCode: optionalBlank(20),
    retailChannel: optionalBlank(120),
    isExistingCustomer: z.boolean().default(false),
    website: z.string().trim().max(300).optional().nullable(),
    gstHstNumber: z.string().trim().max(80).optional().nullable(),
    poNumber: z.string().trim().max(80).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    preferredContactMethod: z.string().trim().max(80).optional().nullable(),
    /** Honeypot — must be empty. */
    companyFax: z.string().max(200).optional().nullable(),
    lines: z.array(wholesaleOrderLineSchema).max(200).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.requestType === 'inquiry') {
      if (!data.notes?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['notes'],
          message: 'Tell Justin what you need.',
        });
      }
      return;
    }

    if (data.phone.length < 7) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Phone is required',
      });
    }
    if (!data.city) {
      ctx.addIssue({
        code: 'custom',
        path: ['city'],
        message: 'City is required',
      });
    }
    if (!data.province) {
      ctx.addIssue({
        code: 'custom',
        path: ['province'],
        message: 'Province is required',
      });
    }
    if (data.postalCode.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['postalCode'],
        message: 'Postal code is required',
      });
    }
    if (!data.retailChannel) {
      ctx.addIssue({
        code: 'custom',
        path: ['retailChannel'],
        message: 'Retail channel is required',
      });
    }
    if (data.lines.length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Add at least one product before submitting.',
      });
    }
  });

export type WholesaleOrderRequestBody = z.infer<typeof wholesaleOrderRequestBodySchema>;
export type WholesaleRequestType = WholesaleOrderRequestBody['requestType'];
