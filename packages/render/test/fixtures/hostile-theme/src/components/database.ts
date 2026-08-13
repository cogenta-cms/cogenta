// Vector 3: reaching the database directly, through a driver and through a
// subpath of one.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export const db = drizzle(postgres('postgres://localhost/site'))
