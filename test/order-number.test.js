import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { initializeOrderSchema, insertOrder } from '../api/_lib/db.js';

test('Monthly order numbers advance with the insert and roll back on a rejected order', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    const sql = async (parts, ...values) => (await db.query(
        parts.reduce((query, part, i) => query + (i ? '$' + i : '') + part, ''), values
    )).rows;
    await initializeOrderSchema(sql);
    const options = { sql, ensureSchema: async () => {} };
    const order = {
        lang: 'cs', productCode: 'print', productName: 'Publikace', productPrice: 490,
        customerName: 'Test', customerEmail: 'test@example.invalid', customerPhone: '000',
        shippingMethod: 'pickup', shippingPrice: 89, totalAmount: 579, paymentProvider: 'stripe',
    };
    const add = overrides => insertOrder({ ...order, id: randomUUID(), publicToken: randomUUID(), ...overrides }, options);
    const [{ period }] = await sql`SELECT to_char(now() AT TIME ZONE 'Europe/Prague', 'YYYY-MM') AS period`;
    await sql`INSERT INTO order_month_counters VALUES ('2001-01', 17)`;
    const first = await add();
    assert.equal(first.order_number, 'MAM-' + period + '-0001');
    await assert.rejects(add({ publicToken: first.public_token }));
    const more = await Promise.all([add(), add()]);
    assert.deepEqual(more.map(o => o.order_number).sort(), ['MAM-' + period + '-0002', 'MAM-' + period + '-0003']);
});
