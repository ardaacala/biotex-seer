export type LoadingType = 'koli' | 'palet16' | 'palet20';

export interface PlanItemEntry {
  shipmentId: number;
  boxCount: number;
  loadingType: LoadingType;
  addressIndex?: number;
}

export type PlanItemsMap = Record<string, PlanItemEntry>;

export const itemKey = (shipmentId: number, addressIndex: number): string =>
  `${shipmentId}__${addressIndex}`;

export const parseItemKey = (key: string): { shipmentId: number; addressIndex: number } => {
  const [s, a] = key.split('__');
  return { shipmentId: Number(s), addressIndex: Number(a) };
};

/**
 * boxCount semantics: ALWAYS represents the total koli count, regardless of
 * loadingType. loadingType only describes packaging (koli vs. palet16/20) for
 * display. As a result this helper always returns 1 — it is kept for backward
 * compatibility with older callers that multiplied by it. New code should use
 * `paletInfo()` to derive pallet count + partial-last-pallet info for display.
 */
export function paletToKoli(_loadingType: LoadingType | string): number {
  return 1;
}

/**
 * Returns the pallet size (16 / 20) for a given loadingType, or 0 for koli /
 * unknown. Useful when we need only the size without computing partial info.
 */
export function paletSizeFor(loadingType: LoadingType | string): number {
  if (loadingType === 'palet16') return 16;
  if (loadingType === 'palet20') return 20;
  return 0;
}

/**
 * Compute pallet packaging info from a koli total. Returns the number of
 * pallets needed and how many koli the LAST (possibly partial) pallet holds.
 * For 'koli' loadingType returns isPalet=false and zero pallet figures.
 *
 * Example: boxCount=413, loadingType='palet20' →
 *   { paletSize: 20, paletCount: 21, fullPaletCount: 20,
 *     lastPaletKoli: 13, hasPartialLastPalet: true, isPalet: true }
 */
export function paletInfo(boxCount: number, loadingType: LoadingType | string): {
  paletSize: number;
  paletCount: number;
  fullPaletCount: number;
  lastPaletKoli: number;
  hasPartialLastPalet: boolean;
  isPalet: boolean;
} {
  const paletSize = paletSizeFor(loadingType);
  const isPalet = paletSize > 0;
  if (!isPalet || boxCount <= 0) {
    return { paletSize, paletCount: 0, fullPaletCount: 0, lastPaletKoli: 0, hasPartialLastPalet: false, isPalet };
  }
  const fullPaletCount = Math.floor(boxCount / paletSize);
  const remainder = boxCount % paletSize;
  const hasPartialLastPalet = remainder > 0;
  const paletCount = fullPaletCount + (hasPartialLastPalet ? 1 : 0);
  const lastPaletKoli = hasPartialLastPalet ? remainder : paletSize;
  return { paletSize, paletCount, fullPaletCount, lastPaletKoli, hasPartialLastPalet, isPalet };
}

export function getItemsForShipment(
  items: PlanItemsMap,
  shipmentId: number,
): Array<{ key: string; entry: PlanItemEntry }> {
  return Object.entries(items)
    .filter(([k]) => parseItemKey(k).shipmentId === shipmentId)
    .map(([key, entry]) => ({ key, entry }))
    .sort((a, b) => (a.entry.addressIndex ?? 0) - (b.entry.addressIndex ?? 0));
}

export function isShipmentSelected(items: PlanItemsMap, shipmentId: number): boolean {
  return getItemsForShipment(items, shipmentId).length > 0;
}

/**
 * For split-mode shipments (2+ items), ensure every non-empty address has
 * a row. Missing addresses get boxCount=0 so the user can see and edit them.
 */
export function backfillSplitAddresses(
  items: PlanItemsMap,
  nonEmptyAddressIndices: number[],
): PlanItemsMap {
  const shipmentIds = new Set<number>();
  for (const k of Object.keys(items)) shipmentIds.add(parseItemKey(k).shipmentId);
  let next = { ...items };
  for (const sid of shipmentIds) {
    const existing = getItemsForShipment(next, sid);
    if (existing.length < 2) continue;
    const existingAddrs = new Set(existing.map(e => e.entry.addressIndex ?? 0));
    for (const ai of nonEmptyAddressIndices) {
      if (!existingAddrs.has(ai)) {
        next = addOrReplaceItem(next, {
          shipmentId: sid,
          boxCount: 0,
          loadingType: 'koli' as LoadingType,
          addressIndex: ai,
        });
      }
    }
  }
  return next;
}

export function isShipmentSplit(items: PlanItemsMap, shipmentId: number): boolean {
  return getItemsForShipment(items, shipmentId).length > 1;
}

export function selectedShipmentCount(items: PlanItemsMap): number {
  const ids = new Set<number>();
  for (const k of Object.keys(items)) ids.add(parseItemKey(k).shipmentId);
  return ids.size;
}

export function totalKoliEquiv(items: PlanItemsMap): number {
  // boxCount is the koli total for every loadingType — sum directly.
  return Object.values(items).reduce((sum, item) => sum + (item.boxCount ?? 0), 0);
}

export function removeShipmentItems(items: PlanItemsMap, shipmentId: number): PlanItemsMap {
  const next: PlanItemsMap = {};
  for (const [k, v] of Object.entries(items)) {
    if (parseItemKey(k).shipmentId !== shipmentId) next[k] = v;
  }
  return next;
}

export function addOrReplaceItem(items: PlanItemsMap, entry: PlanItemEntry): PlanItemsMap {
  const idx = entry.addressIndex ?? 0;
  return { ...items, [itemKey(entry.shipmentId, idx)]: { ...entry, addressIndex: idx } };
}

export function removeItemByKey(items: PlanItemsMap, key: string): PlanItemsMap {
  if (!(key in items)) return items;
  const next = { ...items };
  delete next[key];
  return next;
}

export function setItemField(
  items: PlanItemsMap,
  key: string,
  field: 'boxCount' | 'loadingType' | 'addressIndex',
  value: number | string,
): PlanItemsMap {
  const cur = items[key];
  if (!cur) return items;
  if (field === 'addressIndex') {
    const newIdx = Number(value);
    const { shipmentId } = parseItemKey(key);
    const newKey = itemKey(shipmentId, newIdx);
    if (newKey === key) return items;
    if (items[newKey]) return items; // collision: ignore
    const next = { ...items };
    delete next[key];
    next[newKey] = { ...cur, addressIndex: newIdx };
    return next;
  }
  if (field === 'boxCount') {
    return { ...items, [key]: { ...cur, boxCount: Number(value) } };
  }
  return { ...items, [key]: { ...cur, loadingType: value as LoadingType } };
}

/**
 * Enable split mode for a shipment: ensure one item per non-empty address.
 * The first address inherits the existing single item's quantity & loading
 * type; the other addresses start with boxCount=0 so the original total is
 * preserved on toggle (zero-quantity rows are filtered out at submit).
 */
export function enableSplit(
  items: PlanItemsMap,
  shipmentId: number,
  nonEmptyAddressIndices: number[],
  defaultBoxCount: number,
): PlanItemsMap {
  if (nonEmptyAddressIndices.length === 0) return items;
  const existing = getItemsForShipment(items, shipmentId);
  const seed = existing[0]?.entry ?? {
    shipmentId,
    boxCount: defaultBoxCount,
    loadingType: 'koli' as LoadingType,
  };
  let next = removeShipmentItems(items, shipmentId);
  nonEmptyAddressIndices.forEach((ai, i) => {
    const entry: PlanItemEntry =
      i === 0
        ? { shipmentId, boxCount: seed.boxCount, loadingType: seed.loadingType, addressIndex: ai }
        : { shipmentId, boxCount: 0, loadingType: 'koli', addressIndex: ai };
    next = addOrReplaceItem(next, entry);
  });
  return next;
}

/**
 * Collapse split mode back to a single entry, preserving total quantity.
 *  - If every row shares the same loadingType, sum boxCounts and keep that type.
 *  - Otherwise convert each row to its koli equivalent, sum them, and store
 *    the result as a single 'koli' row.
 */
export function disableSplit(items: PlanItemsMap, shipmentId: number): PlanItemsMap {
  const list = getItemsForShipment(items, shipmentId);
  if (list.length <= 1) return items;
  const firstAddrIdx = list[0].entry.addressIndex ?? 0;
  const allSameType = list.every(it => it.entry.loadingType === list[0].entry.loadingType);
  const merged: PlanItemEntry = allSameType
    ? {
        shipmentId,
        boxCount: list.reduce((sum, it) => sum + it.entry.boxCount, 0),
        loadingType: list[0].entry.loadingType,
        addressIndex: firstAddrIdx,
      }
    : {
        shipmentId,
        // boxCount is the koli total regardless of loadingType.
        boxCount: list.reduce((sum, it) => sum + (it.entry.boxCount ?? 0), 0),
        loadingType: 'koli',
        addressIndex: firstAddrIdx,
      };
  let next = removeShipmentItems(items, shipmentId);
  next = addOrReplaceItem(next, merged);
  return next;
}

/**
 * Remove entries whose addressIndex is no longer valid (address deleted).
 * Used as a defensive cleanup when the addresses array length shrinks.
 */
export function pruneOrphanedAddressItems(
  items: PlanItemsMap,
  validAddressIndices: Set<number>,
): PlanItemsMap {
  const next: PlanItemsMap = {};
  for (const [k, v] of Object.entries(items)) {
    const ai = v.addressIndex ?? 0;
    if (validAddressIndices.has(ai)) next[k] = v;
  }
  return next;
}

/**
 * Remap items after the user removes the address at `removedIdx`. Items at
 * that index are dropped; items at indices greater than removedIdx are
 * decremented by 1 so they continue to point to the same physical address.
 */
export function remapAfterAddressRemoval(items: PlanItemsMap, removedIdx: number): PlanItemsMap {
  const next: PlanItemsMap = {};
  for (const v of Object.values(items)) {
    const ai = v.addressIndex ?? 0;
    if (ai === removedIdx) continue;
    const newAi = ai > removedIdx ? ai - 1 : ai;
    next[itemKey(v.shipmentId, newAi)] = { ...v, addressIndex: newAi };
  }
  return next;
}

/**
 * Build the submit-time payload pair: filter out empty addresses, remap each
 * item's addressIndex to its position in the filtered addresses array, and
 * drop items whose address is empty. Items with boxCount <= 0 are also
 * dropped (these come from un-filled split rows).
 */
export function compactAddressesForSubmit<TAddr>(
  addresses: TAddr[],
  isEmpty: (a: TAddr) => boolean,
  items: PlanItemsMap,
): { addresses: TAddr[]; items: PlanItemEntry[]; oldToNew: Map<number, number> } {
  const oldToNew = new Map<number, number>();
  const filtered: TAddr[] = [];
  addresses.forEach((a, i) => {
    if (!isEmpty(a)) {
      oldToNew.set(i, filtered.length);
      filtered.push(a);
    }
  });
  const out: PlanItemEntry[] = [];
  for (const v of Object.values(items)) {
    if (v.boxCount <= 0) continue;
    const newAi = oldToNew.get(v.addressIndex ?? 0);
    if (newAi == null) continue;
    out.push({
      shipmentId: v.shipmentId,
      boxCount: v.boxCount,
      loadingType: v.loadingType,
      addressIndex: newAi,
    });
  }
  return { addresses: filtered, items: out, oldToNew };
}
