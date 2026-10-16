import test from "node:test";
import assert from "node:assert/strict";
import {
  suppliers,
  filterSuppliers,
  eligibleSuppliers,
  validateRequest,
  readSaved,
} from "./model.js";

test("search combines category, verified and quantity filters without changing source order", () => {
  assert.deepEqual(
    filterSuppliers(suppliers, { category: "단상자", visitedOnly: true }).map(
      (s) => s.id,
    ),
    ["paper"],
  );
  assert.equal(filterSuppliers(suppliers, { query: "없는업체" }).length, 0);
  assert.deepEqual(
    filterSuppliers(suppliers, { smallOnly: true, query: "  화성  " }).map(
      (s) => s.id,
    ),
    ["box"],
  );
  assert.equal(
    filterSuppliers(suppliers, { sort: "리뷰 많은 순" })[0].id,
    "box",
  );
  assert.equal(suppliers[0].id, "paper");
});

test('saved activity tolerates corrupt browser data and filters invalid records', () => {
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => '{broken' };
    assert.deepEqual(readSaved('rebate:requests', []), []);
    globalThis.localStorage = { getItem: () => JSON.stringify(['paper', 'unknown']) };
    assert.deepEqual(readSaved('rebate:favorites', []), ['paper']);
    const valid = { id: 'request-1', brand: '샘플', category: '단상자', quantity: 500, description: '샘플 제작', createdAt: '2026-10-16T00:00:00.000Z' };
    globalThis.localStorage = { getItem: () => JSON.stringify([valid, { ...valid, quantity: -1 }, { ...valid, description: {} }, { ...valid, createdAt: 'invalid' }]) };
    assert.deepEqual(readSaved('rebate:requests', []), [valid]);
    globalThis.localStorage = { getItem: () => { throw new Error('Storage unavailable'); } };
    assert.deepEqual(readSaved('rebate:favorites', []), []);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});
test("platinum priority cannot override production requirements", () => {
  assert.deepEqual(
    eligibleSuppliers(suppliers, { category: "쇼핑백", quantity: 300 }).map(
      (s) => s.id,
    ),
    ["form"],
  );
  assert.equal(
    eligibleSuppliers(suppliers, {
      category: "쇼핑백",
      quantity: 1000,
      days: 5,
    }).length,
    0,
  );
  const candidates = [
    { ...suppliers[0], id: "gold", tier: "골드" },
    { ...suppliers[0], id: "platinum" },
  ];
  assert.equal(
    eligibleSuppliers(candidates, { category: "단상자", quantity: 1000 })[0].id,
    "platinum",
  );
  assert.equal(
    eligibleSuppliers(suppliers, { category: "단상자", quantity: "invalid" })
      .length,
    0,
  );
});
test("request rejects missing details and invalid quantities", () => {
  assert.equal(Object.keys(validateRequest({})).length, 4);
  const valid = {
    category: "단상자",
    brand: "샘플브랜드",
    quantity: "500",
    description: "스킨케어 단상자 제작",
  };
  assert.deepEqual(validateRequest(valid), {});
  for (const quantity of ["0", "-1", "1.5", "Infinity", "10000001"])
    assert.ok(validateRequest({ ...valid, quantity }).quantity);
});
