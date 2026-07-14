-- Covering index untuk SELECT lookup di processBatch()
-- Query: SELECT incident, sourceHash, status, syncVersion, sourceUpdatedAt
--        FROM ticket_raw WHERE incident IN (...)
-- Dengan index ini, query bisa dipenuhi dari index saja tanpa table lookup
CREATE INDEX idx_ticket_raw_lookup
ON ticket_raw (incident, sourceHash, status, syncVersion, sourceUpdatedAt)
ALGORITHM=INPLACE LOCK=NONE;
