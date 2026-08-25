-- Target KPI untuk "TTR Comply SQM 4H" terlewat di seed awal kpi_target.
-- Data only, additive.
INSERT INTO `kpi_target` (`metric_key`, `target_value`, `updated_at`)
VALUES ('ttr_comply_sqm_4h', 77.95, NOW(3))
ON DUPLICATE KEY UPDATE `metric_key` = `metric_key`;
