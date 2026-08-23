-- Solution_Segment dari QOSMIC Bridge: terisi 16/40 baris (40%) pada sampel
-- live 2026-08-22 (nossa + nossa_closed), sebelumnya tidak punya kolom tujuan
-- sama sekali. Additive only.
ALTER TABLE `ticket_raw_bridge_ext`
  ADD COLUMN `solution_segment` TEXT NULL;
