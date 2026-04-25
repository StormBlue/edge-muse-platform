import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { AppBindings } from "../types";

export function getDb(env: AppBindings) {
  return drizzle(env.DB, { schema });
}
