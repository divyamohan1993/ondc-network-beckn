import { createDb } from '@ondc/shared';

const { db, pool } = createDb(process.env.DATABASE_URL!);

export { pool };
export default db;
