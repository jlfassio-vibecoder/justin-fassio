import { describe, expect, it } from 'vitest';
import { mapContactRole } from '@/lib/contactResearch/mapContactRole';

describe('mapContactRole', () => {
  it('maps owner titles', () => {
    expect(mapContactRole('Owner')).toBe('owner');
    expect(mapContactRole('Co-Founder')).toBe('owner');
    expect(mapContactRole('President')).toBe('owner');
  });

  it('maps manager titles', () => {
    expect(mapContactRole('General Manager')).toBe('manager');
    expect(mapContactRole('Store Manager')).toBe('manager');
    expect(mapContactRole('GM')).toBe('manager');
  });

  it('maps buyer titles', () => {
    expect(mapContactRole('Buyer')).toBe('buyer');
    expect(mapContactRole('Purchasing Manager')).toBe('buyer');
  });

  it('defaults blank or unknown to buyer', () => {
    expect(mapContactRole('')).toBe('buyer');
    expect(mapContactRole(null)).toBe('buyer');
    expect(mapContactRole('Sales Associate')).toBe('buyer');
  });
});
