-- Rename role "General Manager" to "Senior Leader" (id 5).
-- Covers the case where 202608040001 was already applied.
-- Idempotent: matches by id_role OR legacy key.

UPDATE `roles`
SET `name` = 'Senior Leader', `key` = 'senior_leader'
WHERE `id_role` = 5 OR `key` = 'general_manager';
