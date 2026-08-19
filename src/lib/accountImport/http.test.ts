import { describe, expect, it } from 'vitest';
import { parseChangeIds, parseRetailerIds } from '@/lib/accountImport/http';

describe('parseRetailerIds', () => {
  it('floors string and number ids the same way', () => {
    expect(parseRetailerIds([12, '12.7', ' 13 ', 14.9])).toEqual([12, 12, 13, 14]);
  });

  it('drops non-positive and non-numeric values', () => {
    expect(parseRetailerIds(['abc', 0, -2, null, '0'])).toBeUndefined();
  });
});

describe('parseChangeIds', () => {
  it('keeps uuid strings and drops junk', () => {
    expect(parseChangeIds(['11111111-1111-4111-8111-111111111111', 'not-a-uuid', 12])).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(parseChangeIds([])).toBeUndefined();
  });
});
