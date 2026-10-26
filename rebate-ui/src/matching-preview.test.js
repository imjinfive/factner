import test from 'node:test';
import assert from 'node:assert/strict';
import { getMatchingPreview } from './matching-preview.js';

test('preview respects category and preferred region without falling back to unrelated candidates', () => {
  const boxes = getMatchingPreview({ role: 'brand', category: 'box', region: 'chungcheong' });
  const supplies = getMatchingPreview({ role: 'brand', category: 'supplies', region: 'chungcheong' });
  assert.ok(boxes.length > 0 && supplies.length > 0);
  assert.ok(boxes.every(item => item.category === '박스' && item.region === '충청'));
  assert.notDeepEqual(boxes.map(item => item.title), supplies.map(item => item.title));
});

test('Seoul, Gyeonggi and Incheon select distinct regional candidates', () => {
  for (const [region, label, category] of [['seoul', '서울', 'box'], ['gyeonggi', '경기', 'supplies'], ['incheon', '인천', 'box']]) {
    const candidates = getMatchingPreview({ role: 'brand', category, region });
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every(item => item.region === label));
  }
});

test('supplier capacity excludes brand requests above available quantity', () => {
  const small = getMatchingPreview({ role: 'supplier', category: 'box', region: 'all', capacity: '5000' });
  const large = getMatchingPreview({ role: 'supplier', category: 'box', region: 'all', capacity: '100000' });
  assert.ok(small.length > 0);
  assert.ok(small.every(item => Number(item.quantity.split('개')[0].replaceAll(',', '')) <= 5000));
  assert.notDeepEqual(small.map(item => item.id), large.map(item => item.id));
  assert.deepEqual(getMatchingPreview({ role: 'supplier', category: 'box', region: 'gyeongsang', capacity: '5000' }), []);
});

test('unsupported and incomplete selections produce no candidates', () => {
  const valid = { role: 'brand', category: 'box', region: 'all' };
  for (const input of [{ ...valid, role: 'admin' }, { ...valid, category: 'unknown' }, { ...valid, region: '' }, { ...valid, role: 'supplier' }, { ...valid, role: 'supplier', capacity: '-1' }]) assert.deepEqual(getMatchingPreview(input), []);
});

test('public preview is explicitly fictional and contains no identity or contact fields', () => {
  for (const role of ['brand', 'supplier']) {
    const result = getMatchingPreview({ role, category: 'packaging', region: 'all', capacity: 'over' });
    assert.ok(result.length > 0 && result.length <= 5);
    assert.ok(result.every(item => item.demo && /^[A-E](업체|브랜드)$/.test(item.label)));
    for (const candidate of result) assert.deepEqual(Object.keys(candidate).sort(), ['id', 'label', 'region', 'category', 'title', 'quantity', 'schedule', 'note', 'demo'].sort());
    assert.doesNotMatch(JSON.stringify(result), /https?:|@|010-|검증 완료|매칭률/);
  }
});
