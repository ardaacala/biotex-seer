/**
 * Photo field stripping for list endpoints to reduce upfront payload size.
 * Photos remain accessible via dedicated detail endpoints or GET /api/photo/:table/:id/:field.
 */

export const PHOTO_FIELDS_BY_TABLE = {
  production_records: [
    'photoUrl',
    'pastalPhotoUrl',
    'urunIslemPhotoUrl',
    'katlamaPhotoUrl',
    'setToplamaPhotoUrl',
    'kolilemePhotoUrl',
    'sevkiyatPhotoUrl',
    'sevkiyatZeosPhotoUrl',
    'sterilizasyonPhotoUrl',
  ],
  order_items: [
    'pastalPhotoUrl',
    'urunIslemPhotoUrl',
    'katlamaPhotoUrl',
  ],
  samples: ['photoUrl'],
  sample_items: ['photoUrl'],
  shipments: [],
} as const;

export type PhotoTable = keyof typeof PHOTO_FIELDS_BY_TABLE;

/**
 * Returns a shallow clone with photo fields removed and a `hasPhoto` flag
 * indicating whether any photo field had a non-empty value.
 */
export function stripPhotos<T extends Record<string, any>>(obj: T, table: PhotoTable): T & { hasPhoto: boolean } {
  if (!obj) return obj as any;
  const fields = PHOTO_FIELDS_BY_TABLE[table] as readonly string[];
  let hasPhoto = false;
  const clone: any = { ...obj };
  for (const f of fields) {
    if (clone[f] && typeof clone[f] === 'string' && clone[f].length > 0) {
      hasPhoto = true;
    }
    if (f in clone) clone[f] = null;
  }
  clone.hasPhoto = hasPhoto;
  return clone;
}

export function stripPhotosArray<T extends Record<string, any>>(arr: T[], table: PhotoTable): (T & { hasPhoto: boolean })[] {
  return arr.map(o => stripPhotos(o, table));
}

const hasNonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0;

/**
 * Strips inline base64 photo fields from a bare shipment_plans row and adds
 * boolean flags. Used for POST/PATCH responses that return only the row.
 */
export function stripShipmentPlanRowPhotos<
  T extends { driverPhoto?: string | null; cargoLabelPhoto?: string | null }
>(plan: T): Omit<T, 'driverPhoto' | 'cargoLabelPhoto'> & {
  driverPhoto: null;
  cargoLabelPhoto: null;
  hasDriverPhoto: boolean;
  hasCargoLabelPhoto: boolean;
} {
  return {
    ...plan,
    driverPhoto: null,
    cargoLabelPhoto: null,
    hasDriverPhoto: hasNonEmptyString(plan.driverPhoto),
    hasCargoLabelPhoto: hasNonEmptyString(plan.cargoLabelPhoto),
  };
}

type ShipmentPlanDetail<
  Plan extends { driverPhoto?: string | null; cargoLabelPhoto?: string | null },
  Addr extends { irsaliyePhoto?: string | null },
  Item extends { irsaliyePhoto?: string | null },
  Photo extends { photoUrl?: string | null }
> = Plan & { addresses: Addr[]; items: Item[]; photos: Photo[] };

/**
 * Strips inline base64 photo fields from a fully-hydrated shipment plan detail
 * (plan row + nested addresses/items/photos) and adds boolean flags so the
 * client can fetch each photo on demand via GET /api/photo/:table/:id/:field.
 */
export function stripShipmentPlanPhotos<
  Plan extends { driverPhoto?: string | null; cargoLabelPhoto?: string | null },
  Addr extends { irsaliyePhoto?: string | null },
  Item extends { irsaliyePhoto?: string | null },
  Photo extends { photoUrl?: string | null }
>(plan: ShipmentPlanDetail<Plan, Addr, Item, Photo>) {
  const { addresses, items, photos, ...rest } = plan;
  return {
    ...stripShipmentPlanRowPhotos(rest as unknown as Plan),
    addresses: addresses.map(a => ({
      ...a,
      irsaliyePhoto: null,
      hasIrsaliyePhoto: hasNonEmptyString(a.irsaliyePhoto),
    })),
    items: items.map(it => ({
      ...it,
      irsaliyePhoto: null,
      hasIrsaliyePhoto: hasNonEmptyString(it.irsaliyePhoto),
    })),
    photos: photos.map(p => ({
      ...p,
      photoUrl: null,
      hasPhoto: hasNonEmptyString(p.photoUrl),
    })),
  };
}

/**
 * Maps URL-friendly table names to the actual DB table identifier and
 * the set of allowed photo fields (whitelist).
 * Maps camelCase field name -> snake_case DB column.
 */
export const PHOTO_TABLE_FIELDS: Record<string, { table: string; fields: Record<string, string>; thumbFields?: Record<string, string> }> = {
  production_records: {
    table: 'production_records',
    fields: {
      photoUrl: 'photo_url',
      pastalPhotoUrl: 'pastal_photo_url',
      urunIslemPhotoUrl: 'urun_islem_photo_url',
      katlamaPhotoUrl: 'katlama_photo_url',
      setToplamaPhotoUrl: 'set_toplama_photo_url',
      kolilemePhotoUrl: 'kolileme_photo_url',
      sevkiyatPhotoUrl: 'sevkiyat_photo_url',
      sevkiyatZeosPhotoUrl: 'sevkiyat_zeos_photo_url',
      sterilizasyonPhotoUrl: 'sterilizasyon_photo_url',
    },
    thumbFields: {
      photoUrl: 'photo_thumb_url',
      pastalPhotoUrl: 'pastal_photo_thumb_url',
      urunIslemPhotoUrl: 'urun_islem_photo_thumb_url',
      katlamaPhotoUrl: 'katlama_photo_thumb_url',
      setToplamaPhotoUrl: 'set_toplama_photo_thumb_url',
      kolilemePhotoUrl: 'kolileme_photo_thumb_url',
      sevkiyatPhotoUrl: 'sevkiyat_photo_thumb_url',
      sevkiyatZeosPhotoUrl: 'sevkiyat_zeos_photo_thumb_url',
      sterilizasyonPhotoUrl: 'sterilizasyon_photo_thumb_url',
    },
  },
  order_items: {
    table: 'order_items',
    fields: {
      pastalPhotoUrl: 'pastal_photo_url',
      urunIslemPhotoUrl: 'urun_islem_photo_url',
      katlamaPhotoUrl: 'katlama_photo_url',
    },
    thumbFields: {
      pastalPhotoUrl: 'pastal_photo_thumb_url',
      urunIslemPhotoUrl: 'urun_islem_photo_thumb_url',
      katlamaPhotoUrl: 'katlama_photo_thumb_url',
    },
  },
  samples: {
    table: 'samples',
    fields: { photoUrl: 'photo_url' },
  },
  sample_items: {
    table: 'sample_items',
    fields: { photoUrl: 'photo_url' },
    thumbFields: { photoUrl: 'photo_thumb_url' },
  },
  record_photos: {
    table: 'record_photos',
    fields: { photoUrl: 'photo_url' },
  },
  sample_photos: {
    table: 'sample_photos',
    fields: { photoUrl: 'photo_url' },
  },
  shipment_photos: {
    table: 'shipment_photos',
    fields: { photoUrl: 'photo_url' },
  },
  shipment_plan_photos: {
    table: 'shipment_plan_photos',
    fields: { photoUrl: 'photo_url' },
  },
  shipment_plans: {
    table: 'shipment_plans',
    fields: {
      driverPhoto: 'driver_photo',
      cargoLabelPhoto: 'cargo_label_photo',
    },
  },
  shipment_plan_addresses: {
    table: 'shipment_plan_addresses',
    fields: { irsaliyePhoto: 'irsaliye_photo' },
  },
  shipment_plan_items: {
    table: 'shipment_plan_items',
    fields: { irsaliyePhoto: 'irsaliye_photo' },
  },
};
