export interface KmlSublayer {
  id: number;
  folderPath: string;
  geometryKind: 'point' | 'line';
  featureCount: number;
  defaultVisible: boolean;
}

export interface KmlLayerItem {
  id: number;
  title: string;
  originalFilename: string;
  workzoneTag: string | null;
  pointCount: number;
  lineCount: number;
  bbox: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null;
  uploadedAt: string;
  uploadedBy: string | null;
  sublayers: KmlSublayer[];
}

export interface KmlLayersResponse {
  layers: KmlLayerItem[];
  canManage: boolean;
}

export type KmlIconKey = 'star' | 'pushpin' | 'dot' | 'square' | 'triangle' | null;

export interface KmlFeatureProperties {
  id: number;
  name: string;
  featureType: 'point' | 'line';
  folderPath: string;
  descriptionRaw: string | null;
  parsedMetadata: Record<string, string> | null;
  styleColor: string | null;
  lineColor: string | null;
  lineWidth: number | null;
  iconKey: KmlIconKey;
  iconColor: string | null;
  iconScale: number | null;
  nodeRole: 'odc' | 'odp' | 'tiang' | null;
  sublayerId: number;
}

export interface KmlGeoJsonResponse {
  success: boolean;
  data?: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      properties: KmlFeatureProperties;
      geometry:
        | { type: 'Point'; coordinates: [number, number] }
        | { type: 'LineString'; coordinates: [number, number][] };
    }>;
    meta: { total: number };
  };
  message?: string;
}

export type { OdpAlert, OdpAlertTier, OdpNearbyPoint, OdpPointLike } from './geo';
