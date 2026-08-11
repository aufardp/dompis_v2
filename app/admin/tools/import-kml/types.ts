export interface KmlPreviewFeature {
  name: string;
  feature_type: 'point' | 'line';
  folder_path: string;
  description_raw: string | null;
  parsed_metadata: Record<string, string> | null;
  latitude: number | null;
  longitude: number | null;
}

export interface KmlPreviewSublayer {
  folder_path: string;
  geometry_kind: 'point' | 'line';
  feature_count: number;
  sample: KmlPreviewFeature[];
}

export interface KmlPreviewData {
  title: string;
  original_filename: string;
  file_size_bytes: number;
  total_placemarks: number;
  total_parsed: number;
  total_skipped: number;
  bbox: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null;
  sublayers: KmlPreviewSublayer[];
  warnings: string[];
}

export interface KmlImportResult {
  layer_id: number;
  title: string;
  sublayer_count: number;
  feature_count: number;
  point_count: number;
  line_count: number;
  storage_path: string;
  warnings: string[];
}
