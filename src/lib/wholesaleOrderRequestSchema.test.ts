import { describe, expect, it } from 'vitest';
import { wholesaleOrderRequestBodySchema } from '@/lib/wholesaleOrderRequestSchema';

const orderBase = {
  idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  businessName: 'Kelowna Outfitters',
  buyerName: 'Sam Buyer',
  email: 'sam@example.com',
  phone: '250-555-0100',
  city: 'Kelowna',
  province: 'BC',
  postalCode: 'V1Y 1A1',
  retailChannel: 'Outdoor / sporting goods',
  isExistingCustomer: false,
  lines: [
    {
      productId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      sku: 'OG2513',
      name: 'American Revival',
      size: 'L',
      wholesaleUsd: 13,
      quantity: 6,
    },
  ],
};

describe('wholesaleOrderRequestBodySchema', () => {
  it('accepts a full order request', () => {
    const parsed = wholesaleOrderRequestBodySchema.safeParse(orderBase);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.requestType).toBe('order');
  });

  it('rejects an order with no lines', () => {
    const parsed = wholesaleOrderRequestBodySchema.safeParse({
      ...orderBase,
      requestType: 'order',
      lines: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a slim inquiry with only the required fields', () => {
    const parsed = wholesaleOrderRequestBodySchema.safeParse({
      idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      requestType: 'inquiry',
      businessName: 'Kelowna Outfitters',
      buyerName: 'Sam Buyer',
      email: 'sam@example.com',
      notes: 'Do you open accounts for specialty retail in BC?',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.requestType).toBe('inquiry');
      expect(parsed.data.phone).toBe('');
      expect(parsed.data.lines).toEqual([]);
    }
  });

  it('rejects an inquiry without notes', () => {
    const parsed = wholesaleOrderRequestBodySchema.safeParse({
      idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      requestType: 'inquiry',
      businessName: 'Kelowna Outfitters',
      buyerName: 'Sam Buyer',
      email: 'sam@example.com',
      notes: '   ',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.message === 'Tell Justin what you need.')).toBe(
        true,
      );
    }
  });

  it('defaults omitted publicMarket to Canada and accepts a U.S. Oregon order', () => {
    const omitted = wholesaleOrderRequestBodySchema.safeParse(orderBase);
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.publicMarket).toBe('ca');

    const usOrder = wholesaleOrderRequestBodySchema.safeParse({
      ...orderBase,
      publicMarket: 'us',
      city: 'Portland',
      province: 'OR',
      postalCode: '97201',
    });
    expect(usOrder.success).toBe(true);
    if (usOrder.success) {
      expect(usOrder.data.publicMarket).toBe('us');
      expect(usOrder.data.province).toBe('OR');
    }
  });

  it('rejects a U.S. order with a Canadian province', () => {
    const parsed = wholesaleOrderRequestBodySchema.safeParse({
      ...orderBase,
      publicMarket: 'us',
      province: 'BC',
      postalCode: '97201',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((i) => i.message === 'Oregon or Washington is required'),
      ).toBe(true);
    }
  });

  it('rejects an unknown publicMarket', () => {
    const parsed = wholesaleOrderRequestBodySchema.safeParse({
      ...orderBase,
      publicMarket: 'mx',
    });
    expect(parsed.success).toBe(false);
  });
});
