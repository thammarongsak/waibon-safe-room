// lib/zeta/v10/config.ts
import fs from "fs";
export type UnifiedCore = any;
export const unifiedCore: UnifiedCore = JSON.parse(
  fs.readFileSync(process.cwd()+"/config/WaibonOS_Unified_Core_v10.json","utf8")
);
