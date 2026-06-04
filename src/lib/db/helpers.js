export async function logAction(db, userId, action, entityType, entityId, details) {
  await db.run(
    'INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId ?? null, details]
  );
}
