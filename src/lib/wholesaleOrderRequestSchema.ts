import { z } from 'zod';

export const wholesaleOrderLineSchema = z.object({
  productId: z.uuid(),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  size: z.string().min(1).max(64),
  wholesaleUsd: z.number().min(0),
  quantity: z.number().int().positive().max(10_000),
});

export const wholesaleOrderRequestBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(80),
  businessName: z.string().trim().min(1).max(200),
  buyerName: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  phone: z.string().trim().min(7).max(40),
  city: z.string().trim().min(1).max(120),
  province: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(3).max(20),
  retailChannel: z.string().trim().min(1).max(120),
  isExistingCustomer: z.boolean(),
  website: z.string().trim().max(300).optional().nullable(),
  gstHstNumber: z.string().trim().max(80).optional().nullable(),
  poNumber: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  preferredContactMethod: z.string().trim().max(80).optional().nullable(),
  /** Honeypot — must be empty. */
  companyFax: z.string().max(200).optional().nullable(),
  lines: z.array(wholesaleOrderLineSchema).min(1).max(200),
});

export type WholesaleOrderRequestBody = z.infer<typeof wholesaleOrderRequestBodySchema>;
