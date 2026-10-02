import { pgTable, text, serial, integer, timestamp, jsonb, date, boolean, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("aday"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at"),
  lastLogoutAt: timestamp("last_logout_at"),
  sevkiyatYetkisi: boolean("sevkiyat_yetkisi").notNull().default(false),
  stokYetkisi: boolean("stok_yetkisi").notNull().default(false),
});

export const ROLES = {
  admin: 'Yönetici',
  uretim_sefi: 'Üretim Şefi',
  uretim_calisan: 'Üretim Çalışanı',
  ofis_calisan: 'Ofis Çalışanı',
  aday: 'Aday Üye',
} as const;

export type UserRole = keyof typeof ROLES;

export const ACTIVE_ROLES: UserRole[] = ['admin', 'uretim_sefi', 'uretim_calisan', 'ofis_calisan'];
export const MANAGER_ROLES: UserRole[] = ['admin', 'uretim_sefi', 'ofis_calisan'];

export const productionRecords = pgTable("production_records", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").notNull().default("pending"),
  totalQuantity: integer("total_quantity").notNull().default(0),
  itemsPerBox: integer("items_per_box").notNull().default(1),
  lotNumber: text("lot_number"),
  referenceId: text("reference_id"),
  priority: text("priority").notNull().default("normal"),
  customer: text("customer"),
  orderDate: timestamp("order_date").defaultNow(),
  photoUrl: text("photo_url"),
  photoThumbUrl: text("photo_thumb_url"),
  pastalPhotoUrl: text("pastal_photo_url"),
  pastalPhotoThumbUrl: text("pastal_photo_thumb_url"),
  urunIslemPhotoUrl: text("urun_islem_photo_url"),
  urunIslemPhotoThumbUrl: text("urun_islem_photo_thumb_url"),
  katlamaPhotoUrl: text("katlama_photo_url"),
  katlamaPhotoThumbUrl: text("katlama_photo_thumb_url"),
  setToplamaPhotoUrl: text("set_toplama_photo_url"),
  setToplamaPhotoThumbUrl: text("set_toplama_photo_thumb_url"),
  kolilemePhotoUrl: text("kolileme_photo_url"),
  kolilemePhotoThumbUrl: text("kolileme_photo_thumb_url"),
  sevkiyatPhotoUrl: text("sevkiyat_photo_url"),
  sevkiyatPhotoThumbUrl: text("sevkiyat_photo_thumb_url"),
  sevkiyatZeosPhotoUrl: text("sevkiyat_zeos_photo_url"),
  sevkiyatZeosPhotoThumbUrl: text("sevkiyat_zeos_photo_thumb_url"),
  sterilizasyonPhotoUrl: text("sterilizasyon_photo_url"),
  sterilizasyonPhotoThumbUrl: text("sterilizasyon_photo_thumb_url"),
  metadata: jsonb("metadata"),
  lastUpdatedBy: integer("last_updated_by"),
  fifoOrder: integer("fifo_order"),
  productionTarget: integer("production_target"),
  sampleId: integer("sample_id"),
  waitingNote: text("waiting_note"),
  clonedFromId: integer("cloned_from_id"),
  orderType: text("order_type").notNull().default("musteri"),
  stokTransferredAt: timestamp("stok_transferred_at"),
  revisedAt: timestamp("revised_at"),
});

export const GELEN_APPROVAL_WINDOW_DAYS = 7;

export const ITEM_CATEGORIES = ['Kumaş', 'Diğer'] as const;
export type ItemCategory = typeof ITEM_CATEGORIES[number];

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull(),
  name: text("name").notNull(),
  unitQuantity: integer("unit_quantity").notNull().default(1),
  category: text("category").notNull().default("Diğer"),
  fabricType: text("fabric_type"),
  fabricPhases: text("fabric_phases").array(),
  description: text("description"),
  pastalPhotoUrl: text("pastal_photo_url"),
  pastalPhotoThumbUrl: text("pastal_photo_thumb_url"),
  urunIslemPhotoUrl: text("urun_islem_photo_url"),
  urunIslemPhotoThumbUrl: text("urun_islem_photo_thumb_url"),
  katlamaPhotoUrl: text("katlama_photo_url"),
  katlamaPhotoThumbUrl: text("katlama_photo_thumb_url"),
  stokItemId: integer("stok_item_id"),
  hammadeKullanim: numeric("hammadde_kullanim", { precision: 10, scale: 3 }),
  stokTurHedef: text("stok_tur_hedef"),
  stokAltTurHedef: text("stok_alt_tur_hedef"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  unitPriceCurrency: text("unit_price_currency").notNull().default('TRY'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItemHammadde = pgTable("order_item_hammadde", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull(),
  stokItemId: integer("stok_item_id").notNull(),
  kullanim: numeric("kullanim", { precision: 10, scale: 3 }).notNull(),
  altTur: text("alt_tur"),
  createdAt: timestamp("created_at").defaultNow(),
  tasindi: boolean("tasindi").notNull().default(false),
  tasindiAt: timestamp("tasindi_at"),
  tasindiBy: integer("tasindi_by").references(() => users.id),
  tasindiPhoto: text("tasindi_foto"),
  tasindiAciklama: text("tasindi_aciklama"),
  tasindiMiktar: numeric("tasindi_miktar", { precision: 10, scale: 3 }),
});

export const itemLibrary = pgTable("item_library", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  defaultUnitQuantity: integer("default_unit_quantity").notNull().default(1),
  category: text("category").notNull().default("Diğer"),
  fabricType: text("fabric_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderTitleLibrary = pgTable("order_title_library", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().unique(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customerLibrary = pgTable("customer_library", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Production phase log entries — tracks actual completed quantities per phase per order
export const productionLogs = pgTable("production_logs", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull(),
  phase: text("phase").notNull(), // 'pastal' | 'urun_islem' | 'katlama' | 'set_toplama' | 'kolileme' | 'sevkiyat'
  quantity: integer("quantity").notNull(),
  userId: integer("user_id").notNull(),
  orderItemId: integer("order_item_id"), // nullable — only set for per-item Kumaş phase tracking
  notes: text("notes"),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const recordPhotos = pgTable("record_photos", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull(),
  photoUrl: text("photo_url").notNull(),
  caption: text("caption"),
  uploadedBy: integer("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---- Zod / Insert schemas ----
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertRecordSchema = createInsertSchema(productionRecords).omit({ 
  id: true, createdAt: true, updatedAt: true 
}).extend({
  createdBy: z.coerce.number().optional(),
  totalQuantity: z.coerce.number(),
  itemsPerBox: z.coerce.number(),
  orderDate: z.coerce.date().optional(),
});

export const FABRIC_PHASE_KEYS = ['pastal', 'urun_islem', 'katlama'] as const;
export type FabricPhaseKey = typeof FABRIC_PHASE_KEYS[number];

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, createdAt: true }).extend({
  unitQuantity: z.coerce.number().min(1),
  category: z.enum(['Kumaş', 'Diğer']).default('Diğer'),
  fabricPhases: z.array(z.enum(FABRIC_PHASE_KEYS)).nullable().optional(),
  stokItemId: z.coerce.number().nullable().optional(),
  hammadeKullanim: z.preprocess(v => (v === '' || v == null) ? null : Number(v), z.number().positive().nullable().optional()),
  stokTurHedef: z.string().nullable().optional(),
  stokAltTurHedef: z.string().nullable().optional(),
  unitPrice: z.preprocess(v => (v === '' || v == null) ? null : Number(v), z.number().nonnegative().nullable().optional()),
  unitPriceCurrency: z.enum(['TRY', 'USD', 'EUR']).optional(),
});

export const insertOrderItemHammaddeSchema = createInsertSchema(orderItemHammadde).omit({ id: true, createdAt: true }).extend({
  kullanim: z.preprocess(v => (v === '' || v == null) ? null : Number(v), z.number().positive()),
  altTur: z.string().nullable().optional(),
});

export const insertItemLibrarySchema = createInsertSchema(itemLibrary).omit({ id: true, createdAt: true }).extend({
  defaultUnitQuantity: z.coerce.number().min(1),
  category: z.enum(['Kumaş', 'Diğer']).default('Diğer'),
});

export const insertOrderTitleLibrarySchema = createInsertSchema(orderTitleLibrary).omit({ id: true, createdAt: true }).extend({
  title: z.string().trim().min(1, 'Sipariş başlığı zorunlu'),
  referenceId: z.string().trim().nullable().optional(),
});

export const insertCustomerLibrarySchema = createInsertSchema(customerLibrary).omit({ id: true, createdAt: true }).extend({
  name: z.string().trim().min(1, 'Müşteri adı zorunlu'),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export const insertProductionLogSchema = createInsertSchema(productionLogs).omit({ id: true, completedAt: true }).extend({
  quantity: z.coerce.number().min(1),
  userId: z.coerce.number().optional(),
  orderItemId: z.coerce.number().optional().nullable(),
});

// ---- Types ----
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type ProductionRecord = typeof productionRecords.$inferSelect;
export type InsertRecord = z.infer<typeof insertRecordSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type OrderItemHammadde = typeof orderItemHammadde.$inferSelect;
export type InsertOrderItemHammadde = z.infer<typeof insertOrderItemHammaddeSchema>;

export type ItemLibraryEntry = typeof itemLibrary.$inferSelect;
export type InsertItemLibraryEntry = z.infer<typeof insertItemLibrarySchema>;

export type CustomerLibraryEntry = typeof customerLibrary.$inferSelect;
export type InsertCustomerLibraryEntry = z.infer<typeof insertCustomerLibrarySchema>;

export type OrderTitleLibraryEntry = typeof orderTitleLibrary.$inferSelect;
export type InsertOrderTitleLibraryEntry = z.infer<typeof insertOrderTitleLibrarySchema>;

export type ProductionLog = typeof productionLogs.$inferSelect;
export type InsertProductionLog = z.infer<typeof insertProductionLogSchema>;

export const insertRecordPhotoSchema = createInsertSchema(recordPhotos).omit({ id: true, createdAt: true });
export type RecordPhoto = typeof recordPhotos.$inferSelect;
export type InsertRecordPhoto = z.infer<typeof insertRecordPhotoSchema>;

export type CreateRecordRequest = InsertRecord;
export type UpdateRecordRequest = Partial<InsertRecord>;

export const PHASES = [
  { key: 'pastal', label: 'Pastal' },
  { key: 'urun_islem', label: 'Ürün İşlem' },
  { key: 'katlama', label: 'Katlama' },
  { key: 'set_toplama', label: 'Set Toplama' },
  { key: 'kolileme', label: 'Kolileme' },
  { key: 'sevkiyat', label: 'Sevkiyat' },
] as const;

export const weeklyPlans = pgTable("weekly_plans", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  autoCarriedAt: timestamp("auto_carried_at"),
});

export const weeklyPlanItems = pgTable("weekly_plan_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => weeklyPlans.id),
  recordId: integer("record_id").notNull().references(() => productionRecords.id),
  targetQuantity: integer("target_quantity").notNull().default(0),
  isCarried: boolean("is_carried").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWeeklyPlanItemSchema = createInsertSchema(weeklyPlanItems).omit({ id: true, createdAt: true }).extend({
  targetQuantity: z.coerce.number().min(0),
});

export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type WeeklyPlanItem = typeof weeklyPlanItems.$inferSelect;
export type InsertWeeklyPlanItem = z.infer<typeof insertWeeklyPlanItemSchema>;

export type PhaseKey = typeof PHASES[number]['key'];

// ---- Numuneler (Samples) ----
export const samples = pgTable("samples", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  lotNumber: text("lot_number"),
  referenceId: text("reference_id"),
  customer: text("customer"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const samplePhotos = pgTable("sample_photos", {
  id: serial("id").primaryKey(),
  sampleId: integer("sample_id").notNull(),
  photoUrl: text("photo_url").notNull(),
  caption: text("caption"),
  uploadedBy: integer("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sampleItems = pgTable("sample_items", {
  id: serial("id").primaryKey(),
  sampleId: integer("sample_id").notNull(),
  name: text("name").notNull(),
  unitQuantity: integer("unit_quantity").notNull().default(1),
  category: text("category").notNull().default("Diğer"),
  fabricType: text("fabric_type"),
  description: text("description"),
  photoUrl: text("photo_url"),
  photoThumbUrl: text("photo_thumb_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSampleSchema = createInsertSchema(samples).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  createdBy: z.coerce.number().optional(),
});
export const insertSamplePhotoSchema = createInsertSchema(samplePhotos).omit({ id: true, createdAt: true });
export const insertSampleItemSchema = createInsertSchema(sampleItems).omit({ id: true, createdAt: true }).extend({
  unitQuantity: z.coerce.number().min(1),
  category: z.enum(['Kumaş', 'Diğer']).default('Diğer'),
  fabricType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
});

export type Sample = typeof samples.$inferSelect;
export type InsertSample = z.infer<typeof insertSampleSchema>;
export type SamplePhoto = typeof samplePhotos.$inferSelect;
export type InsertSamplePhoto = z.infer<typeof insertSamplePhotoSchema>;
export type SampleItem = typeof sampleItems.$inferSelect;
export type InsertSampleItem = z.infer<typeof insertSampleItemSchema>;

// ---- Sevkiyat (Shipments) ----
export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull(),
  deliveryAddress: text("delivery_address"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  pendingBoxes: integer("pending_boxes"),
  shippedAt: timestamp("shipped_at"),
  shippedBy: integer("shipped_by"),
  offRecord: boolean("off_record").notNull().default(false),
  barkodDogrulandi: boolean("barkod_dogrulandi").default(false),
  barkodKaynak: text("barkod_kaynak"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shipmentPhotos = pgTable("shipment_photos", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull(),
  photoUrl: text("photo_url").notNull(),
  caption: text("caption"),
  uploadedBy: integer("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Shipment status: 'pending' | 'araca_yuklendi'
// Vehicle types: 'tir' | 'on_teker' | 'kirkayak' | 'panelvan' | 'kargo'
export const VEHICLE_TYPES = {
  tir: { label: 'Tır', maxPallet: 32, maxKoli: 660 },
  on_teker: { label: '10 Teker', maxPallet: 16, maxKoli: 340 },
  kirkayak: { label: 'Kırkayak', maxPallet: 18, maxKoli: 380 },
  panelvan: { label: 'Panelvan', maxPallet: 0, maxKoli: 80 },
  kargo: { label: 'Kargo', maxPallet: 0, maxKoli: 0 },
} as const;

export const shipmentPlans = pgTable("shipment_plans", {
  id: serial("id").primaryKey(),
  vehicleType: text("vehicle_type").notNull(),
  plannedDepartureDate: date("planned_departure_date"),
  shippingCompany: text("shipping_company"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  departedAt: timestamp("departed_at"),
  departedBy: integer("departed_by"),
  // Driver info (for Tır, 10 Teker, Kırkayak, Panelvan)
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  vehiclePlate: text("vehicle_plate"),
  dorsePlate: text("dorse_plate"),
  driverPhoto: text("driver_photo"),
  // Cargo info (for Kargo vehicle type)
  cargoCompany: text("cargo_company"),
  cargoTitle: text("cargo_title"),
  cargoDescription: text("cargo_description"),
  cargoLabelPhoto: text("cargo_label_photo"),
});

export const shipmentPlanAddresses = pgTable("shipment_plan_addresses", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  address: text("address").notNull(),
  irsaliyePhoto: text("irsaliye_photo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shipmentPlanPhotos = pgTable("shipment_plan_photos", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  photoUrl: text("photo_url").notNull(),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shipmentPlanItems = pgTable("shipment_plan_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  shipmentId: integer("shipment_id").notNull(),
  boxCount: integer("box_count").notNull().default(1),
  loadingType: text("loading_type").notNull().default("koli"),
  addressIndex: integer("address_index").notNull().default(0),
  irsaliyePhoto: text("irsaliye_photo"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* ─── Chat Channels ──────────────────────────────────────────────────────── */

export const chatChannels = pgTable("chat_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  isDefault: boolean("is_default").notNull().default(false),
});

export const channelMembers = pgTable("channel_members", {
  channelId: integer("channel_id").notNull(),
  userId: integer("user_id").notNull(),
  addedAt: timestamp("added_at").defaultNow(),
});

export type ChatChannel = typeof chatChannels.$inferSelect;
export type ChannelMember = typeof channelMembers.$inferSelect;

/* ─── Chat Messages ─────────────────────────────────────────────────────── */

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  content: text("content").notNull(),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").defaultNow(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isPinned: boolean("is_pinned").notNull().default(false),
  pinnedBy: integer("pinned_by"),
  pinnedAt: timestamp("pinned_at"),
});

export const messageReads = pgTable("message_reads", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  readAt: timestamp("read_at").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true, isDeleted: true, isPinned: true, pinnedBy: true, pinnedAt: true });
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type MessageRead = typeof messageReads.$inferSelect;

/* ─── Blocked IPs ────────────────────────────────────────────────────────── */
export const blockedIps = pgTable("blocked_ips", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull().unique(),
  reason: text("reason").notNull().default("Too many failed login attempts"),
  blockedAt: timestamp("blocked_at").defaultNow(),
});
export type BlockedIp = typeof blockedIps.$inferSelect;

/* ─── Address Library ────────────────────────────────────────────────────── */
export const addressLibrary = pgTable("address_library", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  label: text("label"),
  useCount: integer("use_count").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
});
export type AddressLibrary = typeof addressLibrary.$inferSelect;

export const shipmentBarkodDogrulamalari = pgTable("shipment_barkod_dogrulamalari", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull(),
  stokItemId: integer("stok_item_id"),
  code: text("code").notNull(),
  ok: boolean("ok").notNull(),
  kullanici: integer("kullanici"),
  kaynak: text("kaynak"),
  ts: timestamp("ts").defaultNow(),
});

export const insertShipmentBarkodDogrulamaSchema = createInsertSchema(shipmentBarkodDogrulamalari).omit({ id: true, ts: true });
export type ShipmentBarkodDogrulama = typeof shipmentBarkodDogrulamalari.$inferSelect;
export type InsertShipmentBarkodDogrulama = z.infer<typeof insertShipmentBarkodDogrulamaSchema>;

export const insertShipmentSchema = createInsertSchema(shipments).omit({ id: true, createdAt: true });
export const insertShipmentPhotoSchema = createInsertSchema(shipmentPhotos).omit({ id: true, createdAt: true });
export const insertShipmentPlanSchema = createInsertSchema(shipmentPlans).omit({ id: true, createdAt: true });
export const insertShipmentPlanAddressSchema = createInsertSchema(shipmentPlanAddresses).omit({ id: true, createdAt: true });
export const insertShipmentPlanItemSchema = createInsertSchema(shipmentPlanItems).omit({ id: true, createdAt: true });

export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type ShipmentPhoto = typeof shipmentPhotos.$inferSelect;
export type InsertShipmentPhoto = z.infer<typeof insertShipmentPhotoSchema>;
export type ShipmentPlan = typeof shipmentPlans.$inferSelect;
export type InsertShipmentPlan = z.infer<typeof insertShipmentPlanSchema>;
export type ShipmentPlanAddress = typeof shipmentPlanAddresses.$inferSelect;
export type ShipmentPlanItem = typeof shipmentPlanItems.$inferSelect;
export type ShipmentPlanPhoto = typeof shipmentPlanPhotos.$inferSelect;

/* ─── Stok Kategoriler (ana türler — dinamik) ─────────────────────────────── */
export const stokKategoriler = pgTable("stok_kategoriler", {
  id: serial("id").primaryKey(),
  ad: text("ad").notNull().unique(),
  sira: integer("sira").notNull().default(0),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStokKategoriSchema = createInsertSchema(stokKategoriler).omit({ id: true, createdAt: true });
export type StokKategori = typeof stokKategoriler.$inferSelect;
export type InsertStokKategori = z.infer<typeof insertStokKategoriSchema>;

/* ─── Stok Alt Türler (dinamik) ───────────────────────────────────────────── */
export const stokAltTurler = pgTable("stok_alt_turler", {
  id: serial("id").primaryKey(),
  kategoriId: integer("kategori_id").notNull(),
  ad: text("ad").notNull(),
  sira: integer("sira").notNull().default(0),
  kritikStok: integer("kritik_stok").notNull().default(0),
  birim: text("birim").default('adet'),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStokAltTurSchema = createInsertSchema(stokAltTurler).omit({ id: true, createdAt: true }).extend({
  ad: z.string().min(1, "Alt tür adı gerekli"),
  kategoriId: z.number().int().positive("Kategori seçilmeli"),
  kritikStok: z.coerce.number().min(0).default(0),
  birim: z.enum(['adet', 'metre', 'metrekare', 'kg']).default('adet'),
});
export const updateStokAltTurSchema = z.object({
  ad: z.string().min(1).optional(),
  kritikStok: z.coerce.number().min(0).optional(),
  birim: z.enum(['adet', 'metre', 'metrekare', 'kg']).optional(),
});
export type StokAltTur = typeof stokAltTurler.$inferSelect;
export type InsertStokAltTur = z.infer<typeof insertStokAltTurSchema>;
export type UpdateStokAltTur = z.infer<typeof updateStokAltTurSchema>;

/* ─── Stok Items ──────────────────────────────────────────────────────────── */
export const STOK_BIRIMLER = ['adet', 'metre', 'metrekare', 'kg'] as const;
export type StokBirim = typeof STOK_BIRIMLER[number];

export const stokItems = pgTable("stok_items", {
  id: serial("id").primaryKey(),
  urunAdi: text("urun_adi").notNull(),
  lot: text("lot"),
  aciklama: text("aciklama"),
  fotoUrl: text("foto_url"),
  girisTarihi: date("giris_tarihi").notNull(),
  sonKullanmaTarihi: date("son_kullanma_tarihi"),
  tur: text("tur").notNull(),
  altTur: text("alt_tur"),
  ureticiFirma: text("uretici_firma"),
  birim: text("birim").notNull().default("adet"),
  miktar: integer("miktar").notNull().default(0),
  rezerveMiktar: integer("rezerve_miktar").notNull().default(0),
  kritikStok: integer("kritik_stok").notNull().default(0),
  stokDurumu: text("stok_durumu").notNull().default("stok"),
  createdBy: integer("created_by"),
  barkodDogrulandi: boolean("barkod_dogrulandi").default(false),
  barkodKaynak: text("barkod_kaynak"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStokItemSchema = createInsertSchema(stokItems).omit({ id: true, createdAt: true }).extend({
  miktar: z.coerce.number().min(0),
  rezerveMiktar: z.coerce.number().min(0).default(0),
  kritikStok: z.coerce.number().min(0),
  girisTarihi: z.string().min(1, "Giriş tarihi gerekli"),
  sonKullanmaTarihi: z.string().nullable().optional(),
  tur: z.string().min(1, "Tür gerekli"),
  altTur: z.string().nullable().optional(),
  birim: z.enum(['adet', 'metre', 'metrekare', 'kg']).default('adet'),
  stokDurumu: z.enum(['stok', 'rezerve']).default('stok'),
});

export type StokItem = typeof stokItems.$inferSelect;
export type InsertStokItem = z.infer<typeof insertStokItemSchema>;

/* ─── Reçete (Recipe / BOM for incoming orders) ──────────────────────────── */
export const receteItems = pgTable("recete_items", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull(),
  stokTur: text("stok_tur").notNull(),
  stokAltTur: text("stok_alt_tur").notNull(),
  miktar: numeric("miktar", { precision: 10, scale: 3 }).notNull(),
  birim: text("birim").notNull().default("adet"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const receteRezervasyonlar = pgTable("recete_rezervasyon", {
  id: serial("id").primaryKey(),
  receteItemId: integer("recete_item_id").notNull(),
  stokItemId: integer("stok_item_id").notNull(),
  rezervedMiktar: numeric("rezerved_miktar", { precision: 10, scale: 3 }).notNull(),
  dusenMiktar: numeric("dusen_miktar", { precision: 10, scale: 3 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  tasindi: boolean("tasindi").notNull().default(false),
  tasindiAt: timestamp("tasindi_at"),
  tasindiBy: integer("tasindi_by").references(() => users.id),
  tasindiPhoto: text("tasindi_foto"),
  tasindiAciklama: text("tasindi_aciklama"),
  tasindiMiktar: numeric("tasindi_miktar", { precision: 10, scale: 3 }),
});

export const insertReceteItemSchema = createInsertSchema(receteItems).omit({ id: true, createdAt: true }).extend({
  miktar: z.preprocess(v => Number(v), z.number().positive("Miktar 0'dan büyük olmalı")),
  birim: z.enum(['adet', 'metre', 'metrekare', 'kg']).default('adet'),
});

export type ReceteItem = typeof receteItems.$inferSelect;
export type InsertReceteItem = z.infer<typeof insertReceteItemSchema>;
export type ReceteRezervasyonu = typeof receteRezervasyonlar.$inferSelect;

export const depoHareketleri = pgTable("depo_hareketleri", {
  id: serial("id").primaryKey(),
  stokItemId: integer("stok_item_id").notNull(),
  stokAdi: text("stok_adi").notNull(),
  lot: text("lot"),
  birim: text("birim").notNull().default("adet"),
  rezerveMiktar: numeric("rezerve_miktar", { precision: 10, scale: 3 }).notNull(),
  kaynak: varchar("kaynak", { length: 10 }).notNull(),
  kaynakId: integer("kaynak_id").notNull(),
  siparisId: integer("siparis_id").notNull(),
  siparisTitle: text("siparis_title").notNull(),
  siparisLot: text("siparis_lot"),
  tasindi: boolean("tasindi").notNull().default(false),
  tasindiAt: timestamp("tasindi_at"),
  tasindiBy: integer("tasindi_by"),
  tasindiByUsername: text("tasindi_by_username"),
  tasindiPhoto: text("tasindi_foto"),
  tasindiAciklama: text("tasindi_aciklama"),
  tasindiMiktar: numeric("tasindi_miktar", { precision: 10, scale: 3 }),
  barkodDogrulandi: boolean("barkod_dogrulandi").default(false),
  barkodKaynak: text("barkod_kaynak"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DepoHareketi = typeof depoHareketleri.$inferSelect;

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type AppSetting = typeof appSettings.$inferSelect;

export const stokAnomalileri = pgTable("stok_anomalileri", {
  id: serial("id").primaryKey(),
  depoHareketId: integer("depo_hareket_id").notNull(),
  tur: varchar("tur", { length: 10 }).notNull(),
  beklenenMiktar: numeric("beklenen_miktar", { precision: 10, scale: 3 }).notNull(),
  gercekMiktar: numeric("gercek_miktar", { precision: 10, scale: 3 }).notNull(),
  fark: numeric("fark", { precision: 10, scale: 3 }).notNull(),
  birim: text("birim").notNull(),
  aciklama: text("aciklama").notNull(),
  fotograf: text("fotograf"),
  reportedBy: integer("reported_by").notNull(),
  reportedByUsername: text("reported_by_username").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedBy: integer("resolved_by"),
  resolvedByUsername: text("resolved_by_username"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  ekStokDusumler: jsonb("ek_stok_dusumler").$type<Array<{ stokItemId: number; lot: string | null; urunAdi: string; miktar: number }>>().notNull().default([]),
  autoDusuldu: boolean("auto_dusuldu").notNull().default(false),
  bekleyenMiktar: numeric("bekleyen_miktar", { precision: 10, scale: 3 }).notNull().default('0'),
  bekleyenUrunAdi: text("bekleyen_urun_adi"),
  bekleyenBirim: text("bekleyen_birim"),
});

export const insertStokAnomaliSchema = createInsertSchema(stokAnomalileri).omit({
  id: true,
  reportedBy: true,
  reportedByUsername: true,
  createdAt: true,
  resolved: true,
  resolvedBy: true,
  resolvedByUsername: true,
  resolvedAt: true,
  resolutionNotes: true,
  autoDusuldu: true,
  bekleyenMiktar: true,
  bekleyenUrunAdi: true,
  bekleyenBirim: true,
});

export type StokAnomali = typeof stokAnomalileri.$inferSelect;
export type InsertStokAnomali = z.infer<typeof insertStokAnomaliSchema>;
