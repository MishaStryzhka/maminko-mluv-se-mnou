import { neon } from '@neondatabase/serverless';

export const regularPrices = { print: 490, full: 750 };
const initial = { active: false, percent: 20 };

export function productPrices({ active, percent }) {
    return Object.fromEntries(Object.entries(regularPrices).map(([code, price]) =>
        [code, active ? Math.round(price * (100 - percent) / 100) : price]));
}

export async function readPromotion() {
    if (!process.env.DATABASE_URL) return initial;
    const sql = neon(process.env.DATABASE_URL);
    try {
        const [row] = await sql`SELECT active, percent FROM black_friday_settings WHERE singleton`;
        return row ?? initial;
    } catch (error) {
        if (error.code === '42P01') return initial;
        throw error;
    }
}

export async function savePromotion(active, percent) {
    const sql = neon(process.env.DATABASE_URL);
    await sql.transaction([
        sql`CREATE TABLE IF NOT EXISTS black_friday_settings (
            singleton boolean PRIMARY KEY CHECK (singleton),
            active boolean NOT NULL,
            percent integer NOT NULL CHECK (percent BETWEEN 1 AND 99)
        )`,
        sql`INSERT INTO black_friday_settings VALUES (true, ${active}, ${percent})
            ON CONFLICT (singleton) DO UPDATE SET active = excluded.active, percent = excluded.percent`
    ]);
}
