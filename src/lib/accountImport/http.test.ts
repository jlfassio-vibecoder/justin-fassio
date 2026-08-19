import { describe, expect, it } from 'vitest';
import { parseRetailerIds } from '@/lib/accountImport/http';

describe('parseRetailerIds', () => {
  it('floors string and number ids the same way', () => {
    expect(parseRetailerIds([12, '12.7', ' 13 ', 14.9])).toEqual([12, 12, 13, 14]);
  });

  it('drops non-positive and non-numeric values', () => {
    expect(parseRetailerIds(['abc', 0, -2, null, '0'])).toBeUndefined();
  });
});
