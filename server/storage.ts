import { db } from "./db";
import {
  users,
  productionRecords,
  orderItems,
  itemLibrary,
  customerLibrary,
  orderTitleLibrary,
  productionLogs,
  recordPhotos,
  samples,
  samplePhotos,
  sampleItems,
  shipments,
  shipmentPhotos,
  shipmentPlans,
  shipmentPlanAddresses,
  shipmentPlanItems,
  shipmentPlanPhotos,
  chatMessages,
  messageReads,
  blockedIps,
  addressLibrary,
  orderItemHammadde,
  stokItems,
  stokKategoriler,
  stokAltTurler,
  receteItems,
  receteRezervasyonlar,
  depoHareketleri,
  stokAnomalileri,
  type DepoHareketi,
  type StokAnomali,
  type InsertStokAnomali,
  type OrderItemHammadde,
  type InsertOrderItemHammadde,
  type StokKategori,
  type InsertStokKategori,
  type StokAltTur,
  type InsertStokAltTur,
  type UpdateStokAltTur,
  type ChatMessage,
  type InsertChatMessage,
  type User,
  type InsertUser,
  type ProductionRecord,
  type InsertRecord,
  type CreateRecordRequest,
  type UpdateRecordRequest,
  type OrderItem,
  type InsertOrderItem,
  type ItemLibraryEntry,
  type InsertItemLibraryEntry,
  type CustomerLibraryEntry,
  type InsertCustomerLibraryEntry,
  type OrderTitleLibraryEntry,
  type InsertOrderTitleLibraryEntry,
  type ProductionLog,
  type InsertProductionLog,
  type RecordPhoto,
  type InsertRecordPhoto,
  type Sample,
  type InsertSample,
  type SamplePhoto,
  type InsertSamplePhoto,
  type SampleItem,
  type InsertSampleItem,
  type Shipment,
  type InsertShipment,
  type ShipmentPhoto,
  type InsertShipmentPhoto,
  type ShipmentPlan,
  type ShipmentPlanAddress,
  type ShipmentPlanItem,
  type ShipmentPlanPhoto,
  shipmentBarkodDogrulamalari,
  type ShipmentBarkodDogrulama,
  type InsertShipmentBarkodDogrulama,
  type BlockedIp,
  type StokItem,
  type InsertStokItem,
  type ReceteItem,
  type InsertReceteItem,
  type AddressLibrary,
} from "@shared/schema";
import { eq, or, ilike, and, desc, asc, sql, inArray, ne, gte, lte } from "drizzle-orm";


export class WeeklyTargetExceedsTotalError extends Error {
  code = 'WEEKLY_TARGET_EXCEEDS_TOTAL' as const;
  remaining: number;
  totalQuantity: number;
  currentSum: number;
  constructor(message: string, totalQuantity: number, currentSum: number) {
    super(message);
    this.totalQuantity = totalQuantity;
    this.currentSum = currentSum;
    this.remaining = Math.max(0, totalQuantity - currentSum);
  }
}

async function assertWeeklyTargetWithinTotal(
  recordId: number,
  newTarget: number,
  excludeItemId: number | null,
): Promise<void> {
  const { weeklyPlanItems } = await import('@shared/schema');
  const [rec] = await db.select({ totalQuantity: productionRecords.totalQuantity })
    .from(productionRecords)
    .where(eq(productionRecords.id, recordId));
  if (!rec) throw new Error('Sipariş bulunamadı.');
  const total = rec.totalQuantity ?? 0;
  if (total <= 0) return; // no enforcement when order has no total
  const conditions = [eq(weeklyPlanItems.recordId, recordId)];
  if (excludeItemId != null) conditions.push(ne(weeklyPlanItems.id, excludeItemId));
  const rows = await db.select({ t: weeklyPlanItems.targetQuantity })
    .from(weeklyPlanItems)
    .where(and(...conditions));
  const otherSum = rows.reduce((s, r) => s + (r.t ?? 0), 0);
  const newSum = otherSum + newTarget;
  if (newSum > total) {
    const remaining = Math.max(0, total - otherSum);
    throw new WeeklyTargetExceedsTotalError(
      `Haftalık hedeflerin toplamı siparişin toplam adedini aşıyor. Kalan kapasite: ${remaining} adet (toplam: ${total}).`,
      total,
      newSum,
    );
  }
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUserPassword(id: number, password: string): Promise<User>;
  updateUserRole(id: number, role: string): Promise<User>;
  updateDisplayName(id: number, displayName: string | null): Promise<User>;
  updateUserSevkiyatYetkisi(id: number, value: boolean): Promise<User>;
  updateUserStokYetkisi(id: number, value: boolean): Promise<User>;
  updateLastSeen(id: number): Promise<void>;
  updateLastLogout(id: number): Promise<void>;
  deleteUser(id: number): Promise<void>;
  getPendingUsers(): Promise<User[]>;
  cleanupExpiredCandidates(): Promise<number>;

  getRecords(filters?: { search?: string; status?: string }): Promise<ProductionRecord[]>;
  getRecord(id: number): Promise<ProductionRecord | undefined>;
  createRecord(record: CreateRecordRequest): Promise<ProductionRecord>;
  updateRecord(id: number, updates: UpdateRecordRequest, expectedUpdatedAt?: Date): Promise<ProductionRecord | null>;
  deleteRecord(id: number): Promise<void>;
  cloneRecord(sourceId: number, createdBy: number): Promise<ProductionRecord>;

  getOrderItems(recordId: number): Promise<OrderItem[]>;
  getOrderItemsByRecordIds(recordIds: number[]): Promise<OrderItem[]>;
  createOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: number, item: Partial<InsertOrderItem>): Promise<OrderItem>;
  deleteOrderItem(id: number): Promise<void>;

  getItemLibrary(): Promise<ItemLibraryEntry[]>;
  createItemLibraryEntry(entry: InsertItemLibraryEntry): Promise<ItemLibraryEntry>;
  updateItemLibraryEntry(id: number, entry: Partial<InsertItemLibraryEntry>): Promise<ItemLibraryEntry>;
  deleteItemLibraryEntry(id: number): Promise<void>;

  getCustomerLibrary(): Promise<CustomerLibraryEntry[]>;
  createCustomerLibraryEntry(entry: InsertCustomerLibraryEntry): Promise<CustomerLibraryEntry>;
  updateCustomerLibraryEntry(id: number, entry: Partial<InsertCustomerLibraryEntry>): Promise<CustomerLibraryEntry>;
  deleteCustomerLibraryEntry(id: number): Promise<void>;
  upsertCustomerByName(name: string): Promise<CustomerLibraryEntry | null>;
  getOrderTitleLibrary(): Promise<OrderTitleLibraryEntry[]>;
  createOrderTitleLibraryEntry(entry: InsertOrderTitleLibraryEntry): Promise<OrderTitleLibraryEntry>;
  updateOrderTitleLibraryEntry(id: number, entry: Partial<InsertOrderTitleLibraryEntry>): Promise<OrderTitleLibraryEntry>;
  deleteOrderTitleLibraryEntry(id: number): Promise<void>;

  getProductionLogs(recordId?: number, phase?: string): Promise<ProductionLog[]>;
  getLatestProductionLogPerRecord(phase: string): Promise<ProductionLog[]>;
  createProductionLog(log: InsertProductionLog): Promise<ProductionLog>;
  deleteProductionLog(id: number): Promise<void>;

  getRecordPhotos(recordId: number): Promise<RecordPhoto[]>;
  addRecordPhoto(photo: InsertRecordPhoto): Promise<RecordPhoto>;
  deleteRecordPhoto(id: number): Promise<void>;

  updateFifoOrder(id: number, fifoOrder: number | null): Promise<void>;
  updateProductionTarget(id: number, target: number | null): Promise<void>;

  getSamples(filters?: { search?: string }): Promise<Sample[]>;
  getSample(id: number): Promise<Sample | undefined>;
  createSample(sample: InsertSample): Promise<Sample>;
  updateSample(id: number, updates: Partial<InsertSample>): Promise<Sample>;
  deleteSample(id: number): Promise<void>;
  getSamplePhotos(sampleId: number): Promise<SamplePhoto[]>;
  addSamplePhoto(photo: InsertSamplePhoto): Promise<SamplePhoto>;
  deleteSamplePhoto(id: number): Promise<void>;
  getSampleItems(sampleId: number): Promise<SampleItem[]>;
  createSampleItem(item: InsertSampleItem): Promise<SampleItem>;
  updateSampleItem(id: number, updates: Partial<InsertSampleItem>): Promise<SampleItem>;
  deleteSampleItem(id: number): Promise<void>;
  getPhaseTable(since: Date): Promise<{ recordId: number; title: string; lotNumber: string | null; customer: string | null; phases: Record<string, number>; lastProducedAt: string | null }[]>;
  getRecordProductionTotals(): Promise<{ recordId: number; total: number }[]>;
  getRecentActivityByPhase(limit: number): Promise<Record<string, { id: number; recordId: number; title: string; lotNumber: string | null; quantity: number; userName: string; completedAt: string; notes: string | null; hasPhoto: boolean; photoTable: string | null; photoId: number | null; photoField: string | null; itemName: string | null }[]>>;

  getAllWeeklyPlans(): Promise<{ id: number; weekStart: string; createdAt: string; itemCount: number }[]>;
  getWeeklyPlanByWeekStart(weekStart: string): Promise<import('@shared/schema').WeeklyPlan | null>;
  getOrCreateWeeklyPlan(weekStart: string, userId: number): Promise<import('@shared/schema').WeeklyPlan>;
  getWeeklyPlanWithItems(planId: number): Promise<{ plan: import('@shared/schema').WeeklyPlan; items: { id: number; recordId: number; targetQuantity: number; title: string; lotNumber: string | null; customer: string | null; priority: string | null; itemsPerBox: number | null; actualQuantity: number; koliQuantity: number; carryOver: number; carriedActualQuantity: number; isCarried: boolean; createdAt: Date | null }[] }>;
  addWeeklyPlanItem(planId: number, recordId: number, targetQuantity: number): Promise<import('@shared/schema').WeeklyPlanItem>;
  updateWeeklyPlanItem(itemId: number, targetQuantity: number): Promise<void>;
  deleteWeeklyPlanItem(itemId: number): Promise<void>;
  getWeeklyTargetSummary(recordId: number, excludeItemId?: number | null): Promise<{ totalQuantity: number; plannedSum: number; remaining: number }>;
  getWeeklyTargetSummariesForRecords(recordIds: number[]): Promise<Record<number, { totalQuantity: number; plannedSum: number; remaining: number }>>;
  markAutoCarried(planId: number): Promise<void>;

  getShipmentsList(): Promise<Array<Shipment & { record: ProductionRecord; shippedByName?: string | null }>>;
  getShipmentByRecordId(recordId: number): Promise<Shipment | undefined>;
  getShipmentById(id: number): Promise<Shipment | undefined>;
  getOrCreateShipment(recordId: number): Promise<Shipment>;
  markShipmentOffRecord(shipmentId: number, userId: number): Promise<Shipment>;
  updateShipment(id: number, updates: Partial<InsertShipment>): Promise<Shipment>;
  getShipmentPhotos(shipmentId: number): Promise<ShipmentPhoto[]>;
  addShipmentPhoto(photo: InsertShipmentPhoto): Promise<ShipmentPhoto>;
  deleteShipmentPhoto(id: number): Promise<void>;
  getShipmentBarkodDogrulamalari(shipmentId: number): Promise<Array<ShipmentBarkodDogrulama & { kullaniciAdi: string | null }>>;
  addShipmentBarkodDogrulama(d: InsertShipmentBarkodDogrulama): Promise<ShipmentBarkodDogrulama>;

  createShipmentPlan(vehicleType: string, plannedDepartureDate: string, notes: string | null, shippingCompany: string | null, createdBy: number, addresses: Array<string | { address: string; irsaliyePhoto?: string }>, items: Array<{ shipmentId: number; boxCount: number; loadingType: string; addressIndex?: number }>, photos: string[], extras?: { driverName?: string; driverPhone?: string; vehiclePlate?: string; dorsePlate?: string; driverPhoto?: string; cargoCompany?: string; cargoTitle?: string; cargoDescription?: string; cargoLabelPhoto?: string }): Promise<ShipmentPlan>;
  getShipmentPlans(status?: 'active' | 'departed'): Promise<Array<ShipmentPlan & { addresses: ShipmentPlanAddress[]; items: Array<ShipmentPlanItem & { shipment: Shipment & { record: ProductionRecord } }>; photos: ShipmentPlanPhoto[]; createdByUser?: string; departedByUser?: string }>>;
  getShipmentPlanById(planId: number): Promise<(ShipmentPlan & { addresses: ShipmentPlanAddress[]; items: Array<ShipmentPlanItem & { shipment: Shipment & { record: ProductionRecord } }>; photos: ShipmentPlanPhoto[]; createdByUser?: string; departedByUser?: string }) | null>;
  departShipmentPlan(planId: number, userId: number, departurePhotoUrl?: string): Promise<ShipmentPlan>;
  updateShipmentPlanCompany(planId: number, shippingCompany: string | null): Promise<ShipmentPlan>;
  updateShipmentPlan(planId: number, updates: { vehicleType?: string; plannedDepartureDate?: string; notes?: string | null; shippingCompany?: string | null; addresses?: Array<string | { address: string; irsaliyePhoto?: string }>; items?: Array<{ shipmentId: number; boxCount: number; loadingType: string; addressIndex?: number }>; photos?: string[] }, uploadedBy?: number): Promise<ShipmentPlan>;
  getShipmentPlansByShipmentId(shipmentId: number): Promise<ShipmentPlan[]>;
  deleteShipmentPlan(planId: number): Promise<void>;

  // Address Library
  getAddressLibrary(): Promise<AddressLibrary[]>;
  upsertAddressLibrary(address: string): Promise<void>;

  // Chat Channels
  getAccessibleChannels(userId: number, userRole: string): Promise<import('@shared/schema').ChatChannel[]>;
  createChannel(name: string, description: string | null, createdBy: number): Promise<import('@shared/schema').ChatChannel>;
  updateChannel(id: number, data: { name?: string; description?: string | null }): Promise<void>;
  deleteChannel(id: number): Promise<void>;
  getChannelMembers(channelId: number): Promise<Array<{ userId: number; userName: string }>>;
  addChannelMember(channelId: number, userId: number): Promise<void>;
  removeChannelMember(channelId: number, userId: number): Promise<void>;
  canUserAccessChannel(channelId: number, userId: number, userRole: string): Promise<boolean>;
  getChannelUnreadCount(userId: number, channelId: number): Promise<number>;

  // Chat
  getChatMessages(limit?: number, channelId?: number | null): Promise<Array<ChatMessage & { senderName: string }>>;
  createChatMessage(msg: InsertChatMessage & { channelId?: number | null }): Promise<ChatMessage>;
  deleteChatMessage(id: number): Promise<void>;
  pinChatMessage(id: number, pinnedBy: number, pin: boolean): Promise<void>;
  markMessagesRead(userId: number, messageIds: number[]): Promise<void>;
  getUnreadCount(userId: number): Promise<number>;
  // Direct Messages
  getDMs(userAId: number, userBId: number): Promise<Array<{ id: number; senderId: number; receiverId: number; content: string; photoUrl: string | null; createdAt: Date; isRead: boolean; senderName: string }>>;
  sendDM(senderId: number, receiverId: number, content: string, photoUrl?: string | null): Promise<{ id: number; senderId: number; receiverId: number; content: string; photoUrl: string | null; createdAt: Date; isRead: boolean }>;
  markDMsRead(receiverId: number, senderId: number): Promise<void>;
  getDMUnreadCount(userId: number): Promise<number>;
  getDMConversations(userId: number): Promise<Array<{ userId: number; userName: string; lastMessage: string; lastMessageAt: Date; unreadCount: number }>>;
  hasDMHistory(userAId: number, userBId: number): Promise<boolean>;
  deleteDMConversation(userAId: number, userBId: number): Promise<void>;

  // Blocked IPs
  isIpBlocked(ip: string): Promise<boolean>;
  addBlockedIp(ip: string, reason?: string): Promise<void>;
  // Raw SQL
  runRawSQL(sqlText: string): Promise<void>;
  getBlockedIps(): Promise<BlockedIp[]>;
  removeBlockedIp(ip: string): Promise<void>;

  // Record edit logs
  getRecordEditLogs(recordId: number): Promise<Array<{ id: number; recordId: number; editedBy: number; editedAt: Date; note: string | null; editorName: string }>>;
  createRecordEditLog(recordId: number, editedBy: number, note?: string): Promise<void>;

  // Stok
  getStokItems(filters?: { tur?: string; stokDurumu?: string }): Promise<StokItem[]>;
  getStokItem(id: number): Promise<StokItem | undefined>;
  getStokItemsByAltTur(altTur: string): Promise<StokItem[]>;
  createStokItem(item: InsertStokItem): Promise<StokItem>;
  updateStokItem(id: number, item: Partial<InsertStokItem>): Promise<StokItem>;
  deleteStokItem(id: number): Promise<void>;
  adjustStokRezerve(stokItemId: number, delta: number): Promise<void>;
  deductStokKatlama(stokItemId: number, amount: number): Promise<void>;
  getPrevKatlamaQty(recordId: number, orderItemId: number | null | undefined, excludeLogId: number): Promise<number>;
  getPrevPhaseQty(recordId: number, phase: string, orderItemId: number | null | undefined, excludeLogId: number): Promise<number>;
  transferToStock(recordId: number, userId: number): Promise<{ transferred: number }>;
  getOrderItemsByRecord(recordId: number): Promise<OrderItem[]>;
  getOrderItemHammadde(orderItemId: number): Promise<OrderItemHammadde[]>;
  getOrderItemsHammaddeByRecord(recordId: number): Promise<OrderItemHammadde[]>;
  createOrderItemHammadde(entry: InsertOrderItemHammadde): Promise<OrderItemHammadde>;
  deleteOrderItemHammadde(id: number): Promise<void>;
  deleteOrderItemHammaddeByItemId(orderItemId: number): Promise<void>;
  getStokReservations(stokItemId: number): Promise<{
    recordId: number; recordTitle: string; recordStatus: string;
    orderItemId: number; orderItemName: string;
    kullanim: string; totalQuantity: number; totalReserved: number;
    source: 'multi' | 'legacy';
  }[]>;
  getStokTuketimGecmisi(stokItemId: number): Promise<{
    logId: number; completedAt: Date;
    unitsProcessed: number; kullanim: string; consumed: number;
    orderItemId: number; orderItemName: string;
    recordId: number; recordTitle: string; recordStatus: string;
  }[]>;

  // Gelen Siparişler
  getGelenSiparisler(): Promise<ProductionRecord[]>;
  onaylaGelenSiparis(id: number): Promise<ProductionRecord>;
  reviseGelenSiparis(id: number): Promise<ProductionRecord>;
  touchGelenIfRevisable(id: number): Promise<void>;

  // Reçete (BOM)
  getReceteItems(recordId: number): Promise<ReceteItem[]>;
  createReceteItem(item: InsertReceteItem): Promise<ReceteItem>;
  deleteReceteItem(id: number): Promise<void>;
  deleteReceteItemsByRecord(recordId: number): Promise<void>;
  createReceteRezervasyonu(receteItemId: number, stokItemId: number, miktar: number): Promise<number>;
  updateReceteRezervasyonTasindi(id: number, data: { tasindi: boolean; tasindiBy?: number; tasindiMiktar?: number; tasindiPhoto?: string | null; tasindiAciklama?: string | null }): Promise<void>;
  createDepoHareketi(data: { stokItemId: number; stokAdi: string; lot: string | null; birim: string; rezerveMiktar: number; kaynak: string; kaynakId: number; siparisId: number; siparisTitle: string; siparisLot: string | null }): Promise<number>;
  createDepoHareketiFazlalik(data: { stokItemId: number; stokAdi: string; lot: string | null; birim: string; miktar: number; siparisId: number; siparisTitle: string; siparisLot: string | null; kaynakId: number }): Promise<number>;
  getDepoHareket(id: number): Promise<DepoHareketi | null>;
  getDepoHareketleriList(): Promise<Array<DepoHareketi & { stokMiktar: number | null }>>;
  getDepoHareketleriDogrulamaRaporu(filters: { startDate?: Date; endDate?: Date; userId?: number }): Promise<DepoHareketi[]>;
  getDepoHareketleriByRecord(recordId: number): Promise<Array<{ id: number; stokItemId: number; stokAdi: string; lot: string | null; birim: string; rezerveMiktar: number; kaynak: string; tasindi: boolean; tasindiMiktar: number | null; receteItemId: number | null }>>;
  getFazlalikByStokItemIds(stokItemIds: number[]): Promise<DepoHareketi[]>;
  updateDepoHareket(id: number, data: { tasindi: boolean; tasindiAt?: Date | null; tasindiBy?: number | null; tasindiByUsername?: string | null; tasindiMiktar?: number | null; tasindiPhoto?: string | null; tasindiAciklama?: string | null }): Promise<void>;
  patchDepoHareketFoto(id: number, tasindiPhoto: string | null, tasindiAciklama: string | null): Promise<void>;
  depoyaDonDepoHareketi(id: number): Promise<void>;
  siparisAtaDepoHareketi(id: number, miktar: number, hedefSiparisId: number, hedefSiparisTitle: string, hedefSiparisLot: string | null): Promise<number>;
  deleteDepoHareketByKaynak(kaynak: string, kaynakId: number): Promise<void>;
  deleteDepoHareketBySiparis(siparisId: number): Promise<void>;
  createStokAnomali(data: InsertStokAnomali & { reportedBy: number; reportedByUsername: string; ekStokDusumler?: Array<{ stokItemId: number; lot: string | null; urunAdi: string; miktar: number }>; autoDusuldu?: boolean; bekleyenMiktar?: number; bekleyenUrunAdi?: string | null; bekleyenBirim?: string | null }): Promise<StokAnomali>;
  getStokItemsByUrunAdi(urunAdi: string, birim: string, excludeId?: number): Promise<StokItem[]>;
  decrementStokItemMiktar(stokItemId: number, amount: number): Promise<void>;
  getStokAnomalileri(): Promise<Array<StokAnomali & { stokAdi: string; lot: string | null; siparisId: number; siparisTitle: string }>>;
  getStokAnomalileriByDepoHareket(depoHareketId: number): Promise<StokAnomali[]>;
  resolveStokAnomali(id: number, resolvedBy: number, resolvedByUsername: string, notes: string | null): Promise<void>;
  deleteStokAnomali(id: number): Promise<void>;

  // App settings (key/value)
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUserPassword(id: number, password: string): Promise<User> {
    const [updated] = await db.update(users).set({ password }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserRole(id: number, role: string): Promise<User> {
    const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateDisplayName(id: number, displayName: string | null): Promise<User> {
    const [updated] = await db.update(users).set({ displayName }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserSevkiyatYetkisi(id: number, value: boolean): Promise<User> {
    const [updated] = await db.update(users).set({ sevkiyatYetkisi: value }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserStokYetkisi(id: number, value: boolean): Promise<User> {
    const [updated] = await db.update(users).set({ stokYetkisi: value }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateLastSeen(id: number): Promise<void> {
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
  }

  async updateLastLogout(id: number): Promise<void> {
    await db.update(users).set({ lastLogoutAt: new Date() }).where(eq(users.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getPendingUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, 'aday'));
  }

  async cleanupExpiredCandidates(): Promise<number> {
    const result = await db.delete(users)
      .where(and(
        eq(users.role, 'aday'),
        sql`${users.createdAt} < NOW() - INTERVAL '1 hour'`
      ))
      .returning();
    return result.length;
  }

  async getRecords(filters?: { search?: string; status?: string }): Promise<ProductionRecord[]> {
    let query = db.select().from(productionRecords);
    const conditions = [];

    if (filters?.search) {
      conditions.push(or(
        ilike(productionRecords.title, `%${filters.search}%`),
        ilike(productionRecords.description, `%${filters.search}%`),
        ilike(productionRecords.lotNumber, `%${filters.search}%`),
        ilike(productionRecords.customer, `%${filters.search}%`)
      ));
    }

    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(productionRecords.status, filters.status));
    }

    if (conditions.length > 0) {
      // @ts-ignore
      return await query.where(and(...conditions));
    }

    return await query;
  }

  async getRecord(id: number): Promise<ProductionRecord | undefined> {
    const [record] = await db.select().from(productionRecords).where(eq(productionRecords.id, id));
    return record;
  }

  async createRecord(record: CreateRecordRequest): Promise<ProductionRecord> {
    // @ts-ignore
    const [created] = await db.insert(productionRecords).values(record).returning();
    return created;
  }

  async updateRecord(id: number, updates: UpdateRecordRequest, expectedUpdatedAt?: Date): Promise<ProductionRecord | null> {
    const conditions = [eq(productionRecords.id, id)];
    if (expectedUpdatedAt) {
      conditions.push(
        sql`date_trunc('milliseconds', ${productionRecords.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt}::timestamptz)`
      );
    }
    const [updated] = await db.update(productionRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(...conditions))
      .returning();
    return updated ?? null;
  }

  async deleteRecord(id: number): Promise<void> {
    await db.delete(orderItems).where(eq(orderItems.recordId, id));
    await db.delete(productionLogs).where(eq(productionLogs.recordId, id));
    await db.delete(productionRecords).where(eq(productionRecords.id, id));
  }

  async cloneRecord(sourceId: number, createdBy: number): Promise<ProductionRecord> {
    const source = await db.select().from(productionRecords).where(eq(productionRecords.id, sourceId)).then(r => r[0]);
    if (!source) throw new Error('Source record not found');

    const [newRecord] = await db.insert(productionRecords).values({
      title: source.title,
      description: source.description,
      createdBy,
      status: 'pending',
      totalQuantity: source.totalQuantity,
      itemsPerBox: source.itemsPerBox,
      referenceId: source.referenceId,
      priority: source.priority,
      customer: source.customer,
      orderDate: source.orderDate,
      photoUrl: source.photoUrl,
      sampleId: source.sampleId,
      // @ts-ignore
      clonedFromId: sourceId,
    }).returning();

    const srcItems = await db.select().from(orderItems).where(eq(orderItems.recordId, sourceId));
    for (const item of srcItems) {
      const [newItem] = await db.insert(orderItems).values({
        recordId: newRecord.id,
        name: item.name,
        unitQuantity: item.unitQuantity,
        category: item.category,
        fabricType: item.fabricType,
        fabricPhases: item.fabricPhases,
        description: item.description,
      }).returning();

      const hammaddeler = await db.select().from(orderItemHammadde).where(eq(orderItemHammadde.orderItemId, item.id));
      for (const h of hammaddeler) {
        await db.insert(orderItemHammadde).values({
          orderItemId: newItem.id,
          stokItemId: h.stokItemId,
          kullanim: h.kullanim,
          altTur: h.altTur,
        } as any);
      }
    }

    return newRecord;
  }

  async getOrderItems(recordId: number): Promise<OrderItem[]> {
    return await db.select().from(orderItems).where(eq(orderItems.recordId, recordId));
  }

  async getOrderItemsByRecordIds(recordIds: number[]): Promise<OrderItem[]> {
    if (recordIds.length === 0) return [];
    return await db.select().from(orderItems).where(inArray(orderItems.recordId, recordIds));
  }

  async getOrderItemsByRecord(recordId: number): Promise<OrderItem[]> {
    return await db.select().from(orderItems).where(eq(orderItems.recordId, recordId));
  }

  async transferToStock(recordId: number, userId: number): Promise<{ transferred: number }> {
    const record = await this.getRecord(recordId);
    if (!record) throw new Error("Sipariş bulunamadı");
    if (record.orderType !== 'stok') throw new Error("Bu sipariş stok türü değil");
    if (record.stokTransferredAt) throw new Error("Zaten stoka transfer edildi");

    const items = await this.getOrderItemsByRecord(recordId);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const lotSuffix = `${record.lotNumber || ''}${record.referenceId || ''}${dd}${mm}`;

    let transferred = 0;
    for (const item of items) {
      const tur = item.stokTurHedef || 'Ayrı Kalemler';
      const altTur = item.stokAltTurHedef || null;
      const lotNo = `S-${lotSuffix}`;

      await this.createStokItem({
        urunAdi: item.name,
        lot: lotNo,
        tur,
        altTur,
        miktar: record.totalQuantity,
        birim: 'adet',
        girisTarihi: today.toISOString().split('T')[0],
        stokDurumu: 'stok',
        createdBy: userId,
        rezerveMiktar: 0,
        kritikStok: 0,
      });
      transferred++;
    }

    await db.update(productionRecords)
      .set({ stokTransferredAt: today } as any)
      .where(eq(productionRecords.id, recordId));

    return { transferred };
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [created] = await db.insert(orderItems).values(item).returning();
    return created;
  }

  async updateOrderItem(id: number, item: Partial<InsertOrderItem>): Promise<OrderItem> {
    const [updated] = await db.update(orderItems).set(item).where(eq(orderItems.id, id)).returning();
    return updated;
  }

  async deleteOrderItem(id: number): Promise<void> {
    await db.delete(orderItems).where(eq(orderItems.id, id));
  }

  async getItemLibrary(): Promise<ItemLibraryEntry[]> {
    return await db.select().from(itemLibrary);
  }

  async createItemLibraryEntry(entry: InsertItemLibraryEntry): Promise<ItemLibraryEntry> {
    const [created] = await db.insert(itemLibrary).values(entry).returning();
    return created;
  }

  async updateItemLibraryEntry(id: number, entry: Partial<InsertItemLibraryEntry>): Promise<ItemLibraryEntry> {
    const [updated] = await db.update(itemLibrary).set(entry).where(eq(itemLibrary.id, id)).returning();
    return updated;
  }

  async deleteItemLibraryEntry(id: number): Promise<void> {
    await db.delete(itemLibrary).where(eq(itemLibrary.id, id));
  }

  async getCustomerLibrary(): Promise<CustomerLibraryEntry[]> {
    return await db.select().from(customerLibrary).orderBy(customerLibrary.name);
  }

  async createCustomerLibraryEntry(entry: InsertCustomerLibraryEntry): Promise<CustomerLibraryEntry> {
    const [created] = await db.insert(customerLibrary).values(entry).returning();
    return created;
  }

  async updateCustomerLibraryEntry(id: number, entry: Partial<InsertCustomerLibraryEntry>): Promise<CustomerLibraryEntry> {
    const [updated] = await db.update(customerLibrary).set(entry).where(eq(customerLibrary.id, id)).returning();
    return updated;
  }

  async deleteCustomerLibraryEntry(id: number): Promise<void> {
    await db.delete(customerLibrary).where(eq(customerLibrary.id, id));
  }

  async upsertCustomerByName(name: string): Promise<CustomerLibraryEntry | null> {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return null;
    const existing = await db.select().from(customerLibrary).where(sql`lower(${customerLibrary.name}) = lower(${trimmed})`).limit(1);
    if (existing.length > 0) return existing[0];
    try {
      const [created] = await db.insert(customerLibrary).values({ name: trimmed }).returning();
      return created;
    } catch {
      return null;
    }
  }

  async getOrderTitleLibrary(): Promise<OrderTitleLibraryEntry[]> {
    return await db.select().from(orderTitleLibrary).orderBy(orderTitleLibrary.title);
  }

  async createOrderTitleLibraryEntry(entry: InsertOrderTitleLibraryEntry): Promise<OrderTitleLibraryEntry> {
    const [created] = await db.insert(orderTitleLibrary).values({
      title: entry.title,
      referenceId: entry.referenceId ?? null,
    }).returning();
    return created;
  }

  async updateOrderTitleLibraryEntry(id: number, entry: Partial<InsertOrderTitleLibraryEntry>): Promise<OrderTitleLibraryEntry> {
    const patch: Partial<InsertOrderTitleLibraryEntry> = {};
    if (entry.title !== undefined) patch.title = entry.title;
    if (entry.referenceId !== undefined) patch.referenceId = entry.referenceId;
    const [updated] = await db.update(orderTitleLibrary).set(patch).where(eq(orderTitleLibrary.id, id)).returning();
    return updated;
  }

  async deleteOrderTitleLibraryEntry(id: number): Promise<void> {
    await db.delete(orderTitleLibrary).where(eq(orderTitleLibrary.id, id));
  }

  async getProductionLogs(recordId?: number, phase?: string): Promise<ProductionLog[]> {
    let query = db.select().from(productionLogs);
    const conditions = [];
    if (recordId) conditions.push(eq(productionLogs.recordId, recordId));
    if (phase) conditions.push(eq(productionLogs.phase, phase));
    if (conditions.length > 0) {
      // @ts-ignore
      return await query.where(and(...conditions)).orderBy(desc(productionLogs.completedAt));
    }
    return await query.orderBy(desc(productionLogs.completedAt));
  }

  async getLatestProductionLogPerRecord(phase: string): Promise<ProductionLog[]> {
    return await db.select().from(productionLogs)
      .where(eq(productionLogs.phase, phase))
      .orderBy(desc(productionLogs.completedAt));
  }

  async createProductionLog(log: InsertProductionLog): Promise<ProductionLog> {
    const [created] = await db.insert(productionLogs).values(log as any).returning();
    return created;
  }

  async deleteProductionLog(id: number): Promise<void> {
    await db.delete(productionLogs).where(eq(productionLogs.id, id));
  }

  async getRecordPhotos(recordId: number): Promise<RecordPhoto[]> {
    return db.select().from(recordPhotos).where(eq(recordPhotos.recordId, recordId)).orderBy(recordPhotos.createdAt);
  }

  async addRecordPhoto(photo: InsertRecordPhoto): Promise<RecordPhoto> {
    const [created] = await db.insert(recordPhotos).values(photo).returning();
    return created;
  }

  async deleteRecordPhoto(id: number): Promise<void> {
    await db.delete(recordPhotos).where(eq(recordPhotos.id, id));
  }

  async updateFifoOrder(id: number, fifoOrder: number | null): Promise<void> {
    await db.update(productionRecords).set({ fifoOrder } as any).where(eq(productionRecords.id, id));
  }

  async updateProductionTarget(id: number, target: number | null): Promise<void> {
    await db.update(productionRecords).set({ productionTarget: target } as any).where(eq(productionRecords.id, id));
  }

  async getPhaseTable(since: Date): Promise<{ recordId: number; title: string; lotNumber: string | null; customer: string | null; phases: Record<string, number>; lastProducedAt: string | null }[]> {
    const logs = await db
      .select()
      .from(productionLogs)
      .where(sql`${productionLogs.completedAt} >= ${since.toISOString()}`);
    const records = await db.select().from(productionRecords);

    const byRecord = new Map<number, { recordId: number; title: string; lotNumber: string | null; customer: string | null; phases: Record<string, number>; lastProducedAt: string | null }>();
    for (const log of logs) {
      if (!byRecord.has(log.recordId)) {
        const rec = records.find(r => r.id === log.recordId);
        if (!rec) continue;
        byRecord.set(log.recordId, { recordId: log.recordId, title: rec.title, lotNumber: rec.lotNumber ?? null, customer: rec.customer ?? null, phases: {}, lastProducedAt: null });
      }
      const entry = byRecord.get(log.recordId)!;
      entry.phases[log.phase] = (entry.phases[log.phase] ?? 0) + log.quantity;
      if (log.completedAt) {
        const logDate = new Date(log.completedAt).toISOString();
        if (!entry.lastProducedAt || logDate > entry.lastProducedAt) {
          entry.lastProducedAt = logDate;
        }
      }
    }
    return Array.from(byRecord.values());
  }

  async getRecordProductionTotals(): Promise<{ recordId: number; total: number }[]> {
    const result = await db
      .select({
        recordId: productionLogs.recordId,
        total: sql<number>`SUM(${productionLogs.quantity})::int`,
      })
      .from(productionLogs)
      .groupBy(productionLogs.recordId);
    return result.map(r => ({ recordId: r.recordId, total: Number(r.total) }));
  }

  async getRecentActivityByPhase(limit: number): Promise<Record<string, { id: number; recordId: number; title: string; lotNumber: string | null; quantity: number; userName: string; completedAt: string; notes: string | null; hasPhoto: boolean; photoTable: string | null; photoId: number | null; photoField: string | null; itemName: string | null }[]>> {
    const rows = await db.execute(sql`
      SELECT sub.id, sub.record_id, sub.order_item_id, sub.phase, sub.quantity, sub.completed_at, sub.notes,
             pr.title, pr.lot_number,
             COALESCE(u.display_name, u.username) as user_name,
             -- Boolean presence flags only; raw photo bytes are fetched on-demand via /api/photo.
             (pr.pastal_photo_url     IS NOT NULL AND length(pr.pastal_photo_url)     > 0) as pr_pastal,
             (pr.urun_islem_photo_url IS NOT NULL AND length(pr.urun_islem_photo_url) > 0) as pr_urun_islem,
             (pr.katlama_photo_url    IS NOT NULL AND length(pr.katlama_photo_url)    > 0) as pr_katlama,
             (pr.set_toplama_photo_url IS NOT NULL AND length(pr.set_toplama_photo_url) > 0) as pr_set_toplama,
             (pr.kolileme_photo_url   IS NOT NULL AND length(pr.kolileme_photo_url)   > 0) as pr_kolileme,
             (pr.sevkiyat_photo_url   IS NOT NULL AND length(pr.sevkiyat_photo_url)   > 0) as pr_sevkiyat,
             oi.name as item_name,
             (oi.pastal_photo_url     IS NOT NULL AND length(oi.pastal_photo_url)     > 0) as oi_pastal,
             (oi.urun_islem_photo_url IS NOT NULL AND length(oi.urun_islem_photo_url) > 0) as oi_urun_islem,
             (oi.katlama_photo_url    IS NOT NULL AND length(oi.katlama_photo_url)    > 0) as oi_katlama
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY phase ORDER BY completed_at DESC) as rn
        FROM production_logs
      ) sub
      JOIN production_records pr ON pr.id = sub.record_id
      JOIN users u ON u.id = sub.user_id
      LEFT JOIN order_items oi ON oi.id = sub.order_item_id
      WHERE sub.rn <= ${limit}
      ORDER BY sub.phase, sub.completed_at DESC
    `);
    // Map phase -> camelCase field name on production_records / order_items.
    const phaseRecordField: Record<string, string> = {
      pastal: 'pastalPhotoUrl',
      urun_islem: 'urunIslemPhotoUrl',
      katlama: 'katlamaPhotoUrl',
      set_toplama: 'setToplamaPhotoUrl',
      kolileme: 'kolilemePhotoUrl',
      sevkiyat: 'sevkiyatPhotoUrl',
    };
    const phaseItemField: Record<string, string> = {
      pastal: 'pastalPhotoUrl',
      urun_islem: 'urunIslemPhotoUrl',
      katlama: 'katlamaPhotoUrl',
    };
    const phaseRowKey: Record<string, { rec: string; item?: string }> = {
      pastal: { rec: 'pr_pastal', item: 'oi_pastal' },
      urun_islem: { rec: 'pr_urun_islem', item: 'oi_urun_islem' },
      katlama: { rec: 'pr_katlama', item: 'oi_katlama' },
      set_toplama: { rec: 'pr_set_toplama' },
      kolileme: { rec: 'pr_kolileme' },
      sevkiyat: { rec: 'pr_sevkiyat' },
    };
    const result: Record<string, { id: number; recordId: number; title: string; lotNumber: string | null; quantity: number; userName: string; completedAt: string; notes: string | null; hasPhoto: boolean; photoTable: string | null; photoId: number | null; photoField: string | null; itemName: string | null }[]> = {};
    for (const row of rows.rows as any[]) {
      const phase = row.phase as string;
      if (!result[phase]) result[phase] = [];
      const keys = phaseRowKey[phase];
      const orderItemId = row.order_item_id != null ? Number(row.order_item_id) : null;
      const itemHas = !!(keys?.item && orderItemId != null && row[keys.item]);
      const recHas = !!(keys?.rec && row[keys.rec]);
      let photoTable: string | null = null;
      let photoId: number | null = null;
      let photoField: string | null = null;
      if (itemHas && phaseItemField[phase]) {
        photoTable = 'order_items';
        photoId = orderItemId;
        photoField = phaseItemField[phase];
      } else if (recHas && phaseRecordField[phase]) {
        photoTable = 'production_records';
        photoId = Number(row.record_id);
        photoField = phaseRecordField[phase];
      }
      result[phase].push({
        id: Number(row.id),
        recordId: Number(row.record_id),
        title: row.title as string,
        lotNumber: row.lot_number as string | null,
        quantity: Number(row.quantity),
        userName: row.user_name as string,
        completedAt: new Date(row.completed_at).toISOString(),
        notes: row.notes as string | null,
        hasPhoto: itemHas || recHas,
        photoTable,
        photoId,
        photoField,
        itemName: row.item_name as string | null,
      });
    }
    return result;
  }

  async getAllWeeklyPlans(): Promise<{ id: number; weekStart: string; createdAt: string; itemCount: number }[]> {
    const { weeklyPlans, weeklyPlanItems } = await import('@shared/schema');
    const plans = await db.select().from(weeklyPlans).orderBy(sql`${weeklyPlans.weekStart} DESC`);
    const counts = await db.select({
      planId: weeklyPlanItems.planId,
      cnt: sql<number>`COUNT(*)::int`,
    }).from(weeklyPlanItems).groupBy(weeklyPlanItems.planId);
    const countMap = Object.fromEntries(counts.map(c => [c.planId, Number(c.cnt)]));
    return plans.map(p => ({
      id: p.id,
      weekStart: p.weekStart as string,
      createdAt: (p.createdAt as Date).toISOString(),
      itemCount: countMap[p.id] ?? 0,
    }));
  }

  async getWeeklyPlanByWeekStart(weekStart: string): Promise<import('@shared/schema').WeeklyPlan | null> {
    const { weeklyPlans } = await import('@shared/schema');
    const [existing] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.weekStart as any, weekStart));
    return existing ?? null;
  }

  async getOrCreateWeeklyPlan(weekStart: string, userId: number): Promise<import('@shared/schema').WeeklyPlan> {
    const { weeklyPlans } = await import('@shared/schema');
    const [existing] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.weekStart as any, weekStart));
    if (existing) return existing;
    const [created] = await db.insert(weeklyPlans).values({ weekStart: weekStart as any, createdBy: userId }).returning();
    return created;
  }

  async getWeeklyPlanWithItems(planId: number): Promise<{ plan: import('@shared/schema').WeeklyPlan; items: { id: number; recordId: number; targetQuantity: number; title: string; lotNumber: string | null; customer: string | null; priority: string | null; actualQuantity: number; carryOver: number; carriedActualQuantity: number; isCarried: boolean; createdAt: Date | null }[] }> {
    const { weeklyPlans, weeklyPlanItems } = await import('@shared/schema');
    const [plan] = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, planId));
    if (!plan) throw new Error('Plan not found');

    const items = await db.select().from(weeklyPlanItems).where(eq(weeklyPlanItems.planId, planId));
    const records = await db.select().from(productionRecords);

    const weekStartDate = new Date(plan.weekStart + 'T00:00:00');
    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const logs = await db.select().from(productionLogs)
      .where(sql`${productionLogs.phase} IN ('set_toplama', 'kolileme') AND ${productionLogs.completedAt} >= ${weekStartDate.toISOString()} AND ${productionLogs.completedAt} < ${weekEnd.toISOString()}`);

    const actualByRecord: Record<number, number> = {};
    const koliByRecord: Record<number, number> = {};
    for (const log of logs) {
      if (log.phase === 'set_toplama') {
        actualByRecord[log.recordId] = (actualByRecord[log.recordId] ?? 0) + log.quantity;
      } else if (log.phase === 'kolileme') {
        koliByRecord[log.recordId] = (koliByRecord[log.recordId] ?? 0) + log.quantity;
      }
    }

    // Compute carry-over: excess production from previous plan weeks for each record
    const recordIds = items.map(i => i.recordId);
    const prevPlans = await db.select().from(weeklyPlans)
      .where(sql`${weeklyPlans.weekStart} < ${plan.weekStart}`);
    const carryOverByRecord: Record<number, number> = {};
    for (const prevPlan of prevPlans) {
      const prevStart = new Date(prevPlan.weekStart + 'T00:00:00');
      const prevEnd = new Date(prevStart);
      prevEnd.setDate(prevEnd.getDate() + 7);
      const prevItems = await db.select().from(weeklyPlanItems).where(eq(weeklyPlanItems.planId, prevPlan.id));
      const relevantPrevItems = prevItems.filter(pi => recordIds.includes(pi.recordId));
      if (relevantPrevItems.length === 0) continue;
      const prevLogs = await db.select().from(productionLogs).where(
        sql`${productionLogs.phase} = 'set_toplama' AND ${productionLogs.completedAt} >= ${prevStart.toISOString()} AND ${productionLogs.completedAt} < ${prevEnd.toISOString()}`
      );
      const prevActualByRecord: Record<number, number> = {};
      for (const log of prevLogs) {
        if (relevantPrevItems.some(pi => pi.recordId === log.recordId)) {
          prevActualByRecord[log.recordId] = (prevActualByRecord[log.recordId] ?? 0) + log.quantity;
        }
      }
      for (const prevItem of relevantPrevItems) {
        const prevActual = prevActualByRecord[prevItem.recordId] ?? 0;
        const excess = Math.max(0, prevActual - prevItem.targetQuantity);
        carryOverByRecord[prevItem.recordId] = (carryOverByRecord[prevItem.recordId] ?? 0) + excess;
      }
    }

    // All-time phase totals for records in this plan (for "diğer fazlar" display)
    const allTimeLogs = recordIds.length > 0
      ? await db.select().from(productionLogs).where(
          inArray(productionLogs.recordId, recordIds)
        )
      : [];
    const phaseTotalsByRecord: Record<number, Record<string, number>> = {};
    // Prior-week set_toplama totals (logs strictly before this plan's week start)
    const priorSetToplamaByRecord: Record<number, number> = {};
    for (const log of allTimeLogs) {
      if (!phaseTotalsByRecord[log.recordId]) phaseTotalsByRecord[log.recordId] = {};
      phaseTotalsByRecord[log.recordId][log.phase] = (phaseTotalsByRecord[log.recordId][log.phase] ?? 0) + log.quantity;
      if (log.phase === 'set_toplama' && log.completedAt && new Date(log.completedAt) < weekStartDate) {
        priorSetToplamaByRecord[log.recordId] = (priorSetToplamaByRecord[log.recordId] ?? 0) + log.quantity;
      }
    }

    // Fetch order items for all records so we can compute correct per-phase targets
    const allOrderItems = recordIds.length > 0
      ? await db.select().from(orderItems).where(inArray(orderItems.recordId, recordIds))
      : [];
    const orderItemsByRecord: Record<number, typeof allOrderItems> = {};
    for (const oi of allOrderItems) {
      if (!orderItemsByRecord[oi.recordId]) orderItemsByRecord[oi.recordId] = [];
      orderItemsByRecord[oi.recordId].push(oi);
    }

    // Compute per-phase expected totals per record
    // perItem phases (Pastal, Ürün İşlem, Katlama): target = sum(kumaşItem.unitQuantity that includes the phase) × totalQuantity
    // non-perItem phases (Set Toplama, Kolileme, Sevkiyat): target = totalQuantity (Kolileme/Sevkiyat use koli but we show adet here)
    const PER_ITEM_PHASES = ['pastal', 'urun_islem', 'katlama'];
    const phaseExpectedByRecord: Record<number, Record<string, number>> = {};
    for (const rec of records) {
      const recItems = orderItemsByRecord[rec.id] ?? [];
      const totalQty = rec.totalQuantity ?? 0;
      const phaseExp: Record<string, number> = {};
      for (const phase of PER_ITEM_PHASES) {
        // Mirror /api/records/:id/phase-summary exactly so the dashboard panel
        // matches the order detail page: Kumaş items are tracked by default
        // (null fabricPhases = all phases); Diğer items are tracked only when
        // their fabricPhases explicitly includes this phase.
        const phaseItems = recItems.filter(i => {
          if (i.category === 'Kumaş') {
            return i.fabricPhases == null || (i.fabricPhases as string[]).includes(phase);
          }
          return !!i.fabricPhases && (i.fabricPhases as string[]).includes(phase);
        });
        phaseExp[phase] = phaseItems.reduce((s, i) => s + (i.unitQuantity ?? 1), 0) * totalQty;
      }
      phaseExp['set_toplama'] = totalQty;
      const koliTarget = Math.ceil(totalQty / (rec.itemsPerBox || 1));
      phaseExp['kolileme'] = koliTarget;
      phaseExp['sevkiyat'] = koliTarget;
      phaseExpectedByRecord[rec.id] = phaseExp;
    }

    const enrichedItems = items.map(item => {
      const rec = records.find(r => r.id === item.recordId);
      const allTimeSetToplama = phaseTotalsByRecord[item.recordId]?.set_toplama ?? 0;
      const cumulativeActualQuantity = Math.min(allTimeSetToplama, item.targetQuantity);
      const priorActual = priorSetToplamaByRecord[item.recordId] ?? 0;
      const carriedActualQuantity = Math.min(priorActual, item.targetQuantity);
      return {
        id: item.id,
        recordId: item.recordId,
        targetQuantity: item.targetQuantity,
        title: rec?.title ?? '?',
        lotNumber: rec?.lotNumber ?? null,
        customer: rec?.customer ?? null,
        priority: rec?.priority ?? null,
        itemsPerBox: rec?.itemsPerBox ?? null,
        totalQuantity: rec?.totalQuantity ?? null,
        actualQuantity: actualByRecord[item.recordId] ?? 0,
        cumulativeActualQuantity,
        koliQuantity: koliByRecord[item.recordId] ?? 0,
        carryOver: carryOverByRecord[item.recordId] ?? 0,
        carriedActualQuantity,
        isCarried: item.isCarried ?? false,
        createdAt: item.createdAt ?? null,
        phaseTotals: phaseTotalsByRecord[item.recordId] ?? {},
        phaseExpected: phaseExpectedByRecord[item.recordId] ?? {},
      };
    });

    return { plan, items: enrichedItems };
  }

  async addWeeklyPlanItem(planId: number, recordId: number, targetQuantity: number): Promise<import('@shared/schema').WeeklyPlanItem> {
    const { weeklyPlanItems } = await import('@shared/schema');
    await assertWeeklyTargetWithinTotal(recordId, targetQuantity, null);
    const [item] = await db.insert(weeklyPlanItems).values({ planId, recordId, targetQuantity }).returning();
    return item;
  }

  async updateWeeklyPlanItem(itemId: number, targetQuantity: number): Promise<void> {
    const { weeklyPlanItems } = await import('@shared/schema');
    const [existing] = await db.select().from(weeklyPlanItems).where(eq(weeklyPlanItems.id, itemId));
    if (!existing) throw new Error('Haftalık plan kalemi bulunamadı.');
    await assertWeeklyTargetWithinTotal(existing.recordId, targetQuantity, itemId);
    await db.update(weeklyPlanItems).set({ targetQuantity }).where(eq(weeklyPlanItems.id, itemId));
  }

  async deleteWeeklyPlanItem(itemId: number): Promise<void> {
    const { weeklyPlanItems } = await import('@shared/schema');
    await db.delete(weeklyPlanItems).where(eq(weeklyPlanItems.id, itemId));
  }

  async getWeeklyTargetSummary(recordId: number, excludeItemId?: number | null): Promise<{ totalQuantity: number; plannedSum: number; remaining: number }> {
    const { weeklyPlanItems } = await import('@shared/schema');
    const [rec] = await db.select({ totalQuantity: productionRecords.totalQuantity })
      .from(productionRecords)
      .where(eq(productionRecords.id, recordId));
    const total = rec?.totalQuantity ?? 0;
    const conditions = [eq(weeklyPlanItems.recordId, recordId)];
    if (excludeItemId != null) conditions.push(ne(weeklyPlanItems.id, excludeItemId));
    const rows = await db.select({ t: weeklyPlanItems.targetQuantity })
      .from(weeklyPlanItems)
      .where(and(...conditions));
    const plannedSum = rows.reduce((s, r) => s + (r.t ?? 0), 0);
    const remaining = Math.max(0, total - plannedSum);
    return { totalQuantity: total, plannedSum, remaining };
  }

  async getWeeklyTargetSummariesForRecords(recordIds: number[]): Promise<Record<number, { totalQuantity: number; plannedSum: number; remaining: number }>> {
    const result: Record<number, { totalQuantity: number; plannedSum: number; remaining: number }> = {};
    if (!recordIds.length) return result;
    const { weeklyPlanItems } = await import('@shared/schema');
    const recs = await db.select({ id: productionRecords.id, totalQuantity: productionRecords.totalQuantity })
      .from(productionRecords)
      .where(inArray(productionRecords.id, recordIds));
    const totals = new Map<number, number>();
    for (const r of recs) totals.set(r.id, r.totalQuantity ?? 0);
    const sums = await db.select({
      recordId: weeklyPlanItems.recordId,
      planned: sql<number>`coalesce(sum(${weeklyPlanItems.targetQuantity}), 0)`,
    })
      .from(weeklyPlanItems)
      .where(inArray(weeklyPlanItems.recordId, recordIds))
      .groupBy(weeklyPlanItems.recordId);
    const planned = new Map<number, number>();
    for (const s of sums) planned.set(s.recordId, Number(s.planned) || 0);
    for (const id of recordIds) {
      const total = totals.get(id) ?? 0;
      const plannedSum = planned.get(id) ?? 0;
      result[id] = { totalQuantity: total, plannedSum, remaining: Math.max(0, total - plannedSum) };
    }
    return result;
  }

  async markAutoCarried(planId: number): Promise<void> {
    const { weeklyPlans } = await import('@shared/schema');
    await db.update(weeklyPlans).set({ autoCarriedAt: new Date() } as any).where(eq(weeklyPlans.id, planId));
  }

  async getMostRecentPastPlan(beforeWeekStart: string): Promise<import('@shared/schema').WeeklyPlan | null> {
    const { weeklyPlans } = await import('@shared/schema');
    const [plan] = await db.select().from(weeklyPlans)
      .where(sql`${weeklyPlans.weekStart} < ${beforeWeekStart}`)
      .orderBy(sql`${weeklyPlans.weekStart} DESC`)
      .limit(1);
    return plan ?? null;
  }

  async carryForwardIncompleteItems(fromPlanId: number, toPlanId: number): Promise<{ carried: number; items: { recordId: number; title: string; remaining: number }[] }> {
    const { weeklyPlanItems } = await import('@shared/schema');
    const fromData = await this.getWeeklyPlanWithItems(fromPlanId);
    const toItems = await db.select().from(weeklyPlanItems).where(eq(weeklyPlanItems.planId, toPlanId));
    const existingRecordIds = new Set(toItems.map(i => i.recordId));

    const carried: { recordId: number; title: string; remaining: number }[] = [];
    for (const item of fromData.items) {
      const remaining = Math.max(0, item.targetQuantity - item.actualQuantity);
      if (remaining > 0 && !existingRecordIds.has(item.recordId)) {
        await db.insert(weeklyPlanItems).values({ planId: toPlanId, recordId: item.recordId, targetQuantity: remaining, isCarried: true });
        carried.push({ recordId: item.recordId, title: item.title, remaining });
      }
    }
    return { carried: carried.length, items: carried };
  }

  async getSamples(filters?: { search?: string }): Promise<Sample[]> {
    if (filters?.search) {
      const s = `%${filters.search}%`;
      return db.select().from(samples).where(
        or(ilike(samples.title, s), ilike(samples.lotNumber, s), ilike(samples.customer, s), ilike(samples.referenceId, s))
      ).orderBy(desc(samples.createdAt));
    }
    return db.select().from(samples).orderBy(desc(samples.createdAt));
  }

  async getSample(id: number): Promise<Sample | undefined> {
    const [s] = await db.select().from(samples).where(eq(samples.id, id));
    return s;
  }

  async createSample(sample: InsertSample): Promise<Sample> {
    const [s] = await db.insert(samples).values(sample).returning();
    return s;
  }

  async updateSample(id: number, updates: Partial<InsertSample>): Promise<Sample> {
    const [s] = await db.update(samples).set({ ...updates, updatedAt: new Date() }).where(eq(samples.id, id)).returning();
    return s;
  }

  async deleteSample(id: number): Promise<void> {
    await db.delete(samplePhotos).where(eq(samplePhotos.sampleId, id));
    await db.delete(samples).where(eq(samples.id, id));
  }

  async getSamplePhotos(sampleId: number): Promise<SamplePhoto[]> {
    return db.select().from(samplePhotos).where(eq(samplePhotos.sampleId, sampleId)).orderBy(desc(samplePhotos.createdAt));
  }

  async addSamplePhoto(photo: InsertSamplePhoto): Promise<SamplePhoto> {
    const [p] = await db.insert(samplePhotos).values(photo).returning();
    return p;
  }

  async deleteSamplePhoto(id: number): Promise<void> {
    await db.delete(samplePhotos).where(eq(samplePhotos.id, id));
  }

  async getSampleItems(sampleId: number): Promise<SampleItem[]> {
    return db.select().from(sampleItems).where(eq(sampleItems.sampleId, sampleId)).orderBy(sampleItems.id);
  }

  async createSampleItem(item: InsertSampleItem): Promise<SampleItem> {
    const [created] = await db.insert(sampleItems).values(item).returning();
    return created;
  }

  async updateSampleItem(id: number, updates: Partial<InsertSampleItem>): Promise<SampleItem> {
    const [updated] = await db.update(sampleItems).set(updates).where(eq(sampleItems.id, id)).returning();
    return updated;
  }

  async deleteSampleItem(id: number): Promise<void> {
    await db.delete(sampleItems).where(eq(sampleItems.id, id));
  }

  async getShipmentsList(): Promise<Array<Shipment & { record: ProductionRecord; readyBoxes: number; totalPlannedBoxes: number; shippedByName: string | null }>> {
    const records = await db.select().from(productionRecords)
      .where(ne(productionRecords.orderType, 'stok'))
      .orderBy(productionRecords.fifoOrder, productionRecords.orderDate, productionRecords.createdAt);
    if (records.length === 0) return [];
    const recordIds = records.map(r => r.id);

    // Batch: sevkiyat-phase processed quantity (in koli) per record
    const sevkiyatRows = await db
      .select({
        recordId: productionLogs.recordId,
        total: sql<number>`coalesce(sum(${productionLogs.quantity}), 0)`,
      })
      .from(productionLogs)
      .where(and(inArray(productionLogs.recordId, recordIds), eq(productionLogs.phase, 'sevkiyat')))
      .groupBy(productionLogs.recordId);
    const sevkiyatMap = new Map<number, number>();
    for (const r of sevkiyatRows) sevkiyatMap.set(r.recordId, Number(r.total ?? 0));

    // Batch: existing shipment rows
    const existingShipments = await db.select().from(shipments).where(inArray(shipments.recordId, recordIds));
    const shipmentByRecord = new Map<number, Shipment>();
    for (const s of existingShipments) shipmentByRecord.set(s.recordId, s);

    // Create missing shipment rows
    for (const record of records) {
      if (!shipmentByRecord.has(record.id)) {
        const [created] = await db.insert(shipments).values({ recordId: record.id }).returning();
        shipmentByRecord.set(record.id, created);
      }
    }

    // Batch: assigned koli per shipment. boxCount always represents koli
    // count regardless of loadingType (loadingType is packaging/display only).
    const allShipmentIds = Array.from(shipmentByRecord.values()).map(s => s.id);
    const assignedRows = allShipmentIds.length > 0
      ? await db
          .select({
            shipmentId: shipmentPlanItems.shipmentId,
            total: sql<number>`coalesce(sum(${shipmentPlanItems.boxCount}), 0)`,
          })
          .from(shipmentPlanItems)
          .where(inArray(shipmentPlanItems.shipmentId, allShipmentIds))
          .groupBy(shipmentPlanItems.shipmentId)
      : [];
    const assignedMap = new Map<number, number>();
    for (const r of assignedRows) assignedMap.set(r.shipmentId, Number(r.total ?? 0));

    // Resolve display names for shippedBy users (used by off-record audit display).
    const shipperIds = Array.from(
      new Set(
        Array.from(shipmentByRecord.values())
          .map(s => s.shippedBy)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const shipperNameById = new Map<number, string>();
    if (shipperIds.length > 0) {
      const shipperRows = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          username: users.username,
        })
        .from(users)
        .where(inArray(users.id, shipperIds));
      for (const u of shipperRows) {
        shipperNameById.set(u.id, u.displayName || u.username);
      }
    }

    const result: Array<Shipment & { record: ProductionRecord; readyBoxes: number; totalPlannedBoxes: number; shippedByName: string | null }> = [];
    for (const record of records) {
      const ship = shipmentByRecord.get(record.id)!;
      const sevkiyatProcessed = sevkiyatMap.get(record.id) ?? 0;
      const assignedKoli = assignedMap.get(ship.id) ?? 0;
      const totalBoxes = Math.ceil(record.totalQuantity / (record.itemsPerBox || 1));
      // Numune (sample) shipments don't go through sevkiyat-phase logging,
      // so use physical capacity as ready source for them.
      const isNumune = record.orderType === 'numune';
      const readySource = isNumune ? totalBoxes : sevkiyatProcessed;
      const readyBoxes = Math.max(0, readySource - assignedKoli);
      const totalPlannedBoxes = Math.max(0, totalBoxes - assignedKoli);

      // Sync persisted pendingBoxes (cache for legacy consumers). Status is
      // only auto-promoted to 'araca_yuklendi' when all koli are assigned;
      // we never downgrade an already-promoted status (e.g. an admin's
      // historical "Bu sipariş daha önceden sevk edildi" mark).
      const shouldPromote = totalPlannedBoxes === 0 && assignedKoli > 0 && ship.status !== 'araca_yuklendi';
      const nextStatus = shouldPromote ? 'araca_yuklendi' : ship.status;
      if (ship.pendingBoxes !== totalPlannedBoxes || ship.status !== nextStatus) {
        await db.update(shipments)
          .set({ pendingBoxes: totalPlannedBoxes, status: nextStatus })
          .where(eq(shipments.id, ship.id));
        ship.pendingBoxes = totalPlannedBoxes;
        ship.status = nextStatus;
      }

      // Visibility:
      //  - Always include numune (sample) sevkiyatları — they are created
      //    without sevkiyat-phase logs by `/api/samples/:id/sevkiyat`.
      //  - Otherwise show when readyBoxes > 0 (partial-shipment ready) or
      //    when the shipment is already marked araca_yuklendi (historical).
      if (isNumune || readyBoxes > 0 || ship.status === 'araca_yuklendi') {
        const shippedByName = ship.shippedBy ? (shipperNameById.get(ship.shippedBy) ?? null) : null;
        result.push({ ...ship, record, readyBoxes, totalPlannedBoxes, shippedByName });
      }
    }
    return result;
  }

  /**
   * Recompute and persist pendingBoxes + status for a shipment from its current
   * shipmentPlanItems. Used after every plan create/update/delete so the
   * column stays consistent with the source of truth.
   */
  private async recomputeShipmentState(shipmentId: number): Promise<void> {
    const [ship] = await db.select().from(shipments).where(eq(shipments.id, shipmentId));
    if (!ship) return;
    const [record] = await db.select().from(productionRecords).where(eq(productionRecords.id, ship.recordId));
    if (!record) return;
    const [row] = await db
      .select({
        total: sql<number>`coalesce(sum(${shipmentPlanItems.boxCount}), 0)`,
      })
      .from(shipmentPlanItems)
      .where(eq(shipmentPlanItems.shipmentId, shipmentId));
    const assignedKoli = Number(row?.total ?? 0);
    const totalBoxes = Math.ceil(record.totalQuantity / (record.itemsPerBox || 1));
    const newPending = Math.max(0, totalBoxes - assignedKoli);
    // Promote to 'araca_yuklendi' only when all koli are committed; never
    // downgrade an already-promoted status (e.g. an admin's historical mark).
    const shouldPromote = newPending === 0 && assignedKoli > 0 && ship.status !== 'araca_yuklendi';
    const nextStatus = shouldPromote ? 'araca_yuklendi' : ship.status;
    await db.update(shipments)
      .set({ pendingBoxes: newPending, status: nextStatus })
      .where(eq(shipments.id, shipmentId));
  }

  /**
   * Validate that the requested koli amounts per shipment fit within currently
   * "ready" boxes (sevkiyat-phase logs minus already-assigned koli, with the
   * given excludePlanId removed from the assigned count when editing a plan).
   * Throws an Error whose message is suitable to surface as HTTP 400.
   */
  private async validateShipmentItemAvailability(
    items: Array<{ shipmentId: number; boxCount: number; loadingType: string }>,
    excludePlanId?: number,
  ): Promise<void> {
    const requestedByShipment = new Map<number, number>();
    for (const it of items) {
      // boxCount IS the koli total regardless of loadingType (loadingType is
      // packaging/display only).
      const koli = it.boxCount;
      requestedByShipment.set(it.shipmentId, (requestedByShipment.get(it.shipmentId) ?? 0) + koli);
    }
    if (requestedByShipment.size === 0) return;
    const shipmentIds = Array.from(requestedByShipment.keys());
    const shipRows = await db.select().from(shipments).where(inArray(shipments.id, shipmentIds));
    const recordIds = shipRows.map(s => s.recordId);
    const recRows = recordIds.length > 0
      ? await db.select().from(productionRecords).where(inArray(productionRecords.id, recordIds))
      : [];
    const recordById = new Map(recRows.map(r => [r.id, r] as const));

    const sevkRows = recordIds.length > 0
      ? await db
          .select({
            recordId: productionLogs.recordId,
            total: sql<number>`coalesce(sum(${productionLogs.quantity}), 0)`,
          })
          .from(productionLogs)
          .where(and(inArray(productionLogs.recordId, recordIds), eq(productionLogs.phase, 'sevkiyat')))
          .groupBy(productionLogs.recordId)
      : [];
    const sevkMap = new Map<number, number>();
    for (const r of sevkRows) sevkMap.set(r.recordId, Number(r.total ?? 0));

    const assignedConditions = excludePlanId !== undefined
      ? and(inArray(shipmentPlanItems.shipmentId, shipmentIds), ne(shipmentPlanItems.planId, excludePlanId))
      : inArray(shipmentPlanItems.shipmentId, shipmentIds);
    const assignedRows = await db
      .select({
        shipmentId: shipmentPlanItems.shipmentId,
        total: sql<number>`coalesce(sum(${shipmentPlanItems.boxCount}), 0)`,
      })
      .from(shipmentPlanItems)
      .where(assignedConditions)
      .groupBy(shipmentPlanItems.shipmentId);
    const assignedMap = new Map<number, number>();
    for (const r of assignedRows) assignedMap.set(r.shipmentId, Number(r.total ?? 0));

    for (const ship of shipRows) {
      const requested = requestedByShipment.get(ship.id) ?? 0;
      const record = recordById.get(ship.recordId);
      const sevkiyatProcessed = sevkMap.get(ship.recordId) ?? 0;
      const assigned = assignedMap.get(ship.id) ?? 0;
      // Numune (sample) shipments don't go through sevkiyat-phase logging,
      // so fall back to physical capacity (totalBoxes - assigned) for them.
      const isNumune = record?.orderType === 'numune';
      const totalBoxes = record ? Math.ceil(record.totalQuantity / (record.itemsPerBox || 1)) : 0;
      const available = isNumune
        ? Math.max(0, totalBoxes - assigned)
        : Math.max(0, sevkiyatProcessed - assigned);
      if (requested > available) {
        const title = record?.title ?? `#${ship.recordId}`;
        const err: Error & { httpStatus?: number } = new Error(
          `"${title}" siparişi için yeterli hazır koli yok (istenen ${requested}, hazır ${available}).`,
        );
        err.httpStatus = 400;
        throw err;
      }
    }
  }

  async getShipmentByRecordId(recordId: number): Promise<Shipment | undefined> {
    const [s] = await db.select().from(shipments).where(eq(shipments.recordId, recordId));
    return s;
  }

  async getShipmentById(id: number): Promise<Shipment | undefined> {
    const [s] = await db.select().from(shipments).where(eq(shipments.id, id));
    return s;
  }

  async getOrCreateShipment(recordId: number): Promise<Shipment> {
    const [existing] = await db.select().from(shipments).where(eq(shipments.recordId, recordId));
    if (existing) return existing;
    const [created] = await db.insert(shipments).values({ recordId }).returning();
    return created;
  }

  async updateShipment(id: number, updates: Partial<InsertShipment>): Promise<Shipment> {
    const [s] = await db.update(shipments).set(updates).where(eq(shipments.id, id)).returning();
    return s;
  }

  async markShipmentOffRecord(shipmentId: number, userId: number): Promise<Shipment> {
    const [s] = await db.update(shipments)
      .set({
        status: 'araca_yuklendi',
        shippedAt: new Date(),
        shippedBy: userId,
        offRecord: true,
        pendingBoxes: 0,
      })
      .where(eq(shipments.id, shipmentId))
      .returning();
    if (!s) throw new Error('Sevkiyat bulunamadı');
    return s;
  }

  async getShipmentPhotos(shipmentId: number): Promise<ShipmentPhoto[]> {
    return db.select().from(shipmentPhotos).where(eq(shipmentPhotos.shipmentId, shipmentId)).orderBy(desc(shipmentPhotos.createdAt));
  }

  async addShipmentPhoto(photo: InsertShipmentPhoto): Promise<ShipmentPhoto> {
    const [p] = await db.insert(shipmentPhotos).values(photo).returning();
    return p;
  }

  async deleteShipmentPhoto(id: number): Promise<void> {
    await db.delete(shipmentPhotos).where(eq(shipmentPhotos.id, id));
  }

  async getShipmentBarkodDogrulamalari(shipmentId: number): Promise<Array<ShipmentBarkodDogrulama & { kullaniciAdi: string | null }>> {
    const rows = await db
      .select({
        id: shipmentBarkodDogrulamalari.id,
        shipmentId: shipmentBarkodDogrulamalari.shipmentId,
        stokItemId: shipmentBarkodDogrulamalari.stokItemId,
        code: shipmentBarkodDogrulamalari.code,
        ok: shipmentBarkodDogrulamalari.ok,
        kullanici: shipmentBarkodDogrulamalari.kullanici,
        kaynak: shipmentBarkodDogrulamalari.kaynak,
        ts: shipmentBarkodDogrulamalari.ts,
        kullaniciAdi: sql<string | null>`coalesce(${users.displayName}, ${users.username})`,
      })
      .from(shipmentBarkodDogrulamalari)
      .leftJoin(users, eq(users.id, shipmentBarkodDogrulamalari.kullanici))
      .where(eq(shipmentBarkodDogrulamalari.shipmentId, shipmentId))
      .orderBy(desc(shipmentBarkodDogrulamalari.ts));
    return rows;
  }

  async addShipmentBarkodDogrulama(d: InsertShipmentBarkodDogrulama): Promise<ShipmentBarkodDogrulama> {
    const [row] = await db.insert(shipmentBarkodDogrulamalari).values(d).returning();
    return row;
  }

  async createShipmentPlan(
    vehicleType: string,
    plannedDepartureDate: string,
    notes: string | null,
    shippingCompany: string | null,
    createdBy: number,
    addresses: Array<string | { address: string; irsaliyePhoto?: string }>,
    items: Array<{ shipmentId: number; boxCount: number; loadingType: string; addressIndex?: number }>,
    photos: string[],
    extras?: { driverName?: string; driverPhone?: string; vehiclePlate?: string; dorsePlate?: string; driverPhoto?: string; cargoCompany?: string; cargoTitle?: string; cargoDescription?: string; cargoLabelPhoto?: string }
  ): Promise<ShipmentPlan> {
    // Validate readiness FIRST so a failure does not leave any plan rows
    // behind. The throw bubbles up as a 400 from the route handler.
    await this.validateShipmentItemAvailability(items);
    const [plan] = await db.insert(shipmentPlans).values({
      vehicleType,
      plannedDepartureDate,
      shippingCompany,
      notes,
      createdBy,
      status: 'active',
      ...(extras?.driverName !== undefined && { driverName: extras.driverName }),
      ...(extras?.driverPhone !== undefined && { driverPhone: extras.driverPhone }),
      ...(extras?.vehiclePlate !== undefined && { vehiclePlate: extras.vehiclePlate }),
      ...(extras?.dorsePlate !== undefined && { dorsePlate: extras.dorsePlate }),
      ...(extras?.driverPhoto !== undefined && { driverPhoto: extras.driverPhoto }),
      ...(extras?.cargoCompany !== undefined && { cargoCompany: extras.cargoCompany }),
      ...(extras?.cargoTitle !== undefined && { cargoTitle: extras.cargoTitle }),
      ...(extras?.cargoDescription !== undefined && { cargoDescription: extras.cargoDescription }),
      ...(extras?.cargoLabelPhoto !== undefined && { cargoLabelPhoto: extras.cargoLabelPhoto }),
    }).returning();
    for (const addr of addresses) {
      const addrStr = typeof addr === 'string' ? addr : addr.address;
      const irsaliye = typeof addr === 'string' ? undefined : addr.irsaliyePhoto;
      await db.insert(shipmentPlanAddresses).values({ planId: plan.id, address: addrStr, ...(irsaliye ? { irsaliyePhoto: irsaliye } : {}) });
    }
    const touchedShipments = new Set<number>();
    for (const item of items) {
      await db.insert(shipmentPlanItems).values({
        planId: plan.id,
        shipmentId: item.shipmentId,
        boxCount: item.boxCount,
        loadingType: item.loadingType,
        addressIndex: item.addressIndex ?? 0,
      });
      touchedShipments.add(item.shipmentId);
    }
    for (const sid of Array.from(touchedShipments)) await this.recomputeShipmentState(sid);
    for (const photoUrl of photos) {
      await db.insert(shipmentPlanPhotos).values({ planId: plan.id, photoUrl, uploadedBy: createdBy });
    }
    return plan;
  }

  async getShipmentPlans(status?: 'active' | 'departed'): Promise<Array<ShipmentPlan & { addresses: ShipmentPlanAddress[]; items: Array<ShipmentPlanItem & { shipment: Shipment & { record: ProductionRecord } }>; photos: ShipmentPlanPhoto[]; createdByUser?: string; departedByUser?: string }>> {
    const allPlans = await db.select({
      id: shipmentPlans.id,
      vehicleType: shipmentPlans.vehicleType,
      plannedDepartureDate: shipmentPlans.plannedDepartureDate,
      shippingCompany: shipmentPlans.shippingCompany,
      status: shipmentPlans.status,
      notes: shipmentPlans.notes,
      createdBy: shipmentPlans.createdBy,
      createdAt: shipmentPlans.createdAt,
      departedAt: shipmentPlans.departedAt,
      departedBy: shipmentPlans.departedBy,
      driverName: shipmentPlans.driverName,
      driverPhone: shipmentPlans.driverPhone,
      vehiclePlate: shipmentPlans.vehiclePlate,
      dorsePlate: shipmentPlans.dorsePlate,
      driverPhoto: shipmentPlans.driverPhoto,
      cargoCompany: shipmentPlans.cargoCompany,
      cargoTitle: shipmentPlans.cargoTitle,
      cargoDescription: shipmentPlans.cargoDescription,
      cargoLabelPhoto: shipmentPlans.cargoLabelPhoto,
    }).from(shipmentPlans).orderBy(desc(shipmentPlans.createdAt)) as unknown as ShipmentPlan[];
    const plans = status ? allPlans.filter(p => p.status === status) : allPlans;
    if (plans.length === 0) return [];

    const planIds = plans.map(p => p.id);

    const [allAddresses, allItems, allPhotos] = await Promise.all([
      db.select({
        id: shipmentPlanAddresses.id,
        planId: shipmentPlanAddresses.planId,
        address: shipmentPlanAddresses.address,
        createdAt: shipmentPlanAddresses.createdAt,
      }).from(shipmentPlanAddresses).where(inArray(shipmentPlanAddresses.planId, planIds)).orderBy(shipmentPlanAddresses.id),
      db.select({
        id: shipmentPlanItems.id,
        planId: shipmentPlanItems.planId,
        shipmentId: shipmentPlanItems.shipmentId,
        boxCount: shipmentPlanItems.boxCount,
        loadingType: shipmentPlanItems.loadingType,
        addressIndex: shipmentPlanItems.addressIndex,
        createdAt: shipmentPlanItems.createdAt,
      }).from(shipmentPlanItems).where(inArray(shipmentPlanItems.planId, planIds)) as unknown as ShipmentPlanItem[],
      db.select({
        id: shipmentPlanPhotos.id,
        planId: shipmentPlanPhotos.planId,
        photoUrl: shipmentPlanPhotos.photoUrl,
        uploadedBy: shipmentPlanPhotos.uploadedBy,
        createdAt: shipmentPlanPhotos.createdAt,
      }).from(shipmentPlanPhotos).where(inArray(shipmentPlanPhotos.planId, planIds)) as unknown as ShipmentPlanPhoto[],
    ]);

    // Tüm shipment ve record'ları tek sorguda çek
    const shipmentIds = [...new Set(allItems.map(i => i.shipmentId))];
    const allShipments = shipmentIds.length > 0
      ? await db.select().from(shipments).where(inArray(shipments.id, shipmentIds))
      : [];
    const recordIds = [...new Set(allShipments.map(s => s.recordId))];
    // Sadece görüntüleme için gereken alanları seç — fotoğraf sütunlarını hariç tut (base64 = büyük veri)
    const allRecords = recordIds.length > 0
      ? await db.select({
          id: productionRecords.id,
          title: productionRecords.title,
          customer: productionRecords.customer,
          lotNumber: productionRecords.lotNumber,
          totalQuantity: productionRecords.totalQuantity,
          itemsPerBox: productionRecords.itemsPerBox,
          status: productionRecords.status,
          createdAt: productionRecords.createdAt,
          createdBy: productionRecords.createdBy,
        }).from(productionRecords).where(inArray(productionRecords.id, recordIds)) as unknown as ProductionRecord[]
      : [] as ProductionRecord[];

    // Kullanıcı adlarını toplu çek
    const userIds = [...new Set([
      ...plans.map(p => p.createdBy).filter(Boolean) as number[],
      ...plans.map(p => p.departedBy).filter(Boolean) as number[],
    ])];
    const allUsers = userIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];

    // Map'lere dönüştür
    const shipmentMap = new Map(allShipments.map(s => [s.id, s]));
    const recordMap = new Map(allRecords.map(r => [r.id, r]));
    const userMap = new Map(allUsers.map(u => [u.id, u.displayName || u.username]));

    return plans.map(plan => {
      const addresses = allAddresses.filter(a => a.planId === plan.id);
      const rawItems = allItems.filter(i => i.planId === plan.id);
      const photos = allPhotos.filter(ph => ph.planId === plan.id);
      const itemsWithShipment = rawItems
        .map(item => {
          const shipment = shipmentMap.get(item.shipmentId);
          if (!shipment) return null;
          const record = recordMap.get(shipment.recordId);
          if (!record) return null;
          return { ...item, shipment: { ...shipment, record } };
        })
        .filter(Boolean) as Array<ShipmentPlanItem & { shipment: Shipment & { record: ProductionRecord } }>;
      return {
        ...plan,
        addresses,
        items: itemsWithShipment,
        photos,
        createdByUser: plan.createdBy ? userMap.get(plan.createdBy) : undefined,
        departedByUser: plan.departedBy ? userMap.get(plan.departedBy) : undefined,
      };
    });
  }

  async getShipmentPlanById(planId: number): Promise<(ShipmentPlan & { addresses: ShipmentPlanAddress[]; items: Array<ShipmentPlanItem & { shipment: Shipment & { record: ProductionRecord } }>; photos: ShipmentPlanPhoto[]; createdByUser?: string; departedByUser?: string }) | null> {
    const [plan] = await db.select().from(shipmentPlans).where(eq(shipmentPlans.id, planId));
    if (!plan) return null;

    const [addresses, items, photos] = await Promise.all([
      db.select().from(shipmentPlanAddresses).where(eq(shipmentPlanAddresses.planId, planId)).orderBy(shipmentPlanAddresses.id),
      db.select().from(shipmentPlanItems).where(eq(shipmentPlanItems.planId, planId)),
      db.select().from(shipmentPlanPhotos).where(eq(shipmentPlanPhotos.planId, planId)),
    ]);

    const shipmentIds = [...new Set(items.map(i => i.shipmentId))];
    const allShipments = shipmentIds.length > 0
      ? await db.select().from(shipments).where(inArray(shipments.id, shipmentIds))
      : [];
    const recordIds = [...new Set(allShipments.map(s => s.recordId))];
    const allRecords = recordIds.length > 0
      ? await db.select().from(productionRecords).where(inArray(productionRecords.id, recordIds))
      : [];

    const userIds = [...new Set([plan.createdBy, plan.departedBy].filter(Boolean) as number[])];
    const allUsers = userIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];

    const shipmentMap = new Map(allShipments.map(s => [s.id, s]));
    const recordMap = new Map(allRecords.map(r => [r.id, r]));
    const userMap = new Map(allUsers.map(u => [u.id, u.displayName || u.username]));

    const itemsWithShipment = items
      .map(item => {
        const shipment = shipmentMap.get(item.shipmentId);
        if (!shipment) return null;
        const record = recordMap.get(shipment.recordId);
        if (!record) return null;
        return { ...item, shipment: { ...shipment, record } };
      })
      .filter(Boolean) as Array<ShipmentPlanItem & { shipment: Shipment & { record: ProductionRecord } }>;

    return {
      ...plan,
      addresses,
      items: itemsWithShipment,
      photos,
      createdByUser: plan.createdBy ? userMap.get(plan.createdBy) : undefined,
      departedByUser: plan.departedBy ? userMap.get(plan.departedBy) : undefined,
    };
  }

  async departShipmentPlan(planId: number, userId: number, departurePhotoUrl?: string): Promise<ShipmentPlan> {
    const [plan] = await db.update(shipmentPlans)
      .set({ status: 'departed', departedAt: new Date(), departedBy: userId })
      .where(eq(shipmentPlans.id, planId))
      .returning();
    if (departurePhotoUrl) {
      await db.insert(shipmentPlanPhotos).values({ planId, photoUrl: departurePhotoUrl, uploadedBy: userId });
    }
    return plan;
  }

  async updateShipmentPlanCompany(planId: number, shippingCompany: string | null): Promise<ShipmentPlan> {
    const [plan] = await db.update(shipmentPlans)
      .set({ shippingCompany })
      .where(eq(shipmentPlans.id, planId))
      .returning();
    return plan;
  }

  async updateShipmentPlan(planId: number, updates: { vehicleType?: string; plannedDepartureDate?: string; notes?: string | null; shippingCompany?: string | null; addresses?: Array<string | { address: string; irsaliyePhoto?: string }>; items?: Array<{ shipmentId: number; boxCount: number; loadingType: string; addressIndex?: number }>; photos?: string[] }, uploadedBy?: number): Promise<ShipmentPlan> {
    type ShipmentPlanSetValues = Pick<typeof shipmentPlans.$inferInsert, 'vehicleType' | 'plannedDepartureDate' | 'notes' | 'shippingCompany'>;
    const setValues: Partial<ShipmentPlanSetValues> = {};
    if (updates.vehicleType !== undefined) setValues.vehicleType = updates.vehicleType;
    if (updates.plannedDepartureDate !== undefined) setValues.plannedDepartureDate = updates.plannedDepartureDate;
    if (updates.notes !== undefined) setValues.notes = updates.notes;
    if (updates.shippingCompany !== undefined) setValues.shippingCompany = updates.shippingCompany;

    const [plan] = await db.update(shipmentPlans)
      .set(setValues)
      .where(eq(shipmentPlans.id, planId))
      .returning();

    if (updates.addresses !== undefined) {
      await db.delete(shipmentPlanAddresses).where(eq(shipmentPlanAddresses.planId, planId));
      for (const addr of updates.addresses) {
        const addrStr = typeof addr === 'string' ? addr : addr.address;
        const irsaliye = typeof addr === 'string' ? undefined : addr.irsaliyePhoto;
        if (addrStr.trim()) {
          await db.insert(shipmentPlanAddresses).values({ planId, address: addrStr, ...(irsaliye ? { irsaliyePhoto: irsaliye } : {}) });
        }
      }
    }

    if (updates.items !== undefined) {
      // Validate availability EXCLUDING this plan's existing items, since they
      // are about to be replaced.
      await this.validateShipmentItemAvailability(updates.items, planId);
      const currentItems = await db.select().from(shipmentPlanItems).where(eq(shipmentPlanItems.planId, planId));
      const touched = new Set<number>();
      for (const it of currentItems) touched.add(it.shipmentId);
      await db.delete(shipmentPlanItems).where(eq(shipmentPlanItems.planId, planId));
      for (const item of updates.items) {
        await db.insert(shipmentPlanItems).values({
          planId,
          shipmentId: item.shipmentId,
          boxCount: item.boxCount,
          loadingType: item.loadingType,
          addressIndex: item.addressIndex ?? 0,
        });
        touched.add(item.shipmentId);
      }
      for (const sid of Array.from(touched)) await this.recomputeShipmentState(sid);
    }

    if (updates.photos !== undefined) {
      // Replace plan photos (excluding departure photo which has no uploadedBy match)
      await db.delete(shipmentPlanPhotos)
        .where(eq(shipmentPlanPhotos.planId, planId));
      for (const photoUrl of updates.photos) {
        if (photoUrl) {
          await db.insert(shipmentPlanPhotos).values({
            planId,
            photoUrl,
            uploadedBy: uploadedBy ?? null,
          });
        }
      }
    }

    return plan;
  }

  async getShipmentPlansByShipmentId(shipmentId: number): Promise<ShipmentPlan[]> {
    const items = await db.select().from(shipmentPlanItems).where(eq(shipmentPlanItems.shipmentId, shipmentId));
    if (items.length === 0) return [];
    const planIds = [...new Set(items.map(i => i.planId))];
    const result: ShipmentPlan[] = [];
    for (const pid of planIds) {
      const [p] = await db.select().from(shipmentPlans).where(eq(shipmentPlans.id, pid));
      if (p) result.push(p);
    }
    return result;
  }

  async deleteShipmentPlan(planId: number): Promise<void> {
    // Capture which shipments will be affected so we can recompute their
    // pendingBoxes/status after the plan items are gone.
    const affected = await db.select({ shipmentId: shipmentPlanItems.shipmentId })
      .from(shipmentPlanItems).where(eq(shipmentPlanItems.planId, planId));
    const touched = new Set<number>(affected.map(a => a.shipmentId));
    await db.delete(shipmentPlanPhotos).where(eq(shipmentPlanPhotos.planId, planId));
    await db.delete(shipmentPlanItems).where(eq(shipmentPlanItems.planId, planId));
    await db.delete(shipmentPlanAddresses).where(eq(shipmentPlanAddresses.planId, planId));
    await db.delete(shipmentPlans).where(eq(shipmentPlans.id, planId));
    for (const sid of Array.from(touched)) await this.recomputeShipmentState(sid);
  }

  /* ── Address Library ─────────────────────────────────────────────────── */

  async getAddressLibrary(): Promise<AddressLibrary[]> {
    return db.select().from(addressLibrary).orderBy(desc(addressLibrary.useCount), desc(addressLibrary.lastUsedAt));
  }

  async upsertAddressLibrary(address: string): Promise<void> {
    const trimmed = address.trim();
    if (!trimmed) return;
    await db.execute(sql`
      INSERT INTO address_library (address, use_count, last_used_at)
      VALUES (${trimmed}, 1, NOW())
      ON CONFLICT (address) DO UPDATE
        SET use_count = address_library.use_count + 1, last_used_at = NOW()
    `);
  }

  /* ── Chat Channels ───────────────────────────────────────────────────── */

  async getAccessibleChannels(userId: number, userRole: string): Promise<import('@shared/schema').ChatChannel[]> {
    const { chatChannels, channelMembers } = await import('@shared/schema');
    const MANAGER_ROLES = ['admin', 'uretim_sefi', 'ofis_calisan'];
    if (MANAGER_ROLES.includes(userRole)) {
      return db.select().from(chatChannels).orderBy(chatChannels.createdAt);
    }
    const rows = await db.execute(sql`
      SELECT c.* FROM chat_channels c
      WHERE EXISTS (
        SELECT 1 FROM channel_members m WHERE m.channel_id = c.id AND m.user_id = ${userId}
      )
      ORDER BY c.created_at
    `);
    return rows.rows as import('@shared/schema').ChatChannel[];
  }

  async createChannel(name: string, description: string | null, createdBy: number): Promise<import('@shared/schema').ChatChannel> {
    const { chatChannels } = await import('@shared/schema');
    const [ch] = await db.insert(chatChannels).values({ name, description, createdBy, isDefault: false }).returning();
    return ch;
  }

  async updateChannel(id: number, data: { name?: string; description?: string | null }): Promise<void> {
    const { chatChannels } = await import('@shared/schema');
    await db.update(chatChannels).set(data).where(eq(chatChannels.id, id));
  }

  async deleteChannel(id: number): Promise<void> {
    const { chatChannels } = await import('@shared/schema');
    await db.delete(chatChannels).where(eq(chatChannels.id, id));
  }

  async getChannelMembers(channelId: number): Promise<Array<{ userId: number; userName: string }>> {
    const rows = await db.execute(sql`
      SELECT m.user_id, COALESCE(u.display_name, u.username) as user_name
      FROM channel_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = ${channelId}
      ORDER BY user_name
    `);
    return (rows.rows as any[]).map(r => ({ userId: r.user_id, userName: r.user_name }));
  }

  async addChannelMember(channelId: number, userId: number): Promise<void> {
    await db.execute(sql`
      INSERT INTO channel_members(channel_id, user_id) VALUES(${channelId}, ${userId})
      ON CONFLICT DO NOTHING
    `);
  }

  async removeChannelMember(channelId: number, userId: number): Promise<void> {
    await db.execute(sql`
      DELETE FROM channel_members WHERE channel_id = ${channelId} AND user_id = ${userId}
    `);
  }

  async canUserAccessChannel(channelId: number, userId: number, userRole: string): Promise<boolean> {
    const MANAGER_ROLES = ['admin', 'uretim_sefi', 'ofis_calisan'];
    if (MANAGER_ROLES.includes(userRole)) return true;
    const rows = await db.execute(sql`
      SELECT 1 FROM channel_members WHERE channel_id = ${channelId} AND user_id = ${userId} LIMIT 1
    `);
    return rows.rows.length > 0;
  }

  async getChannelUnreadCount(userId: number, channelId: number): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM chat_messages cm
      WHERE cm.is_deleted = false
        AND cm.channel_id = ${channelId}
        AND cm.sender_id != ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM message_reads mr
          WHERE mr.message_id = cm.id AND mr.user_id = ${userId}
        )
    `);
    return Number((result.rows[0] as any)?.count ?? 0);
  }

  /* ── Chat ────────────────────────────────────────────────────────────── */

  async getChatMessages(limit = 200, channelId: number | null = null): Promise<Array<ChatMessage & { senderName: string }>> {
    const channelFilter = channelId == null
      ? sql`cm.channel_id IS NULL`
      : sql`cm.channel_id = ${channelId}`;
    const rows = await db.execute(sql`
      SELECT cm.id, cm.sender_id, cm.content, cm.photo_url, cm.created_at,
             cm.is_deleted, cm.is_pinned, cm.pinned_by, cm.pinned_at, cm.channel_id,
             COALESCE(u.display_name, u.username) as sender_name
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.is_deleted = false AND ${channelFilter}
      ORDER BY cm.created_at
      LIMIT ${limit}
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id,
      senderId: r.sender_id,
      content: r.content,
      photoUrl: r.photo_url ?? null,
      createdAt: r.created_at,
      isDeleted: r.is_deleted,
      isPinned: r.is_pinned,
      pinnedBy: r.pinned_by ?? null,
      pinnedAt: r.pinned_at ?? null,
      channelId: r.channel_id ?? null,
      senderName: r.sender_name,
    }));
  }

  async createChatMessage(msg: InsertChatMessage & { channelId?: number | null }): Promise<ChatMessage> {
    const { channelId, ...rest } = msg as any;
    const values: any = { ...rest };
    if (channelId != null) values.channel_id = channelId;
    const result = await db.execute(sql`
      INSERT INTO chat_messages (sender_id, content, photo_url, channel_id)
      VALUES (${values.senderId}, ${values.content}, ${values.photoUrl ?? null}, ${channelId ?? null})
      RETURNING *
    `);
    const r = result.rows[0] as any;
    return {
      id: r.id,
      senderId: r.sender_id,
      content: r.content,
      photoUrl: r.photo_url ?? null,
      createdAt: r.created_at,
      isDeleted: r.is_deleted,
      isPinned: r.is_pinned,
      pinnedBy: r.pinned_by ?? null,
      pinnedAt: r.pinned_at ?? null,
    };
  }

  async deleteChatMessage(id: number): Promise<void> {
    await db.update(chatMessages).set({ isDeleted: true }).where(eq(chatMessages.id, id));
  }

  async pinChatMessage(id: number, pinnedBy: number, pin: boolean): Promise<void> {
    await db.update(chatMessages).set({
      isPinned: pin,
      pinnedBy: pin ? pinnedBy : null,
      pinnedAt: pin ? new Date() : null,
    }).where(eq(chatMessages.id, id));
  }

  async markMessagesRead(userId: number, messageIds: number[]): Promise<void> {
    if (messageIds.length === 0) return;
    for (const mid of messageIds) {
      await db
        .insert(messageReads)
        .values({ messageId: mid, userId })
        .onConflictDoNothing();
    }
  }

  async getUnreadCount(userId: number): Promise<number> {
    // Count messages NOT sent by user and NOT read by user
    const result = await db.execute(
      sql`
        SELECT COUNT(*) as count
        FROM chat_messages cm
        WHERE cm.is_deleted = false
          AND cm.sender_id != ${userId}
          AND NOT EXISTS (
            SELECT 1 FROM message_reads mr
            WHERE mr.message_id = cm.id AND mr.user_id = ${userId}
          )
      `
    );
    return Number((result.rows[0] as any).count) || 0;
  }

  // Blocked IPs
  async isIpBlocked(ip: string): Promise<boolean> {
    const [row] = await db.select().from(blockedIps).where(eq(blockedIps.ip, ip));
    return !!row;
  }

  async addBlockedIp(ip: string, reason = "Too many failed login attempts"): Promise<void> {
    await db
      .insert(blockedIps)
      .values({ ip, reason })
      .onConflictDoNothing();
  }

  async getBlockedIps(): Promise<BlockedIp[]> {
    return db.select().from(blockedIps).orderBy(desc(blockedIps.blockedAt));
  }

  async removeBlockedIp(ip: string): Promise<void> {
    await db.delete(blockedIps).where(eq(blockedIps.ip, ip));
  }

  async getRecordEditLogs(recordId: number): Promise<Array<{ id: number; recordId: number; editedBy: number; editedAt: Date; note: string | null; editorName: string }>> {
    const rows = await db.execute(
      sql`SELECT rel.id, rel.record_id, rel.edited_by, rel.edited_at, rel.note,
               COALESCE(u.display_name, u.username, rel.edited_by::text) as editor_name
          FROM record_edit_logs rel
          LEFT JOIN users u ON u.id = rel.edited_by
          WHERE rel.record_id = ${recordId}
          ORDER BY rel.edited_at DESC`
    );
    return (rows.rows as any[]).map(r => ({
      id: r.id,
      recordId: r.record_id,
      editedBy: r.edited_by,
      editedAt: new Date(r.edited_at),
      note: r.note,
      editorName: r.editor_name,
    }));
  }

  async createRecordEditLog(recordId: number, editedBy: number, note?: string): Promise<void> {
    await db.execute(
      sql`INSERT INTO record_edit_logs (record_id, edited_by, note) VALUES (${recordId}, ${editedBy}, ${note ?? null})`
    );
  }

  /* ── Direct Messages ─────────────────────────────────────────────────── */

  async getDMs(userAId: number, userBId: number) {
    const result = await db.execute(sql`
      SELECT dm.id, dm.sender_id, dm.receiver_id, dm.content, dm.photo_url, dm.created_at, dm.is_read,
             COALESCE(u.display_name, u.username) as sender_name
      FROM direct_messages dm
      JOIN users u ON u.id = dm.sender_id
      WHERE (dm.sender_id = ${userAId} AND dm.receiver_id = ${userBId})
         OR (dm.sender_id = ${userBId} AND dm.receiver_id = ${userAId})
      ORDER BY dm.created_at ASC
      LIMIT 200
    `);
    return (result.rows as any[]).map(r => ({
      id: Number(r.id),
      senderId: Number(r.sender_id),
      receiverId: Number(r.receiver_id),
      content: r.content ?? '',
      photoUrl: r.photo_url ?? null,
      createdAt: r.created_at,
      isRead: r.is_read,
      senderName: r.sender_name,
    }));
  }

  async sendDM(senderId: number, receiverId: number, content: string, photoUrl?: string | null) {
    const result = await db.execute(sql`
      INSERT INTO direct_messages (sender_id, receiver_id, content, photo_url)
      VALUES (${senderId}, ${receiverId}, ${content}, ${photoUrl ?? null})
      RETURNING id, sender_id, receiver_id, content, photo_url, created_at, is_read
    `);
    const r = result.rows[0] as any;
    return {
      id: Number(r.id),
      senderId: Number(r.sender_id),
      receiverId: Number(r.receiver_id),
      content: r.content ?? '',
      photoUrl: r.photo_url ?? null,
      createdAt: r.created_at,
      isRead: r.is_read,
    };
  }

  async markDMsRead(receiverId: number, senderId: number): Promise<void> {
    await db.execute(sql`
      UPDATE direct_messages
      SET is_read = true
      WHERE receiver_id = ${receiverId} AND sender_id = ${senderId} AND is_read = false
    `);
  }

  async getDMUnreadCount(userId: number): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM direct_messages
      WHERE receiver_id = ${userId} AND is_read = false
    `);
    return Number((result.rows[0] as any).count) || 0;
  }

  async hasDMHistory(userAId: number, userBId: number): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT 1 FROM direct_messages
      WHERE (sender_id = ${userAId} AND receiver_id = ${userBId})
         OR (sender_id = ${userBId} AND receiver_id = ${userAId})
      LIMIT 1
    `);
    return result.rows.length > 0;
  }

  async deleteDMConversation(userAId: number, userBId: number): Promise<void> {
    await db.execute(sql`
      DELETE FROM direct_messages
      WHERE (sender_id = ${userAId} AND receiver_id = ${userBId})
         OR (sender_id = ${userBId} AND receiver_id = ${userAId})
    `);
  }

  async runRawSQL(sqlText: string): Promise<void> {
    await db.execute(sql.raw(sqlText));
  }

  async getDMConversations(userId: number) {
    const result = await db.execute(sql`
      WITH conv_users AS (
        SELECT DISTINCT
          CASE WHEN sender_id = ${userId} THEN receiver_id ELSE sender_id END as other_user_id
        FROM direct_messages
        WHERE sender_id = ${userId} OR receiver_id = ${userId}
      ),
      last_msgs AS (
        SELECT
          CASE WHEN sender_id = ${userId} THEN receiver_id ELSE sender_id END as other_user_id,
          content,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN sender_id = ${userId} THEN receiver_id ELSE sender_id END
            ORDER BY created_at DESC
          ) as rn
        FROM direct_messages
        WHERE sender_id = ${userId} OR receiver_id = ${userId}
      ),
      unread_counts AS (
        SELECT sender_id as other_user_id, COUNT(*) as unread_count
        FROM direct_messages
        WHERE receiver_id = ${userId} AND is_read = false
        GROUP BY sender_id
      )
      SELECT
        cu.other_user_id,
        COALESCE(u.display_name, u.username) as user_name,
        lm.content as last_message,
        lm.created_at as last_message_at,
        COALESCE(uc.unread_count, 0) as unread_count
      FROM conv_users cu
      JOIN users u ON u.id = cu.other_user_id
      LEFT JOIN last_msgs lm ON lm.other_user_id = cu.other_user_id AND lm.rn = 1
      LEFT JOIN unread_counts uc ON uc.other_user_id = cu.other_user_id
      ORDER BY lm.created_at DESC NULLS LAST
    `);
    return (result.rows as any[]).map(r => ({
      userId: Number(r.other_user_id),
      userName: r.user_name,
      lastMessage: r.last_message || '',
      lastMessageAt: r.last_message_at,
      unreadCount: Number(r.unread_count) || 0,
    }));
  }

  /* ─── Stok Kategoriler ─────────────────────────────────────────────────── */
  async getStokKategoriler(): Promise<StokKategori[]> {
    return db.select().from(stokKategoriler).orderBy(stokKategoriler.sira, stokKategoriler.ad);
  }

  async createStokKategori(data: InsertStokKategori): Promise<StokKategori> {
    const maxSira = await db.select({ max: sql<number>`COALESCE(MAX(sira), 0)` }).from(stokKategoriler);
    const [created] = await db.insert(stokKategoriler).values({ ...data, sira: (maxSira[0]?.max ?? 0) + 1 }).returning();
    return created;
  }

  async deleteStokKategori(id: number): Promise<void> {
    await db.delete(stokKategoriler).where(eq(stokKategoriler.id, id));
  }

  /* ─── Stok Alt Türler ──────────────────────────────────────────────────── */
  async getStokAltTurler(kategoriId?: number): Promise<StokAltTur[]> {
    let query = db.select().from(stokAltTurler).$dynamic();
    if (kategoriId) query = query.where(eq(stokAltTurler.kategoriId, kategoriId));
    return query.orderBy(stokAltTurler.sira, stokAltTurler.ad);
  }

  async createStokAltTur(data: InsertStokAltTur): Promise<StokAltTur> {
    const maxSira = await db.select({ max: sql<number>`COALESCE(MAX(sira), 0)` })
      .from(stokAltTurler).where(eq(stokAltTurler.kategoriId, data.kategoriId));
    const [created] = await db.insert(stokAltTurler).values({ ...data, sira: (maxSira[0]?.max ?? 0) + 1 }).returning();
    return created;
  }

  async updateStokAltTur(id: number, data: UpdateStokAltTur): Promise<StokAltTur> {
    const [updated] = await db.update(stokAltTurler).set(data).where(eq(stokAltTurler.id, id)).returning();
    return updated;
  }

  async deleteStokAltTur(id: number): Promise<void> {
    await db.delete(stokAltTurler).where(eq(stokAltTurler.id, id));
  }

  async getStokItems(filters?: { tur?: string; stokDurumu?: string }): Promise<StokItem[]> {
    let query = db.select().from(stokItems).$dynamic();
    const conditions = [];
    if (filters?.tur) conditions.push(eq(stokItems.tur, filters.tur));
    if (filters?.stokDurumu) conditions.push(eq(stokItems.stokDurumu, filters.stokDurumu));
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query.orderBy(desc(stokItems.createdAt));
  }

  async getStokItem(id: number): Promise<StokItem | undefined> {
    const [item] = await db.select().from(stokItems).where(eq(stokItems.id, id));
    return item;
  }

  async getStokItemsByAltTur(altTur: string): Promise<StokItem[]> {
    return db.select().from(stokItems)
      .where(eq(stokItems.altTur, altTur))
      .orderBy(stokItems.girisTarihi);
  }

  async createStokItem(item: InsertStokItem): Promise<StokItem> {
    const [created] = await db.insert(stokItems).values(item as any).returning();
    return created;
  }

  async updateStokItem(id: number, item: Partial<InsertStokItem>): Promise<StokItem> {
    const [updated] = await db.update(stokItems).set(item as any).where(eq(stokItems.id, id)).returning();
    return updated;
  }

  async deleteStokItem(id: number): Promise<void> {
    await db.delete(stokItems).where(eq(stokItems.id, id));
  }

  async adjustStokRezerve(stokItemId: number, delta: number): Promise<void> {
    await db.execute(
      sql`UPDATE stok_items SET rezerve_miktar = GREATEST(0, rezerve_miktar + ${delta}) WHERE id = ${stokItemId}`
    );
  }

  async deductStokKatlama(stokItemId: number, amount: number): Promise<void> {
    // miktar düşümü ASLA rezerve_miktar'dan fazla olamaz:
    // min(amount, rezerve_miktar) kadar miktar düşer, rezerve_miktar ise tam amount kadar düşer.
    // Bu sayede "serbest stok" hiçbir zaman negatife düşmez ve tüm stok tükenmez.
    await db.execute(
      sql`UPDATE stok_items
          SET
            miktar        = GREATEST(0, miktar - LEAST(${amount}, rezerve_miktar)),
            rezerve_miktar = GREATEST(0, rezerve_miktar - ${amount})
          WHERE id = ${stokItemId}`
    );
  }

  async getPrevKatlamaQty(recordId: number, orderItemId: number | null | undefined, excludeLogId: number): Promise<number> {
    let r: any;
    if (orderItemId != null) {
      r = await db.execute(sql`
        SELECT COALESCE(SUM(quantity), 0)::int AS total
        FROM production_logs
        WHERE phase = 'katlama'
          AND record_id = ${recordId}
          AND order_item_id = ${orderItemId}
          AND id != ${excludeLogId}
      `);
    } else {
      r = await db.execute(sql`
        SELECT COALESCE(SUM(quantity), 0)::int AS total
        FROM production_logs
        WHERE phase = 'katlama'
          AND record_id = ${recordId}
          AND order_item_id IS NULL
          AND id != ${excludeLogId}
      `);
    }
    return Number((r as any).rows[0]?.total ?? 0);
  }

  async getPrevPhaseQty(recordId: number, phase: string, orderItemId: number | null | undefined, excludeLogId: number): Promise<number> {
    let r: any;
    if (orderItemId != null) {
      r = await db.execute(sql`
        SELECT COALESCE(SUM(quantity), 0)::int AS total
        FROM production_logs
        WHERE phase = ${phase}
          AND record_id = ${recordId}
          AND order_item_id = ${orderItemId}
          AND id != ${excludeLogId}
      `);
    } else {
      r = await db.execute(sql`
        SELECT COALESCE(SUM(quantity), 0)::int AS total
        FROM production_logs
        WHERE phase = ${phase}
          AND record_id = ${recordId}
          AND id != ${excludeLogId}
      `);
    }
    return Number((r as any).rows[0]?.total ?? 0);
  }

  async getOrderItemHammadde(orderItemId: number): Promise<OrderItemHammadde[]> {
    return await db.select().from(orderItemHammadde).where(eq(orderItemHammadde.orderItemId, orderItemId));
  }

  async getOrderItemsHammaddeByRecord(recordId: number): Promise<OrderItemHammadde[]> {
    const items = await db.select().from(orderItems).where(eq(orderItems.recordId, recordId));
    if (items.length === 0) return [];
    const itemIds = items.map(i => i.id);
    return await db.select().from(orderItemHammadde).where(inArray(orderItemHammadde.orderItemId, itemIds));
  }

  async createOrderItemHammadde(entry: InsertOrderItemHammadde): Promise<OrderItemHammadde> {
    const [created] = await db.insert(orderItemHammadde).values(entry as any).returning();
    return created;
  }

  async deleteOrderItemHammadde(id: number): Promise<void> {
    await db.delete(orderItemHammadde).where(eq(orderItemHammadde.id, id));
  }

  async deleteOrderItemHammaddeByItemId(orderItemId: number): Promise<void> {
    await db.delete(orderItemHammadde).where(eq(orderItemHammadde.orderItemId, orderItemId));
  }

  async getStokReservations(stokItemId: number): Promise<{
    recordId: number; recordTitle: string; recordStatus: string;
    orderItemId: number; orderItemName: string;
    kullanim: string; totalQuantity: number; totalReserved: number;
    source: 'multi' | 'legacy';
  }[]> {
    const results: {
      recordId: number; recordTitle: string; recordStatus: string;
      orderItemId: number; orderItemName: string;
      kullanim: string; totalQuantity: number; totalReserved: number;
      source: 'multi' | 'legacy';
    }[] = [];

    // --- Multi-hammadde table ---
    const multiRows = await db
      .select({
        hammaddeId: orderItemHammadde.id,
        kullanim: orderItemHammadde.kullanim,
        orderItemId: orderItems.id,
        orderItemName: orderItems.name,
        recordId: productionRecords.id,
        recordTitle: productionRecords.title,
        recordStatus: productionRecords.status,
        totalQuantity: productionRecords.totalQuantity,
      })
      .from(orderItemHammadde)
      .innerJoin(orderItems, eq(orderItems.id, orderItemHammadde.orderItemId))
      .innerJoin(productionRecords, eq(productionRecords.id, orderItems.recordId))
      .where(eq(orderItemHammadde.stokItemId, stokItemId));

    for (const row of multiRows) {
      const kullanim = String(row.kullanim ?? '0');
      const totalReserved = Number(kullanim) * (row.totalQuantity ?? 0);
      if (totalReserved > 0) {
        results.push({
          recordId: row.recordId,
          recordTitle: row.recordTitle,
          recordStatus: row.recordStatus,
          orderItemId: row.orderItemId,
          orderItemName: row.orderItemName,
          kullanim,
          totalQuantity: row.totalQuantity ?? 0,
          totalReserved,
          source: 'multi',
        });
      }
    }

    // --- Legacy single-field (order_items.stok_item_id) ---
    const legacyRows = await db
      .select({
        orderItemId: orderItems.id,
        orderItemName: orderItems.name,
        hammadeKullanim: orderItems.hammadeKullanim,
        recordId: productionRecords.id,
        recordTitle: productionRecords.title,
        recordStatus: productionRecords.status,
        totalQuantity: productionRecords.totalQuantity,
      })
      .from(orderItems)
      .innerJoin(productionRecords, eq(productionRecords.id, orderItems.recordId))
      .where(eq(orderItems.stokItemId, stokItemId));

    for (const row of legacyRows) {
      // Skip if already covered by multi-hammadde
      const alreadyCovered = results.some(r => r.orderItemId === row.orderItemId);
      if (alreadyCovered) continue;
      const kullanim = String(row.hammadeKullanim ?? '0');
      const totalReserved = Number(kullanim) * (row.totalQuantity ?? 0);
      if (totalReserved > 0) {
        results.push({
          recordId: row.recordId,
          recordTitle: row.recordTitle,
          recordStatus: row.recordStatus,
          orderItemId: row.orderItemId,
          orderItemName: row.orderItemName,
          kullanim,
          totalQuantity: row.totalQuantity ?? 0,
          totalReserved,
          source: 'legacy',
        });
      }
    }

    // --- Reçete (BOM) rezervasyonlar ---
    const receteRows = await db.execute(sql`
      SELECT
        rr.id              AS rr_id,
        rr.recete_item_id,
        rr.rezerved_miktar,
        ri.record_id,
        ri.stok_alt_tur    AS order_item_name,
        ri.miktar          AS recete_miktar,
        pr.title           AS record_title,
        pr.status          AS record_status,
        pr.total_quantity
      FROM recete_rezervasyon rr
      INNER JOIN recete_items ri ON ri.id = rr.recete_item_id
      INNER JOIN production_records pr ON pr.id = ri.record_id
      WHERE rr.stok_item_id = ${stokItemId}
    `);
    const receteRowsArr = (receteRows as any).rows ?? [];
    for (const row of receteRowsArr) {
      const totalReserved = Number(row.rezerved_miktar);
      if (totalReserved <= 0) continue;
      results.push({
        recordId: row.record_id,
        recordTitle: row.record_title,
        recordStatus: row.record_status,
        orderItemId: row.recete_item_id,
        orderItemName: row.order_item_name ?? 'Bilinmiyor',
        kullanim: String(row.recete_miktar),
        totalQuantity: row.total_quantity ?? 1,
        totalReserved,
        source: 'recete' as any,
      });
    }

    return results.sort((a, b) => b.totalReserved - a.totalReserved);
  }

  async getStokTuketimGecmisi(stokItemId: number): Promise<{
    logId: number; completedAt: Date;
    unitsProcessed: number; kullanim: string; consumed: number;
    orderItemId: number; orderItemName: string;
    recordId: number; recordTitle: string; recordStatus: string;
  }[]> {
    const result = await db.execute(sql`
      SELECT
        pl.id                                           AS log_id,
        pl.completed_at,
        pl.quantity                                     AS units_processed,
        oih.kullanim::text                              AS kullanim,
        CAST(oih.kullanim AS FLOAT) * pl.quantity       AS consumed,
        oi.id                                           AS order_item_id,
        oi.name                                         AS order_item_name,
        pr.id                                           AS record_id,
        pr.title                                        AS record_title,
        pr.status                                       AS record_status
      FROM production_logs pl
      INNER JOIN production_records pr ON pr.id = pl.record_id
      INNER JOIN order_items oi
        ON oi.record_id = pl.record_id
       AND (pl.order_item_id IS NULL OR pl.order_item_id = oi.id)
      INNER JOIN order_item_hammadde oih
        ON oih.order_item_id = oi.id
       AND oih.stok_item_id = ${stokItemId}
      WHERE pl.phase = 'katlama'
      ORDER BY pl.completed_at DESC
    `);
    return (result as any).rows.map((r: any) => ({
      logId: r.log_id,
      completedAt: r.completed_at,
      unitsProcessed: Number(r.units_processed),
      kullanim: String(r.kullanim ?? '0'),
      consumed: Number(r.consumed ?? 0),
      orderItemId: r.order_item_id,
      orderItemName: r.order_item_name,
      recordId: r.record_id,
      recordTitle: r.record_title,
      recordStatus: r.record_status,
    }));
  }

  /* ─── Gelen Siparişler ──────────────────────────────────────────────────── */
  async getGelenSiparisler(): Promise<ProductionRecord[]> {
    return await db.select().from(productionRecords).where(eq(productionRecords.status, 'gelen')).orderBy(desc(productionRecords.createdAt));
  }

  async onaylaGelenSiparis(id: number): Promise<ProductionRecord> {
    const [updated] = await db.update(productionRecords).set({ status: 'pending', updatedAt: new Date() }).where(eq(productionRecords.id, id)).returning();
    return updated;
  }

  async reviseGelenSiparis(id: number): Promise<ProductionRecord> {
    const now = new Date();
    const [updated] = await db.update(productionRecords).set({ revisedAt: now, updatedAt: now }).where(eq(productionRecords.id, id)).returning();
    return updated;
  }

  async touchGelenIfRevisable(id: number): Promise<void> {
    try {
      const now = new Date();
      await db.update(productionRecords)
        .set({ revisedAt: now, updatedAt: now })
        .where(and(eq(productionRecords.id, id), eq(productionRecords.status, 'gelen')));
    } catch (_) { /* best-effort */ }
  }

  /* ─── Reçete (BOM) ─────────────────────────────────────────────────────── */
  async getReceteItems(recordId: number): Promise<ReceteItem[]> {
    return await db.select().from(receteItems).where(eq(receteItems.recordId, recordId)).orderBy(receteItems.id);
  }

  async createReceteItem(item: InsertReceteItem): Promise<ReceteItem> {
    const [created] = await db.insert(receteItems).values(item).returning();
    return created;
  }

  async deleteReceteItem(id: number): Promise<void> {
    await db.delete(receteItems).where(eq(receteItems.id, id));
  }

  async deleteReceteItemsByRecord(recordId: number): Promise<void> {
    await db.delete(receteItems).where(eq(receteItems.recordId, recordId));
  }

  async createReceteRezervasyonu(receteItemId: number, stokItemId: number, miktar: number): Promise<number> {
    const [row] = await db.insert(receteRezervasyonlar).values({
      receteItemId,
      stokItemId,
      rezervedMiktar: String(miktar),
      dusenMiktar: '0',
    }).returning({ id: receteRezervasyonlar.id });
    return row?.id ?? 0;
  }

  async updateReceteRezervasyonTasindi(id: number, data: { tasindi: boolean; tasindiBy?: number; tasindiMiktar?: number; tasindiPhoto?: string | null; tasindiAciklama?: string | null }): Promise<void> {
    await db.update(receteRezervasyonlar)
      .set({
        tasindi: data.tasindi,
        tasindiAt: data.tasindi ? new Date() : null,
        tasindiBy: data.tasindi ? (data.tasindiBy ?? null) : null,
        tasindiMiktar: data.tasindiMiktar != null ? String(data.tasindiMiktar) : null,
        tasindiPhoto: data.tasindiPhoto ?? null,
        tasindiAciklama: data.tasindiAciklama ?? null,
      })
      .where(eq(receteRezervasyonlar.id, id));
  }

  async getDepoHareket(id: number): Promise<DepoHareketi | null> {
    const [row] = await db.select().from(depoHareketleri).where(eq(depoHareketleri.id, id));
    return row ?? null;
  }

  async createDepoHareketi(data: { stokItemId: number; stokAdi: string; lot: string | null; birim: string; rezerveMiktar: number; kaynak: string; kaynakId: number; siparisId: number; siparisTitle: string; siparisLot: string | null }): Promise<number> {
    const [row] = await db.insert(depoHareketleri).values({
      stokItemId: data.stokItemId,
      stokAdi: data.stokAdi,
      lot: data.lot ?? null,
      birim: data.birim,
      rezerveMiktar: String(data.rezerveMiktar),
      kaynak: data.kaynak,
      kaynakId: data.kaynakId,
      siparisId: data.siparisId,
      siparisTitle: data.siparisTitle,
      siparisLot: data.siparisLot ?? null,
    }).onConflictDoNothing().returning({ id: depoHareketleri.id });
    return row?.id ?? 0;
  }

  async createDepoHareketiFazlalik(data: { stokItemId: number; stokAdi: string; lot: string | null; birim: string; miktar: number; siparisId: number; siparisTitle: string; siparisLot: string | null; kaynakId: number }): Promise<number> {
    const [row] = await db.insert(depoHareketleri).values({
      stokItemId: data.stokItemId,
      stokAdi: data.stokAdi,
      lot: data.lot ?? null,
      birim: data.birim,
      rezerveMiktar: String(data.miktar),
      kaynak: 'fazlalik',
      kaynakId: data.kaynakId,
      siparisId: data.siparisId,
      siparisTitle: data.siparisTitle,
      siparisLot: data.siparisLot ?? null,
      tasindi: true,
      tasindiAt: new Date(),
      tasindiMiktar: String(data.miktar),
    }).returning({ id: depoHareketleri.id });
    return row?.id ?? 0;
  }

  async getFazlalikByStokItemIds(stokItemIds: number[]): Promise<DepoHareketi[]> {
    if (stokItemIds.length === 0) return [];
    return db
      .select()
      .from(depoHareketleri)
      .where(
        and(
          inArray(depoHareketleri.stokItemId, stokItemIds),
          sql`${depoHareketleri.tasindiMiktar}::numeric > ${depoHareketleri.rezerveMiktar}::numeric`
        )
      );
  }

  async depoyaDonDepoHareketi(id: number): Promise<void> {
    const row = await this.getDepoHareket(id);
    if (!row) return;
    const rezerved = Number(row.rezerveMiktar);
    const newTasindi = rezerved;
    await db.update(depoHareketleri)
      .set({
        tasindiMiktar: newTasindi > 0 ? String(newTasindi) : null,
        tasindi: newTasindi > 0 ? true : false,
        tasindiAt: newTasindi > 0 ? (row.tasindiAt ?? new Date()) : null,
      })
      .where(eq(depoHareketleri.id, id));
  }

  async siparisAtaDepoHareketi(id: number, miktar: number, hedefSiparisId: number, hedefSiparisTitle: string, hedefSiparisLot: string | null): Promise<number> {
    const row = await this.getDepoHareket(id);
    if (!row) throw new Error('Kayıt bulunamadı');
    const mevcut = Number(row.tasindiMiktar ?? 0);
    const rezerved = Number(row.rezerveMiktar);
    const surplus = mevcut - rezerved;
    if (miktar > surplus + 0.001) throw new Error('Fazlalık miktardan fazla atanamaz');
    const newTasindi = mevcut - miktar;
    await db.update(depoHareketleri)
      .set({
        tasindiMiktar: newTasindi > 0 ? String(newTasindi) : null,
        tasindi: newTasindi >= rezerved,
      })
      .where(eq(depoHareketleri.id, id));
    const newId = await this.createDepoHareketiFazlalik({
      stokItemId: row.stokItemId,
      stokAdi: row.stokAdi,
      lot: row.lot,
      birim: row.birim,
      miktar,
      siparisId: hedefSiparisId,
      siparisTitle: hedefSiparisTitle,
      siparisLot: hedefSiparisLot,
      kaynakId: id,
    });
    return newId;
  }

  async getDepoHareketleriByRecord(recordId: number): Promise<Array<{ id: number; stokItemId: number; stokAdi: string; lot: string | null; birim: string; rezerveMiktar: number; kaynak: string; tasindi: boolean; tasindiMiktar: number | null; receteItemId: number | null }>> {
    const result = await db.execute(sql`
      SELECT
        dh.id,
        dh.stok_item_id    AS "stokItemId",
        dh.stok_adi        AS "stokAdi",
        dh.lot,
        dh.birim,
        dh.rezerve_miktar  AS "rezerveMiktar",
        dh.kaynak,
        dh.tasindi,
        dh.tasindi_miktar  AS "tasindiMiktar",
        CASE WHEN dh.kaynak = 'rr' THEN rr.recete_item_id ELSE NULL END AS "receteItemId"
      FROM depo_hareketleri dh
      LEFT JOIN recete_rezervasyon rr ON dh.kaynak = 'rr' AND dh.kaynak_id = rr.id
      WHERE dh.siparis_id = ${recordId}
      ORDER BY dh.id
    `);
    return ((result as any).rows as any[]).map(r => ({
      id: Number(r.id),
      stokItemId: Number(r.stokItemId),
      stokAdi: r.stokAdi as string,
      lot: r.lot as string | null,
      birim: r.birim as string,
      rezerveMiktar: Number(r.rezerveMiktar),
      kaynak: r.kaynak as string,
      tasindi: r.tasindi === true || r.tasindi === 't',
      tasindiMiktar: r.tasindiMiktar != null ? Number(r.tasindiMiktar) : null,
      receteItemId: r.receteItemId != null ? Number(r.receteItemId) : null,
    }));
  }

  async getDepoHareketleriList(): Promise<Array<DepoHareketi & { stokMiktar: number | null }>> {
    const rows = await db
      .select({
        id: depoHareketleri.id,
        stokItemId: depoHareketleri.stokItemId,
        stokAdi: depoHareketleri.stokAdi,
        lot: depoHareketleri.lot,
        birim: depoHareketleri.birim,
        rezerveMiktar: depoHareketleri.rezerveMiktar,
        kaynak: depoHareketleri.kaynak,
        kaynakId: depoHareketleri.kaynakId,
        siparisId: depoHareketleri.siparisId,
        siparisTitle: depoHareketleri.siparisTitle,
        siparisLot: depoHareketleri.siparisLot,
        tasindi: depoHareketleri.tasindi,
        tasindiAt: depoHareketleri.tasindiAt,
        tasindiBy: depoHareketleri.tasindiBy,
        tasindiByUsername: depoHareketleri.tasindiByUsername,
        tasindiPhoto: depoHareketleri.tasindiPhoto,
        tasindiAciklama: depoHareketleri.tasindiAciklama,
        tasindiMiktar: depoHareketleri.tasindiMiktar,
        barkodDogrulandi: depoHareketleri.barkodDogrulandi,
        barkodKaynak: depoHareketleri.barkodKaynak,
        createdAt: depoHareketleri.createdAt,
        stokMiktar: stokItems.miktar,
      })
      .from(depoHareketleri)
      .leftJoin(stokItems, eq(stokItems.id, depoHareketleri.stokItemId))
      .orderBy(asc(depoHareketleri.tasindi), desc(depoHareketleri.createdAt));
    return rows.map(r => ({
      ...r,
      stokMiktar: r.stokMiktar != null ? Number(r.stokMiktar) : null,
    }));
  }

  async updateDepoHareket(id: number, data: { tasindi: boolean; tasindiAt?: Date | null; tasindiBy?: number | null; tasindiByUsername?: string | null; tasindiMiktar?: number | null; tasindiPhoto?: string | null; tasindiAciklama?: string | null; barkodDogrulandi?: boolean | null; barkodKaynak?: string | null }): Promise<void> {
    const baseSet = {
      tasindi: data.tasindi,
      tasindiAt: data.tasindiAt !== undefined ? data.tasindiAt : (data.tasindi ? new Date() : null),
      tasindiBy: data.tasindiBy ?? null,
      tasindiByUsername: data.tasindiByUsername ?? null,
      tasindiMiktar: data.tasindiMiktar != null ? String(data.tasindiMiktar) : null,
      tasindiPhoto: data.tasindiPhoto ?? null,
      tasindiAciklama: data.tasindiAciklama ?? null,
    };
    const setObj = data.barkodDogrulandi !== undefined
      ? { ...baseSet, barkodDogrulandi: !!data.barkodDogrulandi, barkodKaynak: data.barkodKaynak ?? null }
      : baseSet;
    await db.update(depoHareketleri).set(setObj).where(eq(depoHareketleri.id, id));
  }

  async getAppSetting(key: string): Promise<string | null> {
    const { appSettings } = await import('@shared/schema');
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row?.value ?? null;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    const { appSettings } = await import('@shared/schema');
    await db.insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }

  async patchDepoHareketFoto(id: number, tasindiPhoto: string | null, tasindiAciklama: string | null): Promise<void> {
    await db.update(depoHareketleri)
      .set({ tasindiPhoto, tasindiAciklama })
      .where(eq(depoHareketleri.id, id));
  }

  async getDepoHareketleriDogrulamaRaporu(filters: { startDate?: Date; endDate?: Date; userId?: number }): Promise<DepoHareketi[]> {
    const conds = [eq(depoHareketleri.tasindi, true)];
    if (filters.startDate) conds.push(gte(depoHareketleri.tasindiAt, filters.startDate));
    if (filters.endDate) conds.push(lte(depoHareketleri.tasindiAt, filters.endDate));
    if (filters.userId != null) conds.push(eq(depoHareketleri.tasindiBy, filters.userId));
    const rows = await db
      .select()
      .from(depoHareketleri)
      .where(and(...conds))
      .orderBy(desc(depoHareketleri.tasindiAt));
    return rows;
  }

  async deleteDepoHareketByKaynak(kaynak: string, kaynakId: number): Promise<void> {
    await db.delete(depoHareketleri)
      .where(and(eq(depoHareketleri.kaynak, kaynak), eq(depoHareketleri.kaynakId, kaynakId)));
  }

  async deleteDepoHareketBySiparis(siparisId: number): Promise<void> {
    await db.delete(depoHareketleri).where(eq(depoHareketleri.siparisId, siparisId));
  }

  async createStokAnomali(data: InsertStokAnomali & { reportedBy: number; reportedByUsername: string; ekStokDusumler?: Array<{ stokItemId: number; lot: string | null; urunAdi: string; miktar: number }>; autoDusuldu?: boolean; bekleyenMiktar?: number; bekleyenUrunAdi?: string | null; bekleyenBirim?: string | null }): Promise<StokAnomali> {
    const [row] = await db.insert(stokAnomalileri).values({
      depoHareketId: data.depoHareketId,
      tur: data.tur,
      beklenenMiktar: String(data.beklenenMiktar),
      gercekMiktar: String(data.gercekMiktar),
      fark: String(data.fark),
      birim: data.birim,
      aciklama: data.aciklama,
      fotograf: data.fotograf ?? null,
      reportedBy: data.reportedBy,
      reportedByUsername: data.reportedByUsername,
      ekStokDusumler: data.ekStokDusumler ?? [],
      autoDusuldu: data.autoDusuldu ?? false,
      bekleyenMiktar: data.bekleyenMiktar != null ? String(data.bekleyenMiktar) : '0',
      bekleyenUrunAdi: data.bekleyenUrunAdi ?? null,
      bekleyenBirim: data.bekleyenBirim ?? null,
    }).returning();
    return row;
  }

  async getStokItemsByUrunAdi(urunAdi: string, birim: string, excludeId?: number): Promise<StokItem[]> {
    const conditions = [eq(stokItems.urunAdi, urunAdi), eq(stokItems.birim, birim as any)];
    if (excludeId) conditions.push(sql`${stokItems.id} != ${excludeId}` as any);
    return db.select().from(stokItems).where(and(...conditions)).orderBy(stokItems.girisTarihi);
  }

  async decrementStokItemMiktar(stokItemId: number, amount: number): Promise<void> {
    await db.execute(
      sql`UPDATE stok_items
          SET miktar = GREATEST(0, miktar - ${amount})
          WHERE id = ${stokItemId}`
    );
  }

  async getStokAnomalileri(): Promise<Array<StokAnomali & { stokAdi: string; lot: string | null; siparisId: number; siparisTitle: string }>> {
    const rows = await db
      .select({
        id: stokAnomalileri.id,
        depoHareketId: stokAnomalileri.depoHareketId,
        tur: stokAnomalileri.tur,
        beklenenMiktar: stokAnomalileri.beklenenMiktar,
        gercekMiktar: stokAnomalileri.gercekMiktar,
        fark: stokAnomalileri.fark,
        birim: stokAnomalileri.birim,
        aciklama: stokAnomalileri.aciklama,
        fotograf: stokAnomalileri.fotograf,
        reportedBy: stokAnomalileri.reportedBy,
        reportedByUsername: stokAnomalileri.reportedByUsername,
        createdAt: stokAnomalileri.createdAt,
        resolved: stokAnomalileri.resolved,
        resolvedBy: stokAnomalileri.resolvedBy,
        resolvedByUsername: stokAnomalileri.resolvedByUsername,
        resolvedAt: stokAnomalileri.resolvedAt,
        resolutionNotes: stokAnomalileri.resolutionNotes,
        ekStokDusumler: stokAnomalileri.ekStokDusumler,
        autoDusuldu: stokAnomalileri.autoDusuldu,
        bekleyenMiktar: stokAnomalileri.bekleyenMiktar,
        bekleyenUrunAdi: stokAnomalileri.bekleyenUrunAdi,
        bekleyenBirim: stokAnomalileri.bekleyenBirim,
        stokAdi: depoHareketleri.stokAdi,
        lot: depoHareketleri.lot,
        siparisId: depoHareketleri.siparisId,
        siparisTitle: depoHareketleri.siparisTitle,
      })
      .from(stokAnomalileri)
      .leftJoin(depoHareketleri, eq(stokAnomalileri.depoHareketId, depoHareketleri.id))
      .orderBy(asc(stokAnomalileri.resolved), desc(stokAnomalileri.createdAt));
    return rows.map(r => ({
      ...r,
      stokAdi: r.stokAdi ?? '',
      lot: r.lot ?? null,
      siparisId: r.siparisId ?? 0,
      siparisTitle: r.siparisTitle ?? '',
    })) as any;
  }

  async getStokAnomalileriByDepoHareket(depoHareketId: number): Promise<StokAnomali[]> {
    return await db.select().from(stokAnomalileri)
      .where(eq(stokAnomalileri.depoHareketId, depoHareketId))
      .orderBy(desc(stokAnomalileri.createdAt));
  }

  async resolveStokAnomali(id: number, resolvedBy: number, resolvedByUsername: string, notes: string | null): Promise<void> {
    await db.update(stokAnomalileri)
      .set({
        resolved: true,
        resolvedBy,
        resolvedByUsername,
        resolvedAt: new Date(),
        resolutionNotes: notes,
      })
      .where(eq(stokAnomalileri.id, id));
  }

  async deleteStokAnomali(id: number): Promise<void> {
    await db.delete(stokAnomalileri).where(eq(stokAnomalileri.id, id));
  }

}

export const storage = new DatabaseStorage();
