// lib/zeta/v10/roles.ts

// userId ของพ่อ ใส่แค่คนเดียวพอ
const OWNER_ID = "U688db4b83e6cb70f4f5e5d121a8a07db"; // <-- ใส่ userId ของพ่อ

export function getRole(userId: string): "owner"|"friend" {
  if (userId === OWNER_ID) return "owner";
  return "friend"; // คนอื่นทั้งหมดเป็นเพื่อนพ่ออัตโนมัติ
}
