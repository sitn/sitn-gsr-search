// GeoJSON type definitions
export interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    [key: string]: any
  };
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
    srid?: string;
  };
}

export interface FTSFeature extends GeoJSONFeature {
  properties: {
    layer_name: string;
    label: string;
  }
  bbox: [number, number, number, number];
}

export interface GSRFeature extends GeoJSONFeature {
  properties: {
    nom_gsr: string;
    numero_telephone?: string;
    email?: string;
    form_prise_contact?: string;
    adresse: string;
    google_maps: string;
  }
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// FTS Search Response
export interface FTSSearchResponse extends GeoJSONFeatureCollection {
  features: FTSFeature[];
}

// Intersection Service Response
export interface IntersectionResponse extends GeoJSONFeatureCollection {
  features: GSRFeature[];
}

// Office Information extracted from intersection response
export interface OfficeInfo {
  nom_gsr: string;
  numero_telephone: string;
  email: string;
  form_prise_contact: string;
  adresse: string;
  localite: string;
  google_maps: string;
}

// Search suggestion for dropdown
export interface SearchSuggestion {
  feature: FTSFeature;
  displayText: string;
}
