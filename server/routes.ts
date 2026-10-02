import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { insertOrderItemSchema, insertOrderItemHammaddeSchema, insertItemLibrarySchema, insertCustomerLibrarySchema, insertOrderTitleLibrarySchema, insertProductionLogSchema, insertReceteItemSchema, ACTIVE_ROLES, MANAGER_ROLES, productionRecords } from "@shared/schema";
import { z } from "zod";
import { stripPhotos, stripPhotosArray, stripShipmentPlanPhotos, stripShipmentPlanRowPhotos, PHOTO_TABLE_FIELDS } from "./photo-fields";
import { createHash } from "node:crypto";
import { pool } from "./db";

/**
 * Match a request's `If-None-Match` header against a server-generated ETag.
 * Handles: exact match, comma-separated lists (RFC 7232), and the `*` wildcard.
 * Returns true if the client already has an up-to-date copy and we may 304.
 */
function matchesIfNoneMatch(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(',') : header;
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed === '*') return true;
    if (trimmed === etag) return true;
    // Treat W/"x" and "x" as equivalent (weak comparison per RFC 7232 §2.3.2).
    const stripWeak = (s: string) => s.startsWith('W/') ? s.slice(2) : s;
    if (stripWeak(trimmed) === stripWeak(etag)) return true;
  }
  return false;
}

// Brute-force tracking: IP -> failed attempt count
const failedAttempts = new Map<string, number>();
const MAX_FAILED_ATTEMPTS = 10;

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || "unknown";
}


function requireRole(roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) return res.status(401).json({ message: "Giriş yapmalısınız" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Kullanıcı bulunamadı" });
    if (!roles.includes(user.role)) return res.status(403).json({ message: "Bu işlem için yetkiniz yok" });
    // Update last seen asynchronously (fire-and-forget)
    storage.updateLastSeen(user.id).catch(() => {});
    next();
  };
}

const requireActive = requireRole([...ACTIVE_ROLES]);
const requireManager = requireRole([...MANAGER_ROLES]);
const requireAdmin = requireRole(['admin']);
const requireAdminView = requireRole(['admin', 'ofis_calisan']);

// Stok anomali bildirme yetkisi: admin, üretim şefi VEYA stok yetkisi olan herhangi bir aktif kullanıcı
async function requireStokAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ message: "Giriş yapmalısınız" });
  const user = await storage.getUser(req.session.userId);
  if (!user) return res.status(401).json({ message: "Kullanıcı bulunamadı" });
  const isAuthorized = user.role === 'admin' || user.role === 'uretim_sefi' || user.role === 'ofis_calisan' || user.stokYetkisi === true;
  if (!isAuthorized) return res.status(403).json({ message: "Bu işlem için en az üretim şefi rolü veya stok yetkisi gereklidir" });
  storage.updateLastSeen(user.id).catch(() => {});
  (req as any).currentUser = user;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth
  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existingUser = await storage.getUserByUsername(input.username);
      if (existingUser) return res.status(400).json({ message: "Bu kullanıcı adı zaten alınmış" });
      const user = await storage.createUser({ username: input.username, password: input.password, role: "aday" });
      req.session.userId = user.id;
      return res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Sunucu hatası" });
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const ip = getClientIp(req);

      // Check if IP is blocked
      const blocked = await storage.isIpBlocked(ip);
      if (blocked) {
        return res.status(403).json({ message: "Bu cihazdan giriş engellendi. Yönetici ile iletişime geçin." });
      }

      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);

      if (!user) {
        // Username not found — still count toward brute-force limit
        const prev = failedAttempts.get(ip) ?? 0;
        const next = prev + 1;
        failedAttempts.set(ip, next);
        if (next >= MAX_FAILED_ATTEMPTS) {
          await storage.addBlockedIp(ip);
          failedAttempts.delete(ip);
          return res.status(403).json({ message: "Çok fazla başarısız giriş denemesi. Bu cihazdan giriş engellendi. Yönetici ile iletişime geçin." });
        }
        const remaining = MAX_FAILED_ATTEMPTS - next;
        return res.status(401).json({ message: "Böyle bir kullanıcı adı bulunmamaktadır.", remaining });
      }

      if (user.password !== input.password) {
        // Wrong password
        const prev = failedAttempts.get(ip) ?? 0;
        const next = prev + 1;
        failedAttempts.set(ip, next);
        if (next >= MAX_FAILED_ATTEMPTS) {
          await storage.addBlockedIp(ip);
          failedAttempts.delete(ip);
          return res.status(403).json({ message: `${MAX_FAILED_ATTEMPTS} kez hatalı giriş yapıldı. Bu cihazdan giriş engellendi. Yönetici ile iletişime geçin.` });
        }
        const remaining = MAX_FAILED_ATTEMPTS - next;
        return res.status(401).json({ message: "Hatalı şifre girdiniz.", remaining });
      }

      // Successful login — reset counter
      failedAttempts.delete(ip);

      req.session.userId = user.id;
      req.session.loginAt = Date.now();
      req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Oturum kaydedilemedi" });
        res.json(user);
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Sunucu hatası" });
    }
  });

  app.get(api.auth.me.path, async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Oturum açılmadı" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Kullanıcı bulunamadı" });
    storage.updateLastSeen(user.id).catch(() => {});
    res.json(user);
  });

  app.post(api.auth.logout.path, async (req, res) => {
    const userId = req.session.userId;
    if (userId) {
      storage.updateLastLogout(userId).catch(() => {});
    }
    req.session.destroy(() => res.json({ message: "Çıkış yapıldı" }));
  });

  // Users
  app.get(api.users.list.path, requireAdminView, async (req, res) => {
    res.json(await storage.getUsers());
  });

  app.get('/api/users/name-list', requireActive, async (req, res) => {
    const users = await storage.getUsers();
    res.json(users
      .filter(u => (ACTIVE_ROLES as readonly string[]).includes(u.role))
      .map(u => ({ id: u.id, name: u.displayName || u.username }))
    );
  });

  app.get('/api/users/pending', requireAdminView, async (req, res) => {
    res.json(await storage.getPendingUsers());
  });

  app.put('/api/users/:id/role', requireAdmin, async (req, res) => {
    try {
      const { role } = z.object({ role: z.string() }).parse(req.body);
      const validRoles = ['admin', 'uretim_sefi', 'uretim_calisan', 'ofis_calisan', 'aday'];
      if (!validRoles.includes(role)) return res.status(400).json({ message: "Geçersiz rol" });
      const targetId = Number(req.params.id);
      if (targetId === req.session.userId) return res.status(400).json({ message: "Kendi rolünüzü değiştiremezsiniz" });
      const updated = await storage.updateUserRole(targetId, role);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Rol güncellenemedi" });
    }
  });

  app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    const targetId = Number(req.params.id);
    if (targetId === req.session.userId) return res.status(400).json({ message: "Kendi hesabınızı silemezsiniz" });
    await storage.deleteUser(targetId);
    res.status(204).send();
  });

  app.put('/api/users/:id/password', requireAdmin, async (req, res) => {
    try {
      const { password } = z.object({ password: z.string().min(1, 'Şifre boş olamaz').max(200) }).parse(req.body);
      const targetId = Number(req.params.id);
      const updated = await storage.updateUserPassword(targetId, password);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Şifre güncellenemedi" });
    }
  });

  app.put('/api/users/:id/sevkiyat-yetkisi', requireAdmin, async (req, res) => {
    try {
      const { value } = z.object({ value: z.boolean() }).parse(req.body);
      const updated = await storage.updateUserSevkiyatYetkisi(Number(req.params.id), value);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Güncelleme başarısız" });
    }
  });

  app.put('/api/users/:id/stok-yetkisi', requireAdmin, async (req, res) => {
    try {
      const { value } = z.object({ value: z.boolean() }).parse(req.body);
      const updated = await storage.updateUserStokYetkisi(Number(req.params.id), value);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Güncelleme başarısız" });
    }
  });

  // Blocked IPs — admin only
  app.get('/api/admin/blocked-ips', requireAdminView, async (req, res) => {
    const list = await storage.getBlockedIps();
    res.json(list);
  });

  app.delete('/api/admin/blocked-ips/:ip', requireAdminView, async (req, res) => {
    const ip = decodeURIComponent(req.params.ip);
    await storage.removeBlockedIp(ip);
    res.json({ message: "IP engeli kaldırıldı" });
  });

  // Display name update — self OR higher-ranked user
  const ROLE_RANK: Record<string, number> = { admin: 4, uretim_sefi: 3, ofis_calisan: 3, uretim_calisan: 2, aday: 1 };
  app.put('/api/users/:id/display-name', async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Giriş yapmalısınız" });
      const requester = await storage.getUser(req.session.userId);
      if (!requester) return res.status(401).json({ message: "Kullanıcı bulunamadı" });
      const targetId = Number(req.params.id);
      if (targetId !== req.session.userId) {
        const target = await storage.getUser(targetId);
        if (!target) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
        const requesterRank = ROLE_RANK[requester.role] ?? 0;
        const targetRank = ROLE_RANK[target.role] ?? 0;
        if (requesterRank <= targetRank) return res.status(403).json({ message: "Kendi rolünüzden üst veya eşit birinin adını değiştiremezsiniz" });
      }
      const { displayName } = z.object({ displayName: z.string().max(50).nullable() }).parse(req.body);
      const updated = await storage.updateDisplayName(targetId, displayName || null);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Ad güncellenemedi" });
    }
  });

  // Records
  app.get(api.records.list.path, requireActive, async (req, res) => {
    const records = await storage.getRecords({ search: req.query.search as string, status: req.query.status as string });
    // Strip large base64 photo fields from list payload — full photos load on demand
    // via record detail endpoint or GET /api/photo/:table/:id/:field. Adds `hasPhoto` flag.
    res.json(stripPhotosArray(records as any[], 'production_records'));
    // Fire-and-forget: check in_progress records for completion (doesn't block response)
    const inProgress = records.filter((r: any) => r.status === 'in_progress');
    if (inProgress.length > 0) {
      Promise.all(inProgress.map((r: any) => autoUpdateRecordStatus(r.id).catch(() => {}))).catch(() => {});
    }
  });

  app.get('/api/records/export', requireActive, async (req, res) => {
    const { productionRecords, productionLogs } = await import('@shared/schema');
    const { sql: drizzleSql } = await import('drizzle-orm');
    const { db } = await import('./db');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allRecords = await db.select().from(productionRecords);
    const filtered = allRecords.filter(r =>
      r.status !== 'completed' ||
      (r.updatedAt && new Date(r.updatedAt) >= thirtyDaysAgo)
    );

    const totalsRows = await db
      .select({
        recordId: productionLogs.recordId,
        total: drizzleSql<number>`COALESCE(SUM(${productionLogs.quantity}), 0)::int`,
      })
      .from(productionLogs)
      .where(drizzleSql`${productionLogs.phase} = 'set_toplama'`)
      .groupBy(productionLogs.recordId);

    const totalsMap = Object.fromEntries(totalsRows.map(r => [r.recordId, Number(r.total)]));

    const statusLabel: Record<string, string> = {
      pending: 'Beklemede',
      in_progress: 'Devam Ediyor',
      completed: 'Tamamlandı',
    };

    const rows = filtered.map(r => ({
      Lot: r.lotNumber ?? '',
      Başlık: r.title,
      'Referans Kodu': r.referenceId ?? '',
      Müşteri: r.customer ?? '',
      'Tamamlanan/Miktar': `${totalsMap[r.id] ?? 0}/${r.totalQuantity}`,
      'Sipariş Durumu': statusLabel[r.status] ?? r.status,
    }));

    res.json(rows);
  });

  app.post(api.records.create.path, requireManager, async (req, res) => {
    try {
      const input = { ...api.records.create.input.parse(req.body), createdBy: req.session.userId! };
      res.status(201).json(await storage.createRecord(input as any));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Kayıt oluşturulurken hata oluştu" });
    }
  });

  app.get(api.records.get.path, requireActive, async (req, res) => {
    const record = await storage.getRecord(Number(req.params.id));
    if (!record) return res.status(404).json({ message: 'Kayıt bulunamadı' });
    const creator = record.createdBy ? await storage.getUser(record.createdBy) : null;
    const updater = record.lastUpdatedBy ? await storage.getUser(record.lastUpdatedBy) : null;
    res.json({
      ...record,
      createdByName: creator ? (creator.displayName || creator.username) : null,
      lastUpdatedByName: updater ? (updater.displayName || updater.username) : null,
    });
  });

  // GET: Atanan stok lotları (depo hareketleri) for a single record
  app.get('/api/records/:id/stok-atamalar', requireActive, async (req, res) => {
    try {
      const rows = await storage.getDepoHareketleriByRecord(Number(req.params.id));
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.put(api.records.update.path, requireManager, async (req, res) => {
    try {
      const { clientUpdatedAt, ...rest } = api.records.update.input.parse(req.body);
      const expectedUpdatedAt = clientUpdatedAt ? new Date(clientUpdatedAt) : undefined;
      const updated = await storage.updateRecord(Number(req.params.id), { ...rest, lastUpdatedBy: req.session.userId! }, expectedUpdatedAt);
      if (!updated) {
        return res.status(409).json({ message: "Bu kayıt başka biri tarafından güncellendi. Sayfayı yenileyip tekrar deneyin." });
      }
      await storage.createRecordEditLog(Number(req.params.id), req.session.userId!).catch(() => {});
      if (rest.status === 'completed') {
        consumeRemainingReservesForRecord(Number(req.params.id)).catch(() => {});
        storage.deleteDepoHareketBySiparis(Number(req.params.id)).catch(() => {});
      } else if (rest.status === 'cancelled') {
        storage.deleteDepoHareketBySiparis(Number(req.params.id)).catch(() => {});
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Güncelleme hatası" });
    }
  });

  app.get('/api/records/:id/edit-history', requireActive, async (req, res) => {
    const logs = await storage.getRecordEditLogs(Number(req.params.id));
    res.json(logs);
  });

  app.delete(api.records.delete.path, requireManager, async (req, res) => {
    const record = await storage.getRecord(Number(req.params.id));
    if (!record) return res.status(404).json({ message: 'Kayıt bulunamadı' });
    if (record.status === 'completed') {
      const requester = await storage.getUser(req.session.userId!);
      if (!requester || requester.role !== 'admin') {
        return res.status(403).json({ message: 'Tamamlanan siparişleri yalnızca yönetici silebilir' });
      }
    }
    const deletingId = Number(req.params.id);
    await storage.deleteRecord(deletingId);
    storage.deleteDepoHareketBySiparis(deletingId).catch(() => {});
    res.status(204).send();
  });

  app.post('/api/records/:id/clone', requireManager, async (req, res) => {
    try {
      const newRecord = await storage.cloneRecord(Number(req.params.id), req.session.userId!);
      res.json(newRecord);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  /* ─── Gelen Siparişler ────────────────────────────────────────────────── */
  app.get('/api/gelen', requireActive, async (req, res) => {
    try {
      const gelenList = await storage.getGelenSiparisler();
      const withItems = await Promise.all(gelenList.map(async r => {
        const items = await storage.getOrderItems(r.id);
        const recete = await storage.getReceteItems(r.id);
        // Strip photos from record + items for list payload
        return {
          ...stripPhotos(r as any, 'production_records'),
          items: stripPhotosArray(items as any[], 'order_items'),
          recete,
        };
      }));
      res.json(withItems);
    } catch (err) {
      res.status(500).json({ message: "Gelen siparişler alınamadı" });
    }
  });

  app.post('/api/gelen', requireManager, async (req, res) => {
    try {
      const input = api.records.create.input.parse(req.body);
      const record = await storage.createRecord({ ...input, createdBy: req.session.userId!, status: 'gelen' } as any);
      res.status(201).json(record);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Gelen sipariş oluşturulurken hata oluştu" });
    }
  });

  app.post('/api/gelen/:id/revize', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: 'Sipariş bulunamadı' });
      if (record.status !== 'gelen') return res.status(400).json({ message: 'Bu sipariş gelen durumunda değil' });
      const updated = await storage.reviseGelenSiparis(id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Revize edilemedi' });
    }
  });

  app.post('/api/gelen/:id/onayla', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: 'Sipariş bulunamadı' });
      if (record.status !== 'gelen') return res.status(400).json({ message: 'Bu sipariş gelen durumunda değil' });

      const { GELEN_APPROVAL_WINDOW_DAYS } = await import('@shared/schema');
      const baseTime = (record.revisedAt ?? record.createdAt);
      if (baseTime) {
        const deadline = new Date(baseTime).getTime() + GELEN_APPROVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() > deadline) {
          return res.status(400).json({
            message: `Onay süresi doldu (${GELEN_APPROVAL_WINDOW_DAYS} gün). Önce siparişi revize edin.`,
            expired: true,
          });
        }
      }

      const receteItems = await storage.getReceteItems(id);
      const shortfalls: { altTur: string; needed: number; free: number; birim: string }[] = [];

      for (const item of receteItems) {
        if (!item.stokAltTur) continue;
        const lots = await storage.getStokItemsByAltTur(item.stokAltTur);
        const lotIds = lots.map(l => l.id);
        const totalMiktar = lots.reduce((s, l) => s + l.miktar, 0);
        const totalRezeve = lots.reduce((s, l) => s + (l.rezerveMiktar ?? 0), 0);
        const warehouseFree = totalMiktar - totalRezeve;
        // Also count surplus already in production as available
        const fazlalikRows = await storage.getFazlalikByStokItemIds(lotIds);
        const totalSurplus = fazlalikRows.reduce((s, r) => s + (Number(r.tasindiMiktar ?? 0) - Number(r.rezerveMiktar)), 0);
        const freeStock = warehouseFree + totalSurplus;
        const needed = Number(item.miktar);
        if (freeStock < needed - 0.001) {
          shortfalls.push({ altTur: item.stokAltTur, needed, free: freeStock, birim: item.birim });
        }
      }

      if (shortfalls.length > 0) {
        return res.status(400).json({
          message: 'Yetersiz serbest stok',
          shortfalls,
        });
      }

      // FIFO stok rezervasyonu: önce üretimdeki fazlalık stok kullanılır, ardından depodan FIFO
      for (const item of receteItems) {
        if (!item.stokAltTur) continue;
        const lots = await storage.getStokItemsByAltTur(item.stokAltTur);
        const lotIds = lots.map(l => l.id);
        let remaining = Number(item.miktar);

        // 1) Üretimdeki fazlalık stoktan kullan (auto-assign)
        const fazlalikRows = await storage.getFazlalikByStokItemIds(lotIds);
        for (const fazlalik of fazlalikRows) {
          if (remaining <= 0) break;
          const surplus = Number(fazlalik.tasindiMiktar ?? 0) - Number(fazlalik.rezerveMiktar);
          if (surplus <= 0) continue;
          const toUse = Math.min(remaining, surplus);
          // Assign surplus to this new order — creates a new depo_hareketi (tasindi=true) and reduces source
          await storage.siparisAtaDepoHareketi(
            fazlalik.id,
            toUse,
            record.id,
            record.title,
            record.lotNumber ?? null,
          );
          // Track in recete_rezervasyon (but don't increment stok_items.rezerveMiktar — stock is already in production)
          await storage.createReceteRezervasyonu(item.id, fazlalik.stokItemId, toUse);
          remaining -= toUse;
        }

        // 2) Kalan miktar için depodan FIFO rezerve et
        for (const lot of lots) {
          if (remaining <= 0) break;
          const lotFree = lot.miktar - (lot.rezerveMiktar ?? 0);
          if (lotFree <= 0) continue;
          const toReserve = Math.min(remaining, lotFree);
          await storage.updateStokItem(lot.id, { rezerveMiktar: (lot.rezerveMiktar ?? 0) + toReserve });
          const rrId = await storage.createReceteRezervasyonu(item.id, lot.id, toReserve);
          storage.createDepoHareketi({
            stokItemId: lot.id,
            stokAdi: lot.urunAdi,
            lot: lot.lot ?? null,
            birim: lot.birim,
            rezerveMiktar: toReserve,
            kaynak: 'rr',
            kaynakId: rrId,
            siparisId: record.id,
            siparisTitle: record.title,
            siparisLot: record.lotNumber ?? null,
          }).catch(() => {});
          remaining -= toReserve;
        }
      }

      const updated = await storage.onaylaGelenSiparis(id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Onaylama başarısız" });
    }
  });

  /* ─── Reçete (BOM) ────────────────────────────────────────────────────── */
  app.get('/api/recete/:recordId', requireActive, async (req, res) => {
    try {
      const items = await storage.getReceteItems(Number(req.params.recordId));
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Reçete alınamadı" });
    }
  });

  app.post('/api/recete/:recordId', requireManager, async (req, res) => {
    try {
      const recordId = Number(req.params.recordId);
      const input = insertReceteItemSchema.parse({ ...req.body, recordId });
      const item = await storage.createReceteItem(input);
      await storage.touchGelenIfRevisable(recordId);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Reçete kalemi eklenemedi" });
    }
  });

  app.delete('/api/recete/:recordId/:itemId', requireManager, async (req, res) => {
    try {
      await storage.deleteReceteItem(Number(req.params.itemId));
      await storage.touchGelenIfRevisable(Number(req.params.recordId));
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Reçete kalemi silinemedi" });
    }
  });

  // Order Items
  app.get('/api/records/:id/items', requireActive, async (req, res) => {
    res.json(await storage.getOrderItems(Number(req.params.id)));
  });

  app.post('/api/records/:id/items', requireManager, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const input = insertOrderItemSchema.parse({ ...req.body, recordId });
      const item = await storage.createOrderItem(input);
      // Reserve stok if hammadde linked
      if (input.stokItemId && input.hammadeKullanim) {
        try {
          const record = await storage.getRecord(recordId);
          if (record && record.totalQuantity > 0) {
            const delta = Number(input.hammadeKullanim) * record.totalQuantity;
            await storage.adjustStokRezerve(input.stokItemId, delta);
          }
        } catch (_) {}
      }
      try {
        const library = await storage.getItemLibrary();
        if (!library.some(l => l.name.toLowerCase() === input.name.toLowerCase())) {
          await storage.createItemLibraryEntry({
            name: input.name,
            description: input.description || undefined,
            defaultUnitQuantity: input.unitQuantity,
            category: input.category || 'Diğer',
            fabricType: input.fabricType || undefined,
          });
        }
      } catch (_) {}
      await storage.touchGelenIfRevisable(recordId);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Kalem eklenirken hata oluştu" });
    }
  });

  app.put('/api/records/:id/items/:itemId', requireManager, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      // Capture old item before update for reserve adjustment
      const oldItems = await storage.getOrderItems(recordId);
      const oldItem = oldItems.find(i => i.id === itemId);
      const parsed = insertOrderItemSchema.partial().parse(req.body);
      const updated = await storage.updateOrderItem(itemId, parsed);
      // Adjust stok reserve: release old, apply new
      try {
        const record = await storage.getRecord(recordId);
        if (record && record.totalQuantity > 0) {
          if (oldItem?.stokItemId && oldItem?.hammadeKullanim) {
            const oldDelta = Number(oldItem.hammadeKullanim) * record.totalQuantity;
            await storage.adjustStokRezerve(oldItem.stokItemId, -oldDelta);
          }
          const newStokId = parsed.stokItemId ?? updated.stokItemId;
          const newKullanim = parsed.hammadeKullanim ?? updated.hammadeKullanim;
          if (newStokId && newKullanim) {
            const newDelta = Number(newKullanim) * record.totalQuantity;
            await storage.adjustStokRezerve(newStokId, newDelta);
          }
        }
      } catch (_) {}
      await storage.touchGelenIfRevisable(recordId);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Kalem güncellenirken hata oluştu" });
    }
  });

  app.delete('/api/records/:id/items/:itemId', requireManager, async (req, res) => {
    const recordId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    // Release all hammadde reserves before deletion
    try {
      const record = await storage.getRecord(recordId);
      if (record && record.totalQuantity > 0) {
        const hammaddeList = await storage.getOrderItemHammadde(itemId);
        for (const h of hammaddeList) {
          const delta = Number(h.kullanim) * record.totalQuantity;
          await storage.adjustStokRezerve(h.stokItemId, -delta);
        }
        // Also release single-field hammadde if set
        const items = await storage.getOrderItems(recordId);
        const item = items.find(i => i.id === itemId);
        if (item?.stokItemId && item?.hammadeKullanim && hammaddeList.length === 0) {
          await storage.adjustStokRezerve(item.stokItemId, -Number(item.hammadeKullanim) * record.totalQuantity);
        }
      }
    } catch (_) {}
    await storage.deleteOrderItem(itemId);
    await storage.touchGelenIfRevisable(recordId);
    res.status(204).send();
  });

  // Multi-hammadde endpoints
  app.get('/api/records/:id/items-hammadde', requireActive, async (req, res) => {
    res.json(await storage.getOrderItemsHammaddeByRecord(Number(req.params.id)));
  });

  app.get('/api/records/:id/items/:itemId/hammadde', requireActive, async (req, res) => {
    res.json(await storage.getOrderItemHammadde(Number(req.params.itemId)));
  });

  app.post('/api/records/:id/items/:itemId/hammadde', requireManager, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const orderItemId = Number(req.params.itemId);
      const input = insertOrderItemHammaddeSchema.parse({ ...req.body, orderItemId });
      const created = await storage.createOrderItemHammadde(input);
      try {
        const [record, stokItem] = await Promise.all([
          storage.getRecord(recordId),
          storage.getStokItem(input.stokItemId),
        ]);
        if (record && stokItem && record.totalQuantity > 0) {
          const delta = Number(input.kullanim) * record.totalQuantity;
          await storage.adjustStokRezerve(input.stokItemId, delta);
          storage.createDepoHareketi({
            stokItemId: stokItem.id,
            stokAdi: stokItem.urunAdi,
            lot: stokItem.lot ?? null,
            birim: stokItem.birim,
            rezerveMiktar: delta,
            kaynak: 'hm',
            kaynakId: created.id,
            siparisId: record.id,
            siparisTitle: record.title,
            siparisLot: record.lotNumber ?? null,
          }).catch(() => {});
        }
      } catch (_) {}
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Hammadde eklenirken hata oluştu" });
    }
  });

  app.delete('/api/records/:id/items/:itemId/hammadde/:hammaddeId', requireManager, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const hammaddeId = Number(req.params.hammaddeId);
      // Release reserve before deletion
      const hammaddeList = await storage.getOrderItemHammadde(Number(req.params.itemId));
      const entry = hammaddeList.find(h => h.id === hammaddeId);
      if (entry) {
        const record = await storage.getRecord(recordId);
        if (record && record.totalQuantity > 0) {
          const delta = Number(entry.kullanim) * record.totalQuantity;
          await storage.adjustStokRezerve(entry.stokItemId, -delta);
        }
      }
      await storage.deleteOrderItemHammadde(hammaddeId);
      storage.deleteDepoHareketByKaynak('hm', hammaddeId).catch(() => {});
      res.status(204).send();
    } catch (_) {
      res.status(500).json({ message: "Hammadde silinirken hata oluştu" });
    }
  });

  // FIFO hammadde: alt_tur'a göre FIFO sırasında otomatik lot ataması
  app.post('/api/records/:id/items/:itemId/hammadde/fifo', requireManager, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const orderItemId = Number(req.params.itemId);
      const { altTur, kullanim } = req.body;
      if (!altTur || !kullanim || Number(kullanim) <= 0) {
        return res.status(400).json({ message: 'altTur ve kullanim gerekli' });
      }
      const kulanim = Number(kullanim);
      const record = await storage.getRecord(recordId);
      if (!record) return res.status(404).json({ message: 'Sipariş bulunamadı' });
      // Get the order item's unitQuantity (how many of this content per final product)
      const orderItems = await storage.getOrderItems(recordId);
      const orderItem = orderItems.find(i => i.id === orderItemId);
      const unitQty = orderItem?.unitQuantity ?? 1;
      const itemsPerBox = record.itemsPerBox || 1;
      // totalNeeded = kullanim per 1 item × unitQuantity × total individual items (totalQuantity × itemsPerBox)
      const totalItems = record.totalQuantity * itemsPerBox;
      const totalNeeded = kulanim * unitQty * totalItems;

      // Alt türe ait tüm stok kalemlerini FIFO sırasıyla getir
      const allLots = await storage.getStokItemsByAltTur(altTur);
      if (allLots.length === 0) {
        return res.status(404).json({ message: `"${altTur}" alt türünde stok kalemi bulunamadı` });
      }

      // FIFO: en eski girişten başla, serbest miktarı kullan
      let remaining = totalNeeded;
      const created: any[] = [];
      for (const lot of allLots) {
        if (remaining <= 0) break;
        const serbest = lot.miktar - (lot.rezerveMiktar ?? 0);
        if (serbest <= 0) continue;
        const fromThisLot = Math.min(remaining, serbest);
        // Store kullanim per totalQuantity unit (= per-item × itemsPerBox) so that
        // delete formula (kullanim × totalQuantity) correctly releases fromThisLot
        const lotKullanim = record.totalQuantity > 0 ? fromThisLot / record.totalQuantity : 0;
        if (lotKullanim <= 0) continue;
        const entry = await storage.createOrderItemHammadde({
          orderItemId,
          stokItemId: lot.id,
          kullanim: lotKullanim,
          altTur,
        });
        await storage.adjustStokRezerve(lot.id, fromThisLot);
        storage.createDepoHareketi({
          stokItemId: lot.id,
          stokAdi: lot.urunAdi,
          lot: lot.lot ?? null,
          birim: lot.birim,
          rezerveMiktar: fromThisLot,
          kaynak: 'hm',
          kaynakId: entry.id,
          siparisId: record.id,
          siparisTitle: record.title,
          siparisLot: record.lotNumber ?? null,
        }).catch(() => {});
        created.push({ ...entry, lot: lot.lot, urunAdi: lot.urunAdi, girisTarihi: lot.girisTarihi, birim: lot.birim });
        remaining -= fromThisLot;
      }

      const shortfall = remaining > 0 ? remaining : 0;
      res.status(201).json({ created, shortfall, totalNeeded, totalItems, altTur });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'FIFO hammadde eklenirken hata' });
    }
  });

  // Alt tür gruplama: bir alt türdeki tüm stok kalemlerini FIFO sırasında döndür
  app.get('/api/stok/alt-tur/:altTur', requireActive, async (req, res) => {
    try {
      const altTur = decodeURIComponent(req.params.altTur);
      const lots = await storage.getStokItemsByAltTur(altTur);
      const totalMiktar = lots.reduce((s, l) => s + l.miktar, 0);
      const totalRezeve = lots.reduce((s, l) => s + (l.rezerveMiktar ?? 0), 0);
      res.json({ altTur, lots, totalMiktar, totalRezeve, birim: lots[0]?.birim ?? 'adet' });
    } catch (_) {
      res.status(500).json({ message: 'Alt tür stok bilgisi alınamadı' });
    }
  });

  // Photo-only update endpoints (available to all active users)
  const RECORD_PHOTO_FIELDS = ['pastalPhotoUrl', 'urunIslemPhotoUrl', 'katlamaPhotoUrl', 'setToplamaPhotoUrl', 'kolilemePhotoUrl', 'sevkiyatPhotoUrl', 'sevkiyatZeosPhotoUrl', 'sterilizasyonPhotoUrl'];
  const ITEM_PHOTO_FIELDS   = ['pastalPhotoUrl', 'urunIslemPhotoUrl', 'katlamaPhotoUrl'];

  app.patch('/api/records/:id/photo-fields', requireActive, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const record = await storage.getRecord(id);
      if (!record) return res.status(404).json({ message: 'Sipariş bulunamadı' });
      const updates: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(req.body)) {
        if (RECORD_PHOTO_FIELDS.includes(k)) updates[k] = (v as string | null);
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'Geçerli alan bulunamadı' });
      res.json(await storage.updateRecord(id, updates as any));
    } catch (e) {
      res.status(500).json({ message: 'Fotoğraf güncellenemedi' });
    }
  });

  app.delete('/api/records/:id/photo/:field', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const field = req.params.field;
      if (!RECORD_PHOTO_FIELDS.includes(field)) return res.status(400).json({ message: 'Geçersiz alan' });
      await storage.updateRecord(id, { [field]: null } as any);
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ message: 'Fotoğraf silinemedi' });
    }
  });

  app.patch('/api/records/:id/items/:itemId/photo-fields', requireActive, async (req, res) => {
    try {
      const updates: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(req.body)) {
        if (ITEM_PHOTO_FIELDS.includes(k)) updates[k] = (v as string | null);
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'Geçerli alan bulunamadı' });
      res.json(await storage.updateOrderItem(Number(req.params.itemId), updates as any));
    } catch (e) {
      res.status(500).json({ message: 'Fotoğraf güncellenemedi' });
    }
  });

  app.delete('/api/records/:id/items/:itemId/photo/:field', requireManager, async (req, res) => {
    try {
      const field = req.params.field;
      if (!ITEM_PHOTO_FIELDS.includes(field)) return res.status(400).json({ message: 'Geçersiz alan' });
      await storage.updateOrderItem(Number(req.params.itemId), { [field]: null } as any);
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ message: 'Fotoğraf silinemedi' });
    }
  });

  // Item Library
  app.get('/api/item-library', requireActive, async (req, res) => {
    res.json(await storage.getItemLibrary());
  });

  app.post('/api/item-library', requireManager, async (req, res) => {
    try {
      res.status(201).json(await storage.createItemLibraryEntry(insertItemLibrarySchema.parse(req.body)));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if ((err as any).code === '23505') return res.status(400).json({ message: "Bu kalem zaten kütüphanede mevcut" });
      res.status(500).json({ message: "Kalem kütüphaneye eklenirken hata oluştu" });
    }
  });

  app.put('/api/item-library/:id', requireManager, async (req, res) => {
    try {
      res.json(await storage.updateItemLibraryEntry(Number(req.params.id), insertItemLibrarySchema.partial().parse(req.body)));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Güncelleme hatası" });
    }
  });

  app.delete('/api/item-library/:id', requireManager, async (req, res) => {
    await storage.deleteItemLibraryEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Customer Library
  app.get('/api/customer-library', requireActive, async (req, res) => {
    res.json(await storage.getCustomerLibrary());
  });

  app.post('/api/customer-library', requireManager, async (req, res) => {
    try {
      res.status(201).json(await storage.createCustomerLibraryEntry(insertCustomerLibrarySchema.parse(req.body)));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if ((err as any).code === '23505') return res.status(400).json({ message: "Bu müşteri zaten kütüphanede mevcut" });
      res.status(500).json({ message: "Müşteri eklenirken hata oluştu" });
    }
  });

  app.put('/api/customer-library/:id', requireManager, async (req, res) => {
    try {
      res.json(await storage.updateCustomerLibraryEntry(Number(req.params.id), insertCustomerLibrarySchema.partial().parse(req.body)));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if ((err as any).code === '23505') return res.status(400).json({ message: "Bu isimde bir müşteri zaten var" });
      res.status(500).json({ message: "Güncelleme hatası" });
    }
  });

  app.delete('/api/customer-library/:id', requireManager, async (req, res) => {
    await storage.deleteCustomerLibraryEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Order Title Library — saves (title, referenceId) pairs for quick fill on new orders
  app.get('/api/order-title-library', requireActive, async (req, res) => {
    res.json(await storage.getOrderTitleLibrary());
  });

  app.post('/api/order-title-library', requireManager, async (req, res) => {
    try {
      res.status(201).json(await storage.createOrderTitleLibraryEntry(insertOrderTitleLibrarySchema.parse(req.body)));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if ((err as any).code === '23505') return res.status(400).json({ message: "Bu sipariş başlığı zaten kütüphanede mevcut" });
      res.status(500).json({ message: "Sipariş başlığı eklenirken hata oluştu" });
    }
  });

  app.put('/api/order-title-library/:id', requireManager, async (req, res) => {
    try {
      res.json(await storage.updateOrderTitleLibraryEntry(Number(req.params.id), insertOrderTitleLibrarySchema.partial().parse(req.body)));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      if ((err as any).code === '23505') return res.status(400).json({ message: "Bu başlıkta bir kayıt zaten var" });
      res.status(500).json({ message: "Güncelleme hatası" });
    }
  });

  app.delete('/api/order-title-library/:id', requireManager, async (req, res) => {
    await storage.deleteOrderTitleLibraryEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Production Logs
  app.get('/api/records/:id/production-logs', requireActive, async (req, res) => {
    const phase = req.query.phase as string | undefined;
    res.json(await storage.getProductionLogs(Number(req.params.id), phase));
  });

  app.post('/api/records/:id/production-logs', requireActive, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const input = insertProductionLogSchema.parse({
        ...req.body,
        recordId,
        userId: req.session.userId,
      });
      const log = await storage.createProductionLog(input);
      // Set toplama tamamlandığında TÜM içeriklerin rezervleri orantılı düşülür.
      // deductStokKatlama LEAST(consumed, rezerve_miktar) ile çalıştığından çift tüketim olmaz.
      if (input.phase === 'set_toplama') {
        try {
          const record = await storage.getRecord(recordId);
          const orderTotalQty = record?.totalQuantity ?? 0;
          const orderItemsList = await storage.getOrderItems(recordId);
          const allHammadde = await storage.getOrderItemsHammaddeByRecord(recordId);
          // Bu set_toplama loguna kadar kaç adet işlendi (bu log hariç)
          const prevSetToplamaQty = await storage.getPrevPhaseQty(recordId, 'set_toplama', null, log.id);
          const remaining = Math.max(0, orderTotalQty - prevSetToplamaQty);
          const effectiveQty = Math.min(input.quantity, remaining);
          if (effectiveQty > 0) {
            // Tüm içerikler: fabricPhases fark etmeksizin hepsini işle
            for (const oi of orderItemsList) {
              const itemHammadde = allHammadde.filter(h => h.orderItemId === oi.id);
              for (const h of itemHammadde) {
                const consumed = Number(h.kullanim) * effectiveQty;
                await storage.deductStokKatlama(h.stokItemId, consumed);
              }
              // Legacy single-field hammadde
              if (itemHammadde.length === 0 && oi.stokItemId && oi.hammadeKullanim) {
                const consumed = Number(oi.hammadeKullanim) * effectiveQty;
                await storage.deductStokKatlama(oi.stokItemId, consumed);
              }
            }
          }
        } catch (_) {}
      }
      // Auto-update status to completed if all phases done
      try {
        await autoUpdateRecordStatus(recordId);
      } catch (_) {}

      // Auto-transfer to stock when urun_islem is complete for stok orders
      if (input.phase === 'urun_islem') {
        try {
          const record = await storage.getRecord(recordId);
          if (record && record.orderType === 'stok' && !record.stokTransferredAt) {
            const logs = await storage.getProductionLogs(recordId);
            const totalUrunIslem = logs
              .filter(l => l.phase === 'urun_islem')
              .reduce((sum, l) => sum + (l.quantity || 0), 0);
            if (totalUrunIslem >= record.totalQuantity) {
              await storage.transferToStock(recordId, req.session.userId!);
            }
          }
        } catch (_) {}
      }

      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Üretim kaydı eklenirken hata oluştu" });
    }
  });

  app.post('/api/records/:id/transfer-to-stock', requireManager, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const result = await storage.transferToStock(recordId, req.session.userId!);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Transfer hatası" });
    }
  });

  app.delete('/api/production-logs/:id', requireManager, async (req, res) => {
    const recordId = req.query.recordId ? Number(req.query.recordId) : null;
    await storage.deleteProductionLog(Number(req.params.id));
    if (recordId) {
      autoUpdateRecordStatus(recordId).catch(() => {});
    }
    res.status(204).send();
  });

  app.get('/api/records/weekly-target-summaries', requireActive, async (req, res) => {
    try {
      const idsRaw = String(req.query.ids ?? '');
      const ids = idsRaw
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n) && n > 0);
      const summaries = await storage.getWeeklyTargetSummariesForRecords(ids);
      res.json(summaries);
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? 'Özet alınamadı.' });
    }
  });

  app.get('/api/records/:id/weekly-target-summary', requireActive, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const excludeRaw = req.query.excludeItemId;
      const excludeItemId = excludeRaw != null && excludeRaw !== '' ? Number(excludeRaw) : null;
      const summary = await storage.getWeeklyTargetSummary(recordId, excludeItemId);
      res.json(summary);
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? 'Özet alınamadı.' });
    }
  });

  app.get('/api/records/:id/phase-summary', requireActive, async (req, res) => {
    try {
      const recordId = Number(req.params.id);
      const record = await storage.getRecord(recordId);
      if (!record) return res.status(404).json({ message: 'Sipariş bulunamadı' });

      const ALL_PHASE_DEFS = [
        { key: 'pastal',      label: 'Pastal',      usesKoli: false, perItem: true  },
        { key: 'urun_islem',  label: 'Ürün İşlem',  usesKoli: false, perItem: true  },
        { key: 'katlama',     label: 'Katlama',      usesKoli: false, perItem: true  },
        { key: 'set_toplama', label: 'Set Toplama',  usesKoli: false, perItem: false },
        { key: 'kolileme',    label: 'Kolileme',     usesKoli: true,  perItem: false },
        { key: 'sevkiyat',    label: 'Sevkiyat',     usesKoli: true,  perItem: false },
      ];
      const STOK_PHASE_KEYS = new Set(['pastal', 'urun_islem']);
      const PHASE_DEFS = (record as any).orderType === 'stok'
        ? ALL_PHASE_DEFS.filter(d => STOK_PHASE_KEYS.has(d.key))
        : ALL_PHASE_DEFS;

      const allUsers   = await storage.getUsers();
      const userMap    = new Map(allUsers.map(u => [u.id, u.displayName || u.username]));
      const recordLogs = await storage.getProductionLogs(recordId);
      const orderItems = await storage.getOrderItems(recordId);
      const boxesNeeded = Math.ceil(record.totalQuantity / (record.itemsPerBox || 1));

      const mapLog = (l: (typeof recordLogs)[0]) => ({
        id: l.id, quantity: l.quantity, notes: l.notes,
        completedAt: l.completedAt,
        username: userMap.get(l.userId) || `Kullanıcı #${l.userId}`,
      });

      const phases = PHASE_DEFS.map(def => {
        const phaseLogs = recordLogs.filter(l => l.phase === def.key);

        if (def.perItem) {
          // Per-item tracking:
          //  - Kumaş items: included by default (NULL fabricPhases = all phases). Opt out by setting
          //    fabricPhases to a list that excludes this key.
          //  - Diğer items: opt-in only when fabricPhases explicitly includes this key.
          const phaseItems = orderItems.filter(item => {
            if (item.category === 'Kumaş') {
              return !item.fabricPhases || item.fabricPhases.includes(def.key);
            }
            return !!item.fabricPhases && item.fabricPhases.includes(def.key);
          });
          if (phaseItems.length > 0) {
            const itemsData = phaseItems.map(item => {
              const itemLogs = phaseLogs
                .filter(l => l.orderItemId === item.id)
                .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
              const completed  = itemLogs.reduce((s, l) => s + l.quantity, 0);
              const itemTotal  = item.unitQuantity * record.totalQuantity;
              const pct        = itemTotal > 0 ? Math.min(100, Math.round((completed / itemTotal) * 100)) : 0;
              return { id: item.id, name: item.name, completed, pct, target: itemTotal };
            });
            const totalCompleted = itemsData.reduce((s, i) => s + i.completed, 0);
            const totalTarget    = phaseItems.reduce((s, i) => s + i.unitQuantity * record.totalQuantity, 0);
            const avgPct         = itemsData.length > 0 ? Math.round(itemsData.reduce((s, i) => s + i.pct, 0) / itemsData.length) : 0;
            const lastLog        = [...phaseLogs].sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())[0];
            return { key: def.key, label: def.label, target: totalTarget, unit: 'adet' as const, completed: totalCompleted, pct: avgPct, lastLog: lastLog ? mapLog(lastLog) : null };
          }
          // All kumaş items opted out of this phase — treat as N/A (completed)
          return { key: def.key, label: def.label, target: 0, unit: 'adet' as const, completed: 0, pct: 100, lastLog: null };
        }

        const target    = def.usesKoli ? boxesNeeded : record.totalQuantity;
        const unit      = def.usesKoli ? 'koli' as const : 'adet' as const;
        const sorted    = [...phaseLogs].sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
        const completed = sorted.reduce((s, l) => s + l.quantity, 0);
        const pct       = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
        return { key: def.key, label: def.label, target, unit, completed, pct, lastLog: sorted[0] ? mapLog(sorted[0]) : null };
      });

      const setToplamaPct = phases.find(p => p.key === 'set_toplama')?.pct ?? 0;
      const totalPct = setToplamaPct;
      res.json({ phases, totalPct });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: 'Faz verisi yüklenemedi' });
    }
  });

  app.get('/api/records/:id/photos', requireActive, async (req, res) => {
    const photos = await storage.getRecordPhotos(Number(req.params.id));
    res.json(photos);
  });

  app.post('/api/records/:id/photos', requireActive, async (req, res) => {
    const { photoUrl, caption } = req.body;
    if (!photoUrl) return res.status(400).json({ message: 'photoUrl is required' });
    const photo = await storage.addRecordPhoto({
      recordId: Number(req.params.id),
      photoUrl,
      caption: caption || null,
      uploadedBy: req.session.userId!,
    });
    res.status(201).json(photo);
  });

  app.delete('/api/records/:id/photos/:photoId', requireActive, async (req, res) => {
    await storage.deleteRecordPhoto(Number(req.params.photoId));
    res.status(204).send();
  });

  // FIFO order update (admin only)
  app.patch('/api/records/:id/fifo-order', requireManager, async (req, res) => {
    const id = Number(req.params.id);
    const requester = await storage.getUser(req.session.userId!);
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ message: 'Yalnızca yönetici FIFO sırasını değiştirebilir' });
    }
    const { fifoOrder } = req.body;
    await storage.updateFifoOrder(id, fifoOrder === null ? null : Number(fifoOrder));
    res.json({ ok: true });
  });

  // Production target update (admin only)
  app.patch('/api/records/:id/production-target', requireManager, async (req, res) => {
    const id = Number(req.params.id);
    const requester = await storage.getUser(req.session.userId!);
    if (!requester || requester.role !== 'admin') {
      return res.status(403).json({ message: 'Yalnızca yönetici üretim hedefini değiştirebilir' });
    }
    const { productionTarget } = req.body;
    await storage.updateProductionTarget(id, productionTarget === null || productionTarget === '' ? null : Number(productionTarget));
    res.json({ ok: true });
  });

  // Record production totals for dashboard
  app.get('/api/dashboard/record-totals', requireActive, async (req, res) => {
    res.json(await storage.getRecordProductionTotals());
  });

  app.get('/api/dashboard/daily-totals', requireActive, async (req, res) => {
    const { productionLogs } = await import('@shared/schema');
    const { sql: drizzleSql, gte, lt, eq } = await import('drizzle-orm');
    const { db } = await import('./db');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const rows = await db
      .select({
        recordId: productionLogs.recordId,
        total: drizzleSql<number>`COALESCE(SUM(${productionLogs.quantity}), 0)::int`,
      })
      .from(productionLogs)
      .where(
        drizzleSql`${productionLogs.phase} = 'set_toplama'
          AND ${productionLogs.completedAt} >= ${todayStart.toISOString()}
          AND ${productionLogs.completedAt} < ${tomorrowStart.toISOString()}`
      )
      .groupBy(productionLogs.recordId);
    res.json(rows.map(r => ({ recordId: r.recordId, todayTotal: Number(r.total) })));
  });

  // This week's active productions (any phase logged this week, independent of weekly plan)
  app.get('/api/dashboard/weekly-active', requireActive, async (req, res) => {
    const { productionLogs, productionRecords } = await import('@shared/schema');
    const { sql: drizzleSql, inArray } = await import('drizzle-orm');
    const { db } = await import('./db');
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const weekEnd = new Date(monday);
    weekEnd.setDate(monday.getDate() + 7);

    const logs = await db
      .select({
        recordId: productionLogs.recordId,
        phase: productionLogs.phase,
        quantity: drizzleSql<number>`COALESCE(SUM(${productionLogs.quantity}), 0)::int`,
      })
      .from(productionLogs)
      .where(drizzleSql`${productionLogs.completedAt} >= ${monday.toISOString()} AND ${productionLogs.completedAt} < ${weekEnd.toISOString()}`)
      .groupBy(productionLogs.recordId, productionLogs.phase);

    if (logs.length === 0) return res.json([]);

    const recordIds = [...new Set(logs.map(l => l.recordId))];
    const records = await db.select().from(productionRecords).where(inArray(productionRecords.id, recordIds));

    const phaseTotals: Record<number, Record<string, number>> = {};
    for (const log of logs) {
      if (!phaseTotals[log.recordId]) phaseTotals[log.recordId] = {};
      phaseTotals[log.recordId][log.phase] = Number(log.quantity);
    }

    const result = records.map(r => ({
      recordId: r.id,
      title: r.title,
      lotNumber: r.lotNumber,
      customer: r.customer,
      status: r.status,
      priority: r.priority,
      orderType: r.orderType,
      itemsPerBox: r.itemsPerBox,
      updatedAt: r.updatedAt,
      phaseTotals: phaseTotals[r.id] ?? {},
    }));

    // Sort by most recent first (largest total activity)
    result.sort((a, b) => {
      const sumA = Object.values(a.phaseTotals).reduce((s, v) => s + v, 0);
      const sumB = Object.values(b.phaseTotals).reduce((s, v) => s + v, 0);
      return sumB - sumA;
    });

    res.json(result);
  });

  // Faz Takibi — per-phase order breakdown with status classification
  app.get('/api/faz-takibi', requireActive, async (req, res) => {
    const { productionLogs, productionRecords, users } = await import('@shared/schema');
    const { sql: drizzleSql } = await import('drizzle-orm');
    const { db } = await import('./db');

    const period = (req.query.period as string) || 'weekly';
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const now = new Date();
    let since: Date;
    let until: Date | null = null;

    if (dateFrom) {
      // Custom date/range mode
      since = new Date(dateFrom + 'T00:00:00');
      if (dateTo) {
        until = new Date(dateTo + 'T23:59:59.999');
      } else {
        // Single day: end of that day
        until = new Date(dateFrom + 'T23:59:59.999');
      }
    } else if (period === 'daily') {
      since = new Date(now);
      since.setHours(0, 0, 0, 0);
    } else if (period === 'monthly') {
      since = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      // weekly — Monday of current week
      since = new Date(now);
      const day = since.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      since.setDate(since.getDate() + diff);
      since.setHours(0, 0, 0, 0);
    }

    // Get all logs in the period with user name
    const rows = await db.execute(drizzleSql`
      SELECT
        pl.id,
        pl.record_id,
        pl.phase,
        pl.quantity,
        pl.completed_at,
        COALESCE(u.display_name, u.username) AS user_name,
        pr.title,
        pr.lot_number,
        pr.customer,
        pr.status,
        pr.priority,
        pr.order_type
      FROM production_logs pl
      JOIN production_records pr ON pr.id = pl.record_id
      JOIN users u ON u.id = pl.user_id
      WHERE pl.completed_at >= ${since.toISOString()}
        ${until ? drizzleSql`AND pl.completed_at <= ${until.toISOString()}` : drizzleSql``}
      ORDER BY pl.completed_at DESC
    `);

    const PHASES = [
      { key: 'pastal',      label: 'Pastal',     unit: 'adet' },
      { key: 'urun_islem',  label: 'Ürün İşlem', unit: 'adet' },
      { key: 'katlama',     label: 'Katlama',    unit: 'adet' },
      { key: 'set_toplama', label: 'Set Toplama', unit: 'adet' },
      { key: 'kolileme',    label: 'Kolileme',   unit: 'koli' },
      { key: 'sevkiyat',    label: 'Sevkiyat',   unit: 'koli' },
    ];

    type RecordEntry = {
      recordId: number;
      title: string;
      lotNumber: string | null;
      customer: string | null;
      status: string;
      priority: string | null;
      orderType: string | null;
      quantity: number;
      lastActivity: string | null;
      lastUserName: string | null;
    };

    const phaseMap = new Map<string, Map<number, RecordEntry>>();

    for (const row of (rows as any).rows as any[]) {
      const phase = row.phase as string;
      if (!phaseMap.has(phase)) phaseMap.set(phase, new Map());
      const recMap = phaseMap.get(phase)!;
      const rid = Number(row.record_id);
      if (!recMap.has(rid)) {
        recMap.set(rid, {
          recordId: rid,
          title: row.title,
          lotNumber: row.lot_number ?? null,
          customer: row.customer ?? null,
          status: row.status,
          priority: row.priority ?? null,
          orderType: row.order_type ?? null,
          quantity: 0,
          lastActivity: null,
          lastUserName: null,
        });
      }
      const entry = recMap.get(rid)!;
      entry.quantity += Number(row.quantity);
      const ts = row.completed_at ? new Date(row.completed_at).toISOString() : null;
      if (ts && (!entry.lastActivity || ts > entry.lastActivity)) {
        entry.lastActivity = ts;
        entry.lastUserName = row.user_name ?? null;
      }
    }

    const result = PHASES
      .filter(p => phaseMap.has(p.key))
      .map(p => {
        const records = Array.from(phaseMap.get(p.key)!.values());
        records.sort((a, b) => {
          if ((b.lastActivity ?? '') > (a.lastActivity ?? '')) return 1;
          if ((b.lastActivity ?? '') < (a.lastActivity ?? '')) return -1;
          return 0;
        });
        const totalQty = records.reduce((s, r) => s + r.quantity, 0);
        return { key: p.key, label: p.label, unit: p.unit, totalQty, records };
      });

    res.json(result);
  });

  // Phase production table for dashboard
  app.get('/api/dashboard/phase-table', requireActive, async (req, res) => {
    const period = (req.query.period as string) || 'weekly';
    const now = new Date();
    let since: Date;
    if (period === 'daily') {
      since = new Date(now);
      since.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
      // Monday of current week
      since = new Date(now);
      const day = since.getDay(); // 0=Sun, 1=Mon...
      const diff = (day === 0 ? -6 : 1 - day);
      since.setDate(since.getDate() + diff);
      since.setHours(0, 0, 0, 0);
    } else if (period === 'monthly') {
      since = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      since = new Date(now.getFullYear(), 0, 1);
    }
    const data = await storage.getPhaseTable(since);
    res.json(data);
  });

  // Recent phase activity for dashboard (last N entries per phase).
  // Photos are NOT inlined; clients fetch them on-demand via /api/photo using
  // photoTable/photoId/photoField. This keeps the polling payload small.
  app.get('/api/dashboard/recent-phase-activity', requireActive, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    const data = await storage.getRecentActivityByPhase(limit);
    res.json(data);
  });

  // Generic on-demand photo endpoint with strict whitelist.
  // Returns the raw image bytes (decoded from stored data URI) so it can be used
  // directly as an <img src>. Falls back to JSON {photoUrl} if ?json=1 is passed.
  app.get('/api/photo/:table/:id/:field', requireActive, async (req, res) => {
    try {
      const { table, id, field } = req.params;
      const cfg = PHOTO_TABLE_FIELDS[table];
      if (!cfg) return res.status(404).json({ message: 'Tablo bulunamadı' });
      const column = cfg.fields[field];
      if (!column) return res.status(404).json({ message: 'Alan bulunamadı' });
      const numId = Number(id);
      if (!Number.isFinite(numId) || numId <= 0) return res.status(400).json({ message: 'Geçersiz id' });

      const wantThumb = req.query.thumb === '1';
      const thumbColumn = wantThumb ? cfg.thumbFields?.[field] : undefined;

      const { db } = await import('./db');
      const { sql: drizzleSql } = await import('drizzle-orm');
      // Identifiers are whitelisted constants; id is parameterized via drizzle sql tag.
      const selectCols = thumbColumn
        ? drizzleSql.raw(`"${thumbColumn}" AS thumb, "${column}" AS photo`)
        : drizzleSql.raw(`"${column}" AS photo`);
      const result = await db.execute(
        drizzleSql`SELECT ${selectCols} FROM ${drizzleSql.raw(`"${cfg.table}"`)} WHERE id = ${numId} LIMIT 1`
      );
      const row = (result as any).rows?.[0];
      if (!row) return res.status(404).json({ message: 'Kayıt bulunamadı' });
      // Prefer thumbnail when requested and available; fall back to full photo.
      const photo: string | null = (wantThumb && row.thumb) ? row.thumb : (row.photo ?? null);

      // Photo missing: don't set cache headers / ETag — 304 on absent content
      // would be semantically wrong. Match the legacy behaviour exactly.
      if (!photo) {
        if (req.query.json === '1') return res.json({ photoUrl: null });
        return res.status(404).end();
      }

      // Content-based ETag: SHA1 of the stored photo string. Fast (~10ms for 1MB)
      // and changes automatically when the photo is re-uploaded, so cached copies
      // are invalidated correctly. Tag also encodes the variant (full vs thumb)
      // and the response shape (binary vs json) so the two response types don't
      // share a single cache key by accident.
      const variant = (wantThumb && row.thumb) ? 't' : 'f';
      const shape = req.query.json === '1' ? 'j' : 'b';
      const etag = `W/"${variant}${shape}-${createHash('sha1').update(photo).digest('base64').slice(0, 22)}"`;

      // Browser caches the bytes for 5 minutes. After that it revalidates with
      // If-None-Match, which lets us short-circuit with 304 Not Modified.
      res.set('Cache-Control', 'private, max-age=300, must-revalidate');
      res.set('ETag', etag);

      if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
        return res.status(304).end();
      }

      if (req.query.json === '1') {
        return res.json({ photoUrl: photo });
      }

      // Stored as data URI (e.g. "data:image/jpeg;base64,...")
      const m = /^data:([^;]+);base64,(.+)$/.exec(photo);
      if (!m) {
        // Not a data URI — return as-is in JSON so client can use directly.
        return res.json({ photoUrl: photo });
      }
      const mime = m[1];
      const buf = Buffer.from(m[2], 'base64');
      res.set('Content-Type', mime);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // Weekly production plans
  app.get('/api/weekly-plans', requireActive, async (req, res) => {
    res.json(await storage.getAllWeeklyPlans());
  });

  app.get('/api/weekly-plans/by-week', requireActive, async (req, res) => {
    const weekStart = req.query.weekStart as string;
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return res.status(400).json({ message: 'weekStart parametresi gerekli (YYYY-MM-DD formatında).' });
    }
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const currentMonday = monday.toISOString().slice(0, 10);
    if (weekStart < currentMonday) {
      const plan = await storage.getWeeklyPlanByWeekStart(weekStart);
      if (!plan) return res.json(null);
      const data = await storage.getWeeklyPlanWithItems(plan.id);
      return res.json(data);
    }
    const existing = await storage.getWeeklyPlanByWeekStart(weekStart);
    const plan = existing ?? await storage.getOrCreateWeeklyPlan(weekStart, req.session.userId!);
    let autoCarried = 0;
    // Run auto-carry for current and future weeks if not yet done
    if (!plan.autoCarriedAt && weekStart >= currentMonday) {
      const prevPlan = await storage.getMostRecentPastPlan(weekStart);
      if (prevPlan) {
        const result = await storage.carryForwardIncompleteItems(prevPlan.id, plan.id);
        autoCarried = result.carried;
      }
      await storage.markAutoCarried(plan.id);
    }
    const data = await storage.getWeeklyPlanWithItems(plan.id);
    res.json({ ...data, autoCarried });
  });

  app.post('/api/weekly-plans/:planId/carry-forward', requireManager, async (req, res) => {
    const planId = Number(req.params.planId);
    const { fromPlanId } = req.body;
    if (!fromPlanId) return res.status(400).json({ message: 'fromPlanId gerekli' });
    try {
      const result = await storage.carryForwardIncompleteItems(Number(fromPlanId), planId);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get('/api/weekly-plans/current', requireActive, async (req, res) => {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const weekStart = monday.toISOString().slice(0, 10);
    const plan = await storage.getOrCreateWeeklyPlan(weekStart, req.session.userId!);
    const data = await storage.getWeeklyPlanWithItems(plan.id);
    // Fire-and-forget: auto-update status for all in-progress records in the plan
    if (data?.items?.length) {
      const uniqueIds = [...new Set(data.items.map((i: any) => i.recordId).filter(Boolean))];
      Promise.all(uniqueIds.map((id: any) => autoUpdateRecordStatus(id).catch(() => {}))).catch(() => {});
    }
    res.json(data);
  });

  app.post('/api/weekly-plans/:id/items', requireManager, async (req, res) => {
    const planId = Number(req.params.id);
    const { recordId, targetQuantity } = req.body;
    try {
      const item = await storage.addWeeklyPlanItem(planId, Number(recordId), Number(targetQuantity));
      res.json(item);
    } catch (e: any) {
      if (e?.code === 'WEEKLY_TARGET_EXCEEDS_TOTAL') {
        return res.status(400).json({
          code: 'WEEKLY_TARGET_EXCEEDS_TOTAL',
          message: e.message,
          remaining: e.remaining,
          totalQuantity: e.totalQuantity,
        });
      }
      res.status(400).json({ message: 'Bu sipariş bu haftaki plana zaten eklenmiş.' });
    }
  });

  app.patch('/api/weekly-plans/items/:itemId', requireManager, async (req, res) => {
    try {
      await storage.updateWeeklyPlanItem(Number(req.params.itemId), Number(req.body.targetQuantity));
      res.json({ ok: true });
    } catch (e: any) {
      if (e?.code === 'WEEKLY_TARGET_EXCEEDS_TOTAL') {
        return res.status(400).json({
          code: 'WEEKLY_TARGET_EXCEEDS_TOTAL',
          message: e.message,
          remaining: e.remaining,
          totalQuantity: e.totalQuantity,
        });
      }
      res.status(400).json({ message: e?.message ?? 'Hedef güncellenemedi.' });
    }
  });

  app.delete('/api/weekly-plans/items/:itemId', requireManager, async (req, res) => {
    await storage.deleteWeeklyPlanItem(Number(req.params.itemId));
    res.json({ ok: true });
  });

  app.get('/api/production-logs', requireActive, async (req, res) => {
    const phase = req.query.phase as string | undefined;
    res.json(await storage.getProductionLogs(undefined, phase));
  });

  // Helper: recalculate and auto-update record status
  async function autoUpdateRecordStatus(recordId: number) {
    const record = await storage.getRecord(recordId);
    if (!record || record.status === 'completed') return;
    const allLogs = await storage.getProductionLogs(recordId);
    const items = await storage.getOrderItems(recordId);
    const hasKumas = items.some(i => i.category === 'Kumaş');

    const PHASE_DEFS = [
      { key: 'pastal', usesKoli: false, perItem: true },
      { key: 'urun_islem', usesKoli: false, perItem: true },
      { key: 'katlama', usesKoli: false, perItem: true },
      { key: 'set_toplama', usesKoli: false, perItem: false },
      { key: 'kolileme', usesKoli: true, perItem: false },
      { key: 'sevkiyat', usesKoli: true, perItem: false },
    ];
    const boxesNeeded = Math.ceil(record.totalQuantity / (record.itemsPerBox || 1));

    let phasesFullyDone = 0;
    for (const def of PHASE_DEFS) {
      let pct = 0;
      if (def.perItem) {
        // Per-item completion: Kumaş items default-in (opt-out via fabricPhases without this key);
        // Diğer items opt-in only when fabricPhases explicitly includes this key.
        const phaseItems = items.filter(item => {
          if (item.category === 'Kumaş') {
            return !item.fabricPhases || item.fabricPhases.includes(def.key);
          }
          return !!item.fabricPhases && item.fabricPhases.includes(def.key);
        });
        if (phaseItems.length > 0) {
          const itemPcts = phaseItems.map(item => {
            const completed = allLogs
              .filter(l => l.phase === def.key && l.orderItemId === item.id)
              .reduce((s, l) => s + l.quantity, 0);
            const itemTotal = item.unitQuantity * record.totalQuantity;
            return itemTotal > 0 ? Math.min(100, Math.round((completed / itemTotal) * 100)) : 0;
          });
          pct = itemPcts.length > 0 ? Math.round(itemPcts.reduce((s, p) => s + p, 0) / itemPcts.length) : 0;
          if (pct >= 100) phasesFullyDone++;
          continue;
        }
        if (hasKumas) {
          // All kumaş items opted out of this phase and no Diğer items opted in — count it as done
          phasesFullyDone++;
          continue;
        }
        // No items opted into this per-item phase — fall through to aggregate tracking below
      }
      {
        const target = def.usesKoli ? boxesNeeded : record.totalQuantity;
        const completed = allLogs.filter(l => l.phase === def.key).reduce((s, l) => s + l.quantity, 0);
        pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
      }
      if (pct >= 100) phasesFullyDone++;
    }

    if (phasesFullyDone === 6) {
      await storage.updateRecord(recordId, { status: 'completed' });
      try {
        await consumeRemainingReservesForRecord(recordId);
      } catch (_) {}
      storage.deleteDepoHareketBySiparis(recordId).catch(() => {});
    }
  }

  // Sipariş tamamlandığında rezervden kalan miktarları otomatik harca
  async function consumeRemainingReservesForRecord(recordId: number) {
    const record = await storage.getRecord(recordId);
    if (!record) return;
    const totalQty = record.totalQuantity;
    const orderItemsList = await storage.getOrderItems(recordId);
    const allHammadde = await storage.getOrderItemsHammaddeByRecord(recordId);

    for (const oi of orderItemsList) {
      const itemHammadde = allHammadde.filter(h => h.orderItemId === oi.id);
      for (const h of itemHammadde) {
        const fullConsumed = Number(h.kullanim) * totalQty;
        if (fullConsumed > 0) await storage.deductStokKatlama(h.stokItemId, fullConsumed);
      }
      // Legacy single-field hammadde
      if (itemHammadde.length === 0 && oi.stokItemId && oi.hammadeKullanim) {
        const fullConsumed = Number(oi.hammadeKullanim) * totalQty;
        if (fullConsumed > 0) await storage.deductStokKatlama(oi.stokItemId, fullConsumed);
      }
    }

  }

  // Production Summary — for Anlık Üretim page
  app.get('/api/production-summary', requireActive, async (req, res) => {
    try {
      const allRecords = await storage.getRecords();
      const activeRecords = allRecords.filter(r => r.priority !== 'pasif' && r.status !== 'completed');

      activeRecords.sort((a, b) => {
        if (a.priority === 'acil' && b.priority !== 'acil') return -1;
        if (a.priority !== 'acil' && b.priority === 'acil') return 1;
        const da = a.orderDate ? new Date(a.orderDate).getTime() : new Date(a.createdAt || 0).getTime();
        const db2 = b.orderDate ? new Date(b.orderDate).getTime() : new Date(b.createdAt || 0).getTime();
        return da - db2;
      });

      const allUsers = await storage.getUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u.displayName || u.username]));
      const allLogs = await storage.getProductionLogs();

      const PHASE_DEFS = [
        { key: 'pastal',       label: 'Pastal',       usesKoli: false, perItem: true  },
        { key: 'urun_islem',   label: 'Ürün İşlem',   usesKoli: false, perItem: true  },
        { key: 'katlama',      label: 'Katlama',       usesKoli: false, perItem: true  },
        { key: 'set_toplama',  label: 'Set Toplama',   usesKoli: false, perItem: false },
        { key: 'kolileme',     label: 'Kolileme',      usesKoli: true,  perItem: false },
        { key: 'sevkiyat',     label: 'Sevkiyat',      usesKoli: true,  perItem: false },
      ];

      const summary = await Promise.all(activeRecords.map(async record => {
        const boxesNeeded = Math.ceil(record.totalQuantity / (record.itemsPerBox || 1));
        const orderItems = await storage.getOrderItems(record.id);
        const hasKumas = orderItems.some(i => i.category === 'Kumaş');

        const recordLogs = allLogs.filter(l => l.recordId === record.id);

        const mapLog = (l: typeof recordLogs[0]) => ({
          id: l.id,
          quantity: l.quantity,
          notes: l.notes,
          completedAt: l.completedAt,
          username: userMap.get(l.userId) || `Kullanıcı #${l.userId}`,
        });

        const phases = PHASE_DEFS.map(def => {
          const phaseLogs = recordLogs.filter(l => l.phase === def.key);

          if (def.perItem) {
            // Per-item tracking:
            //  - Kumaş items: tracked by default; opt out by setting fabricPhases without this key
            //  - Diğer items: opt-in only when fabricPhases explicitly includes this key
            const phaseItems = orderItems.filter(item => {
              if (item.category === 'Kumaş') {
                return !item.fabricPhases || item.fabricPhases.includes(def.key);
              }
              return !!item.fabricPhases && item.fabricPhases.includes(def.key);
            });
            if (phaseItems.length > 0) {
              const itemsData = phaseItems.map(item => {
                const itemLogs = phaseLogs
                  .filter(l => l.orderItemId === item.id)
                  .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
                const completed = itemLogs.reduce((s, l) => s + l.quantity, 0);
                const itemTotal = item.unitQuantity * record.totalQuantity;
                const pct = itemTotal > 0 ? Math.min(100, Math.round((completed / itemTotal) * 100)) : 0;
                const lastLog = itemLogs[0] ? mapLog(itemLogs[0]) : null;
                return {
                  id: item.id,
                  name: item.name,
                  unitQuantity: item.unitQuantity,
                  target: itemTotal,
                  category: item.category,
                  completed,
                  pct,
                  pastalPhotoUrl: item.pastalPhotoUrl || null,
                  urunIslemPhotoUrl: item.urunIslemPhotoUrl || null,
                  katlamaPhotoUrl: item.katlamaPhotoUrl || null,
                  lastLog,
                  allLogs: itemLogs.slice(0, 10).map(mapLog),
                };
              });

              const totalCompleted = itemsData.reduce((s, i) => s + i.completed, 0);
              const totalTarget = phaseItems.reduce((s, i) => s + i.unitQuantity * record.totalQuantity, 0);
              const avgPct = itemsData.length > 0
                ? Math.round(itemsData.reduce((s, i) => s + i.pct, 0) / itemsData.length)
                : 0;
              const lastLog = [...phaseLogs].sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())[0];

              return {
                key: def.key,
                label: def.label,
                target: totalTarget,
                unit: 'adet' as const,
                completed: totalCompleted,
                pct: avgPct,
                lastLog: lastLog ? mapLog(lastLog) : null,
                allLogs: phaseLogs.slice(0, 10).map(mapLog),
                items: itemsData,
              };
            }
            // All kumaş items opted out of this phase — treat as N/A (completed)
            return {
              key: def.key,
              label: def.label,
              target: 0,
              unit: 'adet' as const,
              completed: 0,
              pct: 100,
              lastLog: null,
              allLogs: [],
              items: [],
            };
          }

          // Standard aggregate tracking
          const target = def.usesKoli ? boxesNeeded : record.totalQuantity;
          const unit = def.usesKoli ? 'koli' as const : 'adet' as const;
          const sorted = [...phaseLogs].sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
          const completed = sorted.reduce((s, l) => s + l.quantity, 0);
          const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
          const lastLog = sorted[0] || null;

          const base = {
            key: def.key,
            label: def.label,
            target,
            unit,
            completed,
            pct,
            lastLog: lastLog ? mapLog(lastLog) : null,
            allLogs: sorted.slice(0, 10).map(mapLog),
          };

          if (def.key === 'set_toplama') {
            return {
              ...base,
              allOrderItems: orderItems.map(i => ({
                id: i.id,
                name: i.name,
                unitQuantity: i.unitQuantity,
                category: i.category,
              })),
            };
          }

          return base;
        });

        const setToplamaPct = phases.find(p => p.key === 'set_toplama')?.pct ?? 0;
        const totalPct = setToplamaPct;
        const phasesFullyDone = phases.filter(p => p.pct >= 100).length;

        // Auto-update status when all phases complete and exclude from response immediately
        if (phasesFullyDone === 6) {
          if (record.status !== 'completed') {
            await storage.updateRecord(record.id, { status: 'completed' });
          }
          return null;
        }

        return { record, phases, totalPct, phasesFullyDone, hasKumas };
      }));

      res.json(summary.filter(Boolean));
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Özet yüklenemedi" });
    }
  });

  // Completed Orders Summary
  app.get('/api/completed-summary', requireActive, async (req, res) => {
    try {
      const allRecords = await storage.getRecords({ status: 'completed' });

      allRecords.sort((a, b) => {
        const da = a.orderDate ? new Date(a.orderDate).getTime() : new Date(a.createdAt || 0).getTime();
        const db2 = b.orderDate ? new Date(b.orderDate).getTime() : new Date(b.createdAt || 0).getTime();
        return db2 - da;
      });

      const allUsers = await storage.getUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u.displayName || u.username]));
      const allLogs = await storage.getProductionLogs();

      // Fetch all order items for completed records
      const recordIds = allRecords.map(r => r.id);
      const allOrderItems = recordIds.length > 0
        ? await storage.getOrderItemsByRecordIds(recordIds)
        : [];
      const orderItemsByRecord: Record<number, typeof allOrderItems> = {};
      for (const oi of allOrderItems) {
        if (!orderItemsByRecord[oi.recordId]) orderItemsByRecord[oi.recordId] = [];
        orderItemsByRecord[oi.recordId].push(oi);
      }

      const PHASE_DEFS = [
        { key: 'pastal',       label: 'Pastal',       usesKoli: false, perItem: true  },
        { key: 'urun_islem',   label: 'Ürün İşlem',   usesKoli: false, perItem: true  },
        { key: 'katlama',      label: 'Katlama',       usesKoli: false, perItem: true  },
        { key: 'set_toplama',  label: 'Set Toplama',   usesKoli: false, perItem: false },
        { key: 'kolileme',     label: 'Kolileme',      usesKoli: true,  perItem: false },
        { key: 'sevkiyat',     label: 'Sevkiyat',      usesKoli: true,  perItem: false },
      ];

      const summary = allRecords.map(record => {
        const boxesNeeded = Math.ceil(record.totalQuantity / (record.itemsPerBox || 1));
        const recordLogs = allLogs.filter(l => l.recordId === record.id);
        const recItems = orderItemsByRecord[record.id] ?? [];
        const hasKumas = recItems.some(i => i.category === 'Kumaş');

        const phases = PHASE_DEFS.map(def => {
          let target: number;
          if (def.usesKoli) {
            target = boxesNeeded;
          } else if (def.perItem) {
            // Target = sum of items' unitQuantity that include this phase × totalQuantity.
            //  - Kumaş items: included by default (NULL fabricPhases = all phases)
            //  - Diğer items: opt-in only when fabricPhases explicitly includes this key
            const relevant = recItems.filter(i => {
              if (i.category === 'Kumaş') {
                return i.fabricPhases == null || (i.fabricPhases as string[]).includes(def.key);
              }
              return Array.isArray(i.fabricPhases) && (i.fabricPhases as string[]).includes(def.key);
            });
            if (relevant.length > 0) {
              target = relevant.reduce((s, i) => s + (i.unitQuantity ?? 1), 0) * record.totalQuantity;
            } else {
              target = record.totalQuantity;
            }
          } else {
            target = record.totalQuantity;
          }

          const unit = def.usesKoli ? 'koli' as const : 'adet' as const;
          const phaseLogs = recordLogs.filter(l => l.phase === def.key);
          const completed = phaseLogs.reduce((s, l) => s + l.quantity, 0);
          const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 100;
          const lastLog = [...phaseLogs].sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())[0];

          return {
            key: def.key,
            label: def.label,
            target,
            unit,
            completed,
            pct,
            lastLog: lastLog ? {
              id: lastLog.id,
              quantity: lastLog.quantity,
              notes: lastLog.notes,
              completedAt: lastLog.completedAt,
              username: userMap.get(lastLog.userId) || `Kullanıcı #${lastLog.userId}`,
            } : null,
            allLogs: [],
          };
        });

        const totalPct = 100;
        const phasesFullyDone = 6;

        return { record, phases, totalPct, phasesFullyDone, hasKumas };
      });

      res.json(summary);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Özet yüklenemedi" });
    }
  });

  // Seed
  // ---- Samples (Numuneler) CRUD ----
  app.get('/api/samples', requireActive, async (req, res) => {
    const search = req.query.search as string | undefined;
    const items = await storage.getSamples(search ? { search } : undefined);
    res.json(stripPhotosArray(items as any[], 'samples'));
  });

  app.get('/api/samples/:id', requireActive, async (req, res) => {
    const item = await storage.getSample(Number(req.params.id));
    if (!item) return res.status(404).json({ message: 'Numune bulunamadı' });
    res.json(item);
  });

  app.post('/api/samples', requireManager, async (req, res) => {
    try {
      const { insertSampleSchema } = await import('@shared/schema');
      const data = insertSampleSchema.parse({ ...req.body, createdBy: req.session.userId });
      const item = await storage.createSample(data);
      res.status(201).json(item);
    } catch (err: any) {
      if (err?.errors) return res.status(400).json({ message: err.errors[0]?.message || 'Geçersiz veri' });
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.put('/api/samples/:id', requireManager, async (req, res) => {
    try {
      const item = await storage.updateSample(Number(req.params.id), req.body);
      res.json(item);
    } catch {
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.delete('/api/samples/:id', requireManager, async (req, res) => {
    await storage.deleteSample(Number(req.params.id));
    res.status(204).send();
  });

  app.get('/api/samples/:id/photos', requireActive, async (req, res) => {
    const photos = await storage.getSamplePhotos(Number(req.params.id));
    // Strip large base64 photoUrl from the list payload; clients fetch on-demand
    // via /api/photo/sample_photos/:id/photoUrl using the hasPhoto flag.
    res.json(photos.map(p => ({
      ...p,
      hasPhoto: !!(p.photoUrl && p.photoUrl.length > 0),
      photoUrl: null,
    })));
  });

  app.post('/api/samples/:id/photos', requireActive, async (req, res) => {
    const { photoUrl, caption } = req.body;
    if (!photoUrl) return res.status(400).json({ message: 'photoUrl is required' });
    const photo = await storage.addSamplePhoto({
      sampleId: Number(req.params.id),
      photoUrl,
      caption: caption || null,
      uploadedBy: req.session.userId!,
    });
    res.status(201).json(photo);
  });

  // Sample Items (numune içerikleri)
  app.get('/api/samples/:id/items', requireActive, async (req, res) => {
    const items = await storage.getSampleItems(Number(req.params.id));
    // Strip photoUrl; clients fetch on-demand via /api/photo/sample_items/:id/photoUrl.
    res.json(items.map(it => ({
      ...it,
      hasPhoto: !!(it.photoUrl && it.photoUrl.length > 0),
      photoUrl: null,
    })));
  });

  app.post('/api/samples/:id/items', requireManager, async (req, res) => {
    try {
      const { insertSampleItemSchema } = await import('@shared/schema');
      const sampleId = Number(req.params.id);
      const input = insertSampleItemSchema.parse({ ...req.body, sampleId });
      const item = await storage.createSampleItem(input);
      res.status(201).json(item);
    } catch (err: any) {
      if (err?.errors) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: 'İçerik eklenemedi' });
    }
  });

  app.put('/api/samples/:id/items/:itemId', requireManager, async (req, res) => {
    try {
      const { insertSampleItemSchema } = await import('@shared/schema');
      const parsed = insertSampleItemSchema.partial().parse(req.body);
      const updated = await storage.updateSampleItem(Number(req.params.itemId), parsed);
      res.json(updated);
    } catch (err: any) {
      if (err?.errors) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: 'İçerik güncellenemedi' });
    }
  });

  app.delete('/api/samples/:id/items/:itemId', requireManager, async (req, res) => {
    await storage.deleteSampleItem(Number(req.params.itemId));
    res.status(204).send();
  });

  // Numuneden sevkiyat — create a 'numune' production record from a sample
  app.get('/api/samples/:id/sevkiyat', requireActive, async (req, res) => {
    try {
      const sampleId = Number(req.params.id);
      const { db } = await import('./db');
      const { productionRecords } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const [rec] = await db.select().from(productionRecords)
        .where(and(eq(productionRecords.sampleId, sampleId), eq(productionRecords.orderType, 'numune')));
      res.json({ record: rec ?? null });
    } catch {
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/samples/:id/sevkiyat', requireManager, async (req, res) => {
    try {
      const sampleId = Number(req.params.id);
      const sample = await storage.getSample(sampleId);
      if (!sample) return res.status(404).json({ message: 'Numune bulunamadı' });

      const { db } = await import('./db');
      const { productionRecords } = await import('@shared/schema');
      const { eq, and } = await import('drizzle-orm');
      const [existing] = await db.select().from(productionRecords)
        .where(and(eq(productionRecords.sampleId, sampleId), eq(productionRecords.orderType, 'numune')));
      if (existing) return res.json({ record: existing, alreadyExists: true });

      const items = await storage.getSampleItems(sampleId);
      const totalQty = items.reduce((sum, it) => sum + (it.unitQuantity || 0), 0) || 1;

      const created = await storage.createRecord({
        title: sample.title,
        description: sample.notes ?? null,
        customer: sample.customer ?? null,
        lotNumber: sample.lotNumber ?? null,
        referenceId: sample.referenceId ?? null,
        totalQuantity: totalQty,
        itemsPerBox: 1,
        status: 'completed',
        priority: 'normal',
        orderType: 'numune',
        sampleId: sampleId,
        createdBy: req.session.userId!,
      } as any);

      // Copy sample items into order_items
      for (const it of items) {
        await storage.createOrderItem({
          recordId: created.id,
          name: it.name,
          unitQuantity: it.unitQuantity,
          category: (it.category as any) || 'Diğer',
          fabricType: it.fabricType ?? null,
          description: it.description ?? null,
        } as any);
      }

      // Ensure shipment row exists so it appears in Sevkiyat list
      await storage.getOrCreateShipment(created.id);

      res.status(201).json({ record: created, alreadyExists: false });
    } catch (err: any) {
      console.error('[numune sevkiyat]', err);
      res.status(500).json({ message: err?.message || 'Sevkiyat oluşturulamadı' });
    }
  });

  app.delete('/api/samples/:id/photos/:photoId', requireActive, async (req, res) => {
    await storage.deleteSamplePhoto(Number(req.params.photoId));
    res.status(204).send();
  });

  // Sevkiyat routes
  app.get('/api/shipments', requireActive, async (req, res) => {
    try {
      const list = await storage.getShipmentsList();
      // Strip photos from each embedded record to lighten payload
      const stripped = list.map((row: any) => ({
        ...row,
        record: stripPhotos(row.record, 'production_records'),
      }));
      res.json(stripped);
    } catch {
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/shipments/record/:recordId', requireActive, async (req, res) => {
    try {
      const shipment = await storage.getOrCreateShipment(Number(req.params.recordId));
      res.json(shipment);
    } catch {
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.put('/api/shipments/:id', requireActive, async (req, res) => {
    try {
      const { deliveryAddress, notes, status } = req.body;
      const updates: Record<string, unknown> = {};
      if (deliveryAddress !== undefined) updates.deliveryAddress = deliveryAddress;
      if (notes !== undefined) updates.notes = notes;
      if (status !== undefined) {
        updates.status = status;
        updates.shippedAt = status === 'shipped' ? new Date() : null;
      }
      const shipment = await storage.updateShipment(Number(req.params.id), updates as any);
      res.json(shipment);
    } catch {
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/shipments/:id/photos', requireActive, async (req, res) => {
    const photos = await storage.getShipmentPhotos(Number(req.params.id));
    // Strip large base64 photoUrl; clients fetch on-demand via
    // /api/photo/shipment_photos/:id/photoUrl using the hasPhoto flag.
    res.json(photos.map(p => ({
      ...p,
      hasPhoto: !!(p.photoUrl && p.photoUrl.length > 0),
      photoUrl: null,
    })));
  });

  app.post('/api/shipments/:id/photos', requireActive, async (req, res) => {
    const { photoUrl, caption } = req.body;
    if (!photoUrl) return res.status(400).json({ message: 'photoUrl is required' });
    const photo = await storage.addShipmentPhoto({
      shipmentId: Number(req.params.id),
      photoUrl,
      caption: caption || null,
      uploadedBy: req.session.userId!,
    });
    res.status(201).json(photo);
  });

  app.delete('/api/shipments/:id/photos/:photoId', requireActive, async (req, res) => {
    await storage.deleteShipmentPhoto(Number(req.params.photoId));
    res.status(204).send();
  });

  app.get('/api/shipments/:id/barkod-dogrulamalari', requireActive, async (req, res) => {
    try {
      const shipmentId = Number(req.params.id);
      if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
        return res.status(400).json({ message: 'Geçersiz sevkiyat ID' });
      }
      const list = await storage.getShipmentBarkodDogrulamalari(shipmentId);
      res.json(list);
    } catch {
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/shipments/:id/barkod-dogrulamalari', requireActive, async (req, res) => {
    try {
      const shipmentId = Number(req.params.id);
      if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
        return res.status(400).json({ message: 'Geçersiz sevkiyat ID' });
      }
      const shipmentRows = await storage.getShipmentsList();
      if (!shipmentRows.some(s => s.id === shipmentId)) {
        return res.status(404).json({ message: 'Sevkiyat bulunamadı' });
      }
      const { code, ok, stokItemId, kaynak } = req.body ?? {};
      if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ message: 'code zorunlu' });
      }
      if (typeof ok !== 'boolean') {
        return res.status(400).json({ message: 'ok bool olmalı' });
      }
      const validKaynak = ['kamera', 'fiziksel', 'manuel'].includes(String(kaynak))
        ? String(kaynak)
        : null;
      const stokIdNum = stokItemId == null ? null : Number(stokItemId);
      const row = await storage.addShipmentBarkodDogrulama({
        shipmentId,
        stokItemId: Number.isFinite(stokIdNum) ? (stokIdNum as number) : null,
        code: code.trim(),
        ok,
        kullanici: req.session.userId ?? null,
        kaynak: validKaynak,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('[barkod dogrulama]', err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // Sevkiyat Planı routes
  app.get('/api/shipment-plans', requireActive, async (req, res) => {
    try {
      const status = req.query.status as 'active' | 'departed' | undefined;
      const plans = await storage.getShipmentPlans(status);
      const stripped = JSON.stringify(plans, (key, value) => {
        if (typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('data:application/') || (value.length > 5000 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 200))))) {
          return null;
        }
        return value;
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(stripped);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/shipment-plans/:id', requireActive, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Geçersiz plan ID' });
      const plan = await storage.getShipmentPlanById(id);
      if (!plan) return res.status(404).json({ message: 'Plan bulunamadı' });
      res.json(stripShipmentPlanPhotos(plan));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/shipment-plans', requireActive, async (req, res) => {
    try {
      const { vehicleType, plannedDepartureDate, notes, shippingCompany, addresses, items, photos, driverName, driverPhone, vehiclePlate, dorsePlate, driverPhoto, cargoCompany, cargoTitle, cargoDescription, cargoLabelPhoto } = req.body;
      if (!vehicleType || !plannedDepartureDate || !Array.isArray(addresses) || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Eksik veri' });
      }
      const plan = await storage.createShipmentPlan(
        vehicleType,
        plannedDepartureDate,
        notes || null,
        shippingCompany || null,
        req.session.userId!,
        addresses,
        items,
        Array.isArray(photos) ? photos : [],
        { driverName, driverPhone, vehiclePlate, dorsePlate, driverPhoto, cargoCompany, cargoTitle, cargoDescription, cargoLabelPhoto }
      );
      for (const addr of addresses) {
        const addrStr = typeof addr === 'string' ? addr : addr?.address;
        if (addrStr?.trim()) storage.upsertAddressLibrary(addrStr).catch(() => {});
      }
      res.status(201).json(stripShipmentPlanRowPhotos(plan));
    } catch (err) {
      const status = (err as { httpStatus?: number })?.httpStatus;
      if (status === 400) {
        return res.status(400).json({ message: (err as Error).message });
      }
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.patch('/api/shipment-plans/:id', requireActive, async (req, res) => {
    try {
      const { shippingCompany, vehicleType, plannedDepartureDate, notes, addresses, items, photos } = req.body;
      const isFullUpdate = vehicleType !== undefined || plannedDepartureDate !== undefined || notes !== undefined || addresses !== undefined || items !== undefined || photos !== undefined;
      if (isFullUpdate) {
        // Full plan updates require manager role
        const user = await storage.getUser(req.session.userId!);
        if (!user || !(MANAGER_ROLES as string[]).includes(user.role)) {
          return res.status(403).json({ message: 'Bu işlem için yetkiniz yok' });
        }
        const plan = await storage.updateShipmentPlan(Number(req.params.id), {
          ...(vehicleType !== undefined && { vehicleType }),
          ...(plannedDepartureDate !== undefined && { plannedDepartureDate }),
          ...(notes !== undefined && { notes: notes || null }),
          ...(shippingCompany !== undefined && { shippingCompany: shippingCompany || null }),
          ...(addresses !== undefined && { addresses }),
          ...(items !== undefined && { items }),
          ...(photos !== undefined && { photos: Array.isArray(photos) ? photos : [] }),
        }, req.session.userId!);
        if (Array.isArray(addresses)) {
          for (const addr of addresses) {
            const addrStr = typeof addr === 'string' ? addr : addr?.address;
            if (addrStr?.trim()) storage.upsertAddressLibrary(addrStr).catch(() => {});
          }
        }
        return res.json(stripShipmentPlanRowPhotos(plan));
      }
      // Company-only update: allowed for all active users
      const plan = await storage.updateShipmentPlanCompany(Number(req.params.id), shippingCompany || null);
      res.json(stripShipmentPlanRowPhotos(plan));
    } catch (err) {
      const status = (err as { httpStatus?: number })?.httpStatus;
      if (status === 400) {
        return res.status(400).json({ message: (err as Error).message });
      }
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/shipment-plans/:id/depart', requireActive, async (req, res) => {
    try {
      const { departurePhotoUrl } = req.body;
      if (!departurePhotoUrl) {
        return res.status(400).json({ message: 'Araç çıkış fotoğrafı zorunludur' });
      }
      const plan = await storage.departShipmentPlan(Number(req.params.id), req.session.userId!, departurePhotoUrl);
      res.json(plan);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/shipments/:id/off-record-ship', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ message: 'Geçersiz sevkiyat numarası' });
      }
      const existing = await storage.getShipmentById(id);
      if (!existing) {
        return res.status(404).json({ message: 'Sevkiyat bulunamadı' });
      }
      if (existing.status === 'araca_yuklendi') {
        return res.status(409).json({ message: 'Bu sevkiyat zaten tamamlanmış' });
      }
      const shipment = await storage.markShipmentOffRecord(id, req.session.userId!);
      res.json(shipment);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/shipments/:id/plans', requireActive, async (req, res) => {
    try {
      const plans = await storage.getShipmentPlansByShipmentId(Number(req.params.id));
      res.json(plans);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.delete('/api/shipment-plans/:id', requireManager, async (req, res) => {
    try {
      await storage.deleteShipmentPlan(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* ── Address Library ─────────────────────────────────────────────────────── */

  app.get('/api/address-library', requireActive, async (req, res) => {
    try {
      const addresses = await storage.getAddressLibrary();
      res.json(addresses);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/address-library', requireActive, async (req, res) => {
    try {
      const { address } = req.body;
      if (!address || typeof address !== 'string') return res.status(400).json({ message: 'Adres gerekli' });
      await storage.upsertAddressLibrary(address);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* ── Chat Channels ─────────────────────────────────────────────────────── */

  app.get('/api/channels', requireActive, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Yetkisiz' });
      const channels = await storage.getAccessibleChannels(user.id, user.role);
      const withUnread = await Promise.all(channels.map(async ch => ({
        ...ch,
        unreadCount: await storage.getChannelUnreadCount(user.id, ch.id),
      })));
      res.json(withUnread);
    } catch (err) { console.error(err); res.status(500).json({ message: 'Sunucu hatası' }); }
  });

  app.post('/api/channels', requireManager, async (req, res) => {
    try {
      const { name, description } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: 'Kanal adı gerekli' });
      const ch = await storage.createChannel(name.trim(), description?.trim() || null, req.session.userId!);
      res.json(ch);
    } catch (err) { console.error(err); res.status(500).json({ message: 'Sunucu hatası' }); }
  });

  app.patch('/api/channels/:id', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, description } = req.body;
      await storage.updateChannel(id, { name: name?.trim(), description: description?.trim() || null });
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Sunucu hatası' }); }
  });

  app.delete('/api/channels/:id', requireManager, async (req, res) => {
    try {
      await storage.deleteChannel(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Sunucu hatası' }); }
  });

  app.get('/api/channels/:id/members', requireActive, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Yetkisiz' });
      const canAccess = await storage.canUserAccessChannel(Number(req.params.id), user.id, user.role);
      if (!canAccess) return res.status(403).json({ message: 'Erişim yok' });
      res.json(await storage.getChannelMembers(Number(req.params.id)));
    } catch (err) { console.error(err); res.status(500).json({ message: 'Sunucu hatası' }); }
  });

  app.post('/api/channels/:id/members', requireManager, async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: 'userId gerekli' });
      await storage.addChannelMember(Number(req.params.id), Number(userId));
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Sunucu hatası' }); }
  });

  app.delete('/api/channels/:id/members/:userId', requireManager, async (req, res) => {
    try {
      await storage.removeChannelMember(Number(req.params.id), Number(req.params.userId));
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Sunucu hatası' }); }
  });

  /* ── Chat ─────────────────────────────────────────────────────────────── */

  app.get('/api/chat/messages', requireActive, async (req, res) => {
    try {
      const channelId = req.query.channelId ? Number(req.query.channelId) : null;
      if (channelId != null) {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Yetkisiz' });
        const canAccess = await storage.canUserAccessChannel(channelId, user.id, user.role);
        if (!canAccess) return res.status(403).json({ message: 'Bu kanala erişiminiz yok' });
      }
      const msgs = await storage.getChatMessages(200, channelId);
      res.json(msgs);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/chat/messages', requireActive, async (req, res) => {
    try {
      const { content, photoUrl, channelId } = req.body;
      if ((!content || !content.trim()) && !photoUrl) {
        return res.status(400).json({ message: 'Mesaj veya fotoğraf gerekli' });
      }
      if (channelId != null) {
        const user = await storage.getUser(req.session.userId!);
        if (!user) return res.status(401).json({ message: 'Yetkisiz' });
        const canAccess = await storage.canUserAccessChannel(Number(channelId), user.id, user.role);
        if (!canAccess) return res.status(403).json({ message: 'Bu kanala erişiminiz yok' });
      }
      const userId = req.session.userId!;
      const msg = await storage.createChatMessage({
        senderId: userId,
        content: content?.trim() || '',
        photoUrl: photoUrl || null,
        channelId: channelId != null ? Number(channelId) : null,
      } as any);
      res.json(msg);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.patch('/api/chat/messages/:id/pin', requireActive, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== 'admin' && user.role !== 'ofis_calisan')) {
        return res.status(403).json({ message: 'Yetkisiz' });
      }
      const { pin } = req.body;
      await storage.pinChatMessage(Number(req.params.id), user.id, !!pin);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/chat/read', requireActive, async (req, res) => {
    try {
      const { messageIds } = req.body;
      if (!Array.isArray(messageIds)) return res.status(400).json({ message: 'messageIds array gerekli' });
      await storage.markMessagesRead(req.session.userId!, messageIds);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/chat/unread-count', requireActive, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [chatCount, dmCount] = await Promise.all([
        storage.getUnreadCount(userId),
        storage.getDMUnreadCount(userId),
      ]);
      res.json({ count: chatCount + dmCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* ── Direct Messages ─────────────────────────────────────────────────── */

  app.get('/api/dm/conversations', requireActive, async (req, res) => {
    try {
      const conversations = await storage.getDMConversations(req.session.userId!);
      res.json(conversations);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/dm/unread-count', requireActive, async (req, res) => {
    try {
      const count = await storage.getDMUnreadCount(req.session.userId!);
      res.json({ count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/dm/:userId', requireActive, async (req, res) => {
    try {
      const myId = req.session.userId!;
      const otherId = Number(req.params.userId);
      if (!otherId) return res.status(400).json({ message: 'Geçersiz kullanıcı' });
      await storage.markDMsRead(myId, otherId);
      const messages = await storage.getDMs(myId, otherId);
      res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/dm/:userId', requireActive, async (req, res) => {
    try {
      const myId = req.session.userId!;
      const receiverId = Number(req.params.userId);
      if (!receiverId) return res.status(400).json({ message: 'Geçersiz kullanıcı' });
      const { content, photoUrl } = req.body;
      if ((!content || !content.trim()) && !photoUrl) {
        return res.status(400).json({ message: 'Mesaj veya fotoğraf gerekli' });
      }
      const me = await storage.getUser(myId);
      if (me?.role === 'uretim_calisan') {
        const exists = await storage.hasDMHistory(myId, receiverId);
        if (!exists) {
          return res.status(403).json({ message: 'Yeni DM oluşturma yetkiniz yok. Mevcut bir konuşmaya yanıt verebilirsiniz.' });
        }
      }
      const msg = await storage.sendDM(myId, receiverId, content?.trim() || '', photoUrl || null);
      res.json(msg);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.delete('/api/dm/:userId', requireActive, async (req, res) => {
    try {
      const me = await storage.getUser(req.session.userId!);
      if (!me || !['admin', 'uretim_sefi', 'ofis_calisan'].includes(me.role)) {
        return res.status(403).json({ message: 'Yetkisiz' });
      }
      const otherId = Number(req.params.userId);
      if (!otherId) return res.status(400).json({ message: 'Geçersiz kullanıcı' });
      await storage.deleteDMConversation(req.session.userId!, otherId);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.patch('/api/dm/:userId/read', requireActive, async (req, res) => {
    try {
      const myId = req.session.userId!;
      const senderId = Number(req.params.userId);
      await storage.markDMsRead(myId, senderId);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* Admin: view any user's DM conversations */
  app.get('/api/admin/users/:userId/dm-conversations', requireActive, async (req, res) => {
    try {
      const caller = await storage.getUser(req.session.userId!);
      if (!caller || !['admin', 'uretim_sefi', 'ofis_calisan'].includes(caller.role)) {
        return res.status(403).json({ message: 'Yetkisiz' });
      }
      const targetId = Number(req.params.userId);
      if (!targetId) return res.status(400).json({ message: 'Geçersiz kullanıcı' });
      const conversations = await storage.getDMConversations(targetId);
      res.json(conversations);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* Admin: view DM thread between two users */
  app.get('/api/admin/dm/:userAId/:userBId', requireActive, async (req, res) => {
    try {
      const caller = await storage.getUser(req.session.userId!);
      if (!caller || !['admin', 'uretim_sefi', 'ofis_calisan'].includes(caller.role)) {
        return res.status(403).json({ message: 'Yetkisiz' });
      }
      const userAId = Number(req.params.userAId);
      const userBId = Number(req.params.userBId);
      if (!userAId || !userBId) return res.status(400).json({ message: 'Geçersiz kullanıcı' });
      const messages = await storage.getDMs(userAId, userBId);
      res.json(messages);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.delete('/api/chat/messages/:id', requireActive, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== 'admin' && user.role !== 'ofis_calisan')) {
        return res.status(403).json({ message: 'Yetkisiz' });
      }
      await storage.deleteChatMessage(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* ─── Stok API ─────────────────────────────────────────────────────────── */
  /* ─── Stok Kategoriler ─────────────────────────────────────────────────── */
  app.get('/api/stok-kategoriler', requireActive, async (req, res) => {
    try {
      const kategoriler = await storage.getStokKategoriler();
      res.json(kategoriler);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/stok-kategoriler', requireManager, async (req, res) => {
    try {
      const { ad } = req.body;
      if (!ad || typeof ad !== 'string' || !ad.trim()) {
        return res.status(400).json({ message: 'Kategori adı gerekli' });
      }
      const kategori = await storage.createStokKategori({ ad: ad.trim().toUpperCase(), createdBy: req.session.userId });
      res.status(201).json(kategori);
    } catch (err: any) {
      if (err.code === '23505') return res.status(409).json({ message: 'Bu kategori zaten mevcut' });
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.delete('/api/stok-kategoriler/:id', requireManager, async (req, res) => {
    try {
      await storage.deleteStokKategori(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* ─── Stok Alt Türler ──────────────────────────────────────────────────── */
  app.get('/api/stok-alt-turler', requireActive, async (req, res) => {
    try {
      const kategoriId = req.query.kategoriId ? Number(req.query.kategoriId) : undefined;
      const altTurler = await storage.getStokAltTurler(kategoriId);
      res.json(altTurler);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/stok-alt-turler', requireManager, async (req, res) => {
    try {
      const { insertStokAltTurSchema } = await import('@shared/schema');
      const parsed = insertStokAltTurSchema.safeParse({ ...req.body, createdBy: req.session.userId });
      if (!parsed.success) return res.status(400).json({ message: 'Geçersiz veri', errors: parsed.error.flatten() });
      const altTur = await storage.createStokAltTur(parsed.data);
      res.status(201).json(altTur);
    } catch (err: any) {
      if (err.code === '23505') return res.status(409).json({ message: 'Bu alt tür zaten mevcut' });
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.patch('/api/stok-alt-turler/:id', requireManager, async (req, res) => {
    try {
      const { updateStokAltTurSchema } = await import('@shared/schema');
      const parsed = updateStokAltTurSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: 'Geçersiz veri', errors: parsed.error.flatten() });
      const updated = await storage.updateStokAltTur(Number(req.params.id), parsed.data);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.delete('/api/stok-alt-turler/:id', requireManager, async (req, res) => {
    try {
      await storage.deleteStokAltTur(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/stok', requireActive, async (req, res) => {
    try {
      const { tur, stokDurumu } = req.query as { tur?: string; stokDurumu?: string };
      const items = await storage.getStokItems({ tur, stokDurumu });
      res.json(items);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/stok/:id', requireActive, async (req, res) => {
    try {
      const item = await storage.getStokItem(Number(req.params.id));
      if (!item) return res.status(404).json({ message: 'Bulunamadı' });
      res.json(item);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // Stok kalemi rezervasyon detayları (hangi siparişlere ve ne kadar rezerve)
  app.get('/api/stok/:id/reservations', requireActive, async (req, res) => {
    try {
      const stokItemId = Number(req.params.id);
      const result = await storage.getStokReservations(stokItemId);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/stok/:id/gecmis', requireActive, async (req, res) => {
    try {
      const stokItemId = Number(req.params.id);
      const result = await storage.getStokTuketimGecmisi(stokItemId);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.post('/api/stok', requireActive, async (req, res) => {
    try {
      const { insertStokItemSchema } = await import('@shared/schema');
      const parsed = insertStokItemSchema.safeParse({ ...req.body, createdBy: req.session.userId });
      if (!parsed.success) return res.status(400).json({ message: 'Geçersiz veri', errors: parsed.error.flatten() });
      const item = await storage.createStokItem(parsed.data);
      res.status(201).json(item);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.patch('/api/stok/:id', requireActive, async (req, res) => {
    try {
      const item = await storage.getStokItem(Number(req.params.id));
      if (!item) return res.status(404).json({ message: 'Bulunamadı' });
      const updated = await storage.updateStokItem(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.delete('/api/stok/:id', requireManager, async (req, res) => {
    try {
      await storage.deleteStokItem(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  /* ── Depo Hareketleri ────────────────────────────────────────────────────── */

  // GET: Tüm depo hareketleri — tek tablo sorgusu, JOIN yok
  app.get('/api/raporlar/barkod-dogrulama', requireManager, async (req, res) => {
    try {
      const startDateStr = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDateStr = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const userIdStr = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const startDate = startDateStr ? new Date(startDateStr) : undefined;
      const endDate = endDateStr ? new Date(endDateStr) : undefined;
      const userId = userIdStr && userIdStr !== '' ? Number(userIdStr) : undefined;
      if (startDate && isNaN(startDate.getTime())) return res.status(400).json({ message: 'Geçersiz başlangıç tarihi' });
      if (endDate && isNaN(endDate.getTime())) return res.status(400).json({ message: 'Geçersiz bitiş tarihi' });
      if (userId != null && Number.isNaN(userId)) return res.status(400).json({ message: 'Geçersiz kullanıcı' });
      const rows = await storage.getDepoHareketleriDogrulamaRaporu({ startDate, endDate, userId });
      res.json(rows.map(r => ({
        id: r.id,
        stokItemId: r.stokItemId,
        urunAdi: r.stokAdi,
        lot: r.lot,
        birim: r.birim,
        siparisId: r.siparisId,
        siparisTitle: r.siparisTitle,
        siparisLot: r.siparisLot,
        tasindiAt: r.tasindiAt,
        tasindiBy: r.tasindiBy,
        tasindiByUsername: r.tasindiByUsername ?? null,
        tasindiMiktar: r.tasindiMiktar != null ? Number(r.tasindiMiktar) : null,
        rezervedMiktar: Number(r.rezerveMiktar),
        barkodDogrulandi: r.barkodDogrulandi ?? false,
        barkodKaynak: r.barkodKaynak ?? null,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.get('/api/depo-hareketleri', requireManager, async (req, res) => {
    try {
      const list = await storage.getDepoHareketleriList();
      res.json(list.map((r) => ({
        id: r.id,
        stokId: r.stokItemId,
        urunAdi: r.stokAdi,
        lot: r.lot,
        birim: r.birim,
        rezervedMiktar: Number(r.rezerveMiktar),
        kaynak: r.kaynak,
        kaynakId: r.kaynakId,
        siparisId: r.siparisId,
        siparisTitle: r.siparisTitle,
        siparisLot: r.siparisLot,
        tasindi: r.tasindi,
        tasindiMiktar: r.tasindiMiktar != null ? Number(r.tasindiMiktar) : null,
        tasindiAt: r.tasindiAt,
        tasindiBy: r.tasindiBy,
        tasindiByUsername: r.tasindiByUsername ?? null,
        tasindiPhoto: r.tasindiPhoto,
        tasindiAciklama: r.tasindiAciklama,
        barkodDogrulandi: r.barkodDogrulandi ?? false,
        barkodKaynak: r.barkodKaynak ?? null,
        createdAt: r.createdAt,
        stokMiktar: r.stokMiktar,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // PATCH: Lotu üretime taşı — kısmi taşımayı destekler
  app.patch('/api/depo-hareketleri/:id/tasindi', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { tasindiMiktar, barkodDogrulandi, barkodKaynak } = req.body;
      const incrementNum = tasindiMiktar != null ? Number(tasindiMiktar) : null;

      // Satırı oku — mevcut taşınan miktarla birleştir (accumulate)
      const row = await storage.getDepoHareket(id);
      const rezerveMiktar = row ? Number(row.rezerveMiktar) : 0;
      const existingTasindi = row ? (Number(row.tasindiMiktar) || 0) : 0;
      const newTotal = incrementNum != null ? existingTasindi + incrementNum : rezerveMiktar;
      const tamTasindi = newTotal >= rezerveMiktar;

      const userId = req.session.userId ?? null;
      let tasindiByUsername: string | null = null;
      if (userId) {
        const u = await storage.getUser(userId);
        tasindiByUsername = u ? ((u as any).displayName || u.username) : null;
      }
      const validKaynak = ['kamera', 'fiziksel', 'manuel'].includes(String(barkodKaynak))
        ? String(barkodKaynak) : null;
      await storage.updateDepoHareket(id, {
        tasindi: tamTasindi,
        tasindiBy: userId,
        tasindiByUsername,
        tasindiMiktar: newTotal,
        ...(barkodDogrulandi !== undefined ? {
          barkodDogrulandi: !!barkodDogrulandi,
          barkodKaynak: barkodDogrulandi ? validKaynak : null,
        } : {}),
      });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // GET: Tek bir depo hareketinin detayı (etiket/QR ekranı için)
  app.get('/api/depo-hareketleri/:id', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = await storage.getDepoHareket(id);
      if (!row) return res.status(404).json({ message: 'Bulunamadı' });
      // Müşteri bilgisi için bağlı production_records satırını çek
      let musteri: string | null = null;
      try {
        const { db } = await import('./db');
        const { eq } = await import('drizzle-orm');
        const [r] = await db.select({ customer: productionRecords.customer })
          .from(productionRecords).where(eq(productionRecords.id, row.siparisId));
        musteri = r?.customer ?? null;
      } catch { /* opsiyonel — başarısız olursa atla */ }
      res.json({ ...row, musteri });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // App ayarları — barkod doğrulama modu (esnek/sıkı)
  // İzin verilen ayar anahtarları (allowlist). Yeni anahtar eklendikçe genişletin.
  const ALLOWED_SETTING_KEYS = new Set<string>(['barkod_dogrulama_modu']);
  app.get('/api/settings/:key', requireActive, async (req, res) => {
    try {
      const key = String(req.params.key);
      if (!ALLOWED_SETTING_KEYS.has(key)) {
        return res.status(404).json({ message: 'Bilinmeyen ayar anahtarı' });
      }
      const value = await storage.getAppSetting(key);
      res.json({ key, value });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  app.put('/api/settings/:key', requireAdmin, async (req, res) => {
    try {
      const key = String(req.params.key);
      if (!ALLOWED_SETTING_KEYS.has(key)) {
        return res.status(404).json({ message: 'Bilinmeyen ayar anahtarı' });
      }
      const { value } = req.body;
      if (typeof value !== 'string') return res.status(400).json({ message: 'value zorunlu' });
      // Bilinen anahtarlar için değer doğrulaması
      if (key === 'barkod_dogrulama_modu' && !['esnek', 'siki'].includes(value)) {
        return res.status(400).json({ message: "value 'esnek' veya 'siki' olmalı" });
      }
      await storage.setAppSetting(key, value);
      res.json({ key, value });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // PATCH: Taşınan lotun fotoğraf ve açıklamasını güncelle
  app.patch('/api/depo-hareketleri/:id/foto', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { tasindiPhoto, tasindiAciklama } = req.body;
      await storage.patchDepoHareketFoto(id, tasindiPhoto ?? null, tasindiAciklama ?? null);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // PATCH: Taşınan lotu geri al — tüm taşıma bilgilerini sıfırla
  app.patch('/api/depo-hareketleri/:id/geri-al', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.updateDepoHareket(id, {
        tasindi: false,
        tasindiAt: null,
        tasindiBy: null,
        tasindiByUsername: null,
        tasindiMiktar: null,
        tasindiPhoto: null,
        tasindiAciklama: null,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Sunucu hatası' });
    }
  });

  // PATCH: Fazlalık stoku depoya geri taşı — tasindiMiktar'ı rezervedMiktar'a düşür
  app.patch('/api/depo-hareketleri/:id/depoya-don', requireManager, async (req, res) => {
    try {
      await storage.depoyaDonDepoHareketi(Number(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  // POST: Fazlalık stoku başka bir siparişe ata
  app.post('/api/depo-hareketleri/:id/siparis-ata', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { hedefSiparisId, miktar } = req.body;
      if (!hedefSiparisId || !miktar || Number(miktar) <= 0) {
        return res.status(400).json({ message: 'Geçersiz hedef sipariş veya miktar' });
      }
      const hedef = await storage.getRecord(Number(hedefSiparisId));
      if (!hedef) return res.status(404).json({ message: 'Hedef sipariş bulunamadı' });
      const newId = await storage.siparisAtaDepoHareketi(
        id,
        Number(miktar),
        hedef.id,
        hedef.title,
        hedef.lotNumber ?? null,
      );
      res.json({ ok: true, id: newId });
    } catch (err: any) {
      res.status(400).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  // ─── Stok Anomalileri (Tutarsızlık Bildirimleri) ─────────────────────────
  // GET: Tüm anomalileri listele (aktif kullanıcılar görüntüleyebilir)
  app.get('/api/stok-anomalileri', requireActive, async (_req, res) => {
    try {
      const list = await storage.getStokAnomalileri();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  // GET: Tek bir depo hareketinin anomalilerini al
  app.get('/api/depo-hareketleri/:id/anomaliler', requireActive, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const list = await storage.getStokAnomalileriByDepoHareket(id);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  // GET: Aynı ürün adında alternatif lotları listele (fazla anomali için)
  // Aynı zamanda mevcut lotun kalan stoğunu döner.
  app.get('/api/stok-anomalileri/alternate-lots/:depoHareketId', requireActive, async (req, res) => {
    try {
      const id = Number(req.params.depoHareketId);
      const hareket = await storage.getDepoHareket(id);
      if (!hareket) return res.status(404).json({ message: 'Depo hareketi bulunamadı' });
      const sameLot = await storage.getStokItem(hareket.stokItemId);
      const others = await storage.getStokItemsByUrunAdi(hareket.stokAdi, hareket.birim, hareket.stokItemId);
      res.json({
        sameLot: sameLot ? {
          stokItemId: sameLot.id,
          lot: sameLot.lot,
          urunAdi: sameLot.urunAdi,
          birim: sameLot.birim,
          miktar: Number(sameLot.miktar),
        } : null,
        alternatives: others.filter(s => Number(s.miktar) > 0).map(s => ({
          stokItemId: s.id,
          lot: s.lot,
          urunAdi: s.urunAdi,
          birim: s.birim,
          miktar: Number(s.miktar),
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  // POST: Yeni anomali bildirimi oluştur (üretim şefi VEYA stok yetkisi gerekli)
  app.post('/api/stok-anomalileri', requireStokAuth, async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const body = z.object({
        depoHareketId: z.number().int().positive(),
        tur: z.enum(['fazla', 'eksik']),
        beklenenMiktar: z.number().nonnegative(),
        gercekMiktar: z.number().nonnegative(),
        birim: z.string().min(1),
        aciklama: z.string().min(1, 'Açıklama zorunludur'),
        fotograf: z.string().nullable().optional(),
        ekStokDusumler: z.array(z.object({
          stokItemId: z.number().int().positive(),
          miktar: z.number().positive(),
        })).optional(),
      }).parse(req.body);

      const hareket = await storage.getDepoHareket(body.depoHareketId);
      if (!hareket) return res.status(404).json({ message: 'Depo hareketi bulunamadı' });

      const fark = body.gercekMiktar - body.beklenenMiktar;
      const farkAbs = Math.abs(fark);

      let ekStokDusumler: Array<{ stokItemId: number; lot: string | null; urunAdi: string; miktar: number }> = [];
      let autoDusuldu = false;

      // Sadece "fazla" için ek stok düşümü gereklidir.
      if (body.tur === 'fazla' && farkAbs > 0.0001) {
        const sameLotItem = await storage.getStokItem(hareket.stokItemId);
        const sameLotRemaining = sameLotItem ? Number(sameLotItem.miktar) : 0;

        if (!body.ekStokDusumler || body.ekStokDusumler.length === 0) {
          // Otomatik aynı lottan düşmeyi dene
          if (sameLotRemaining + 0.0001 >= farkAbs && sameLotItem) {
            await storage.decrementStokItemMiktar(sameLotItem.id, farkAbs);
            ekStokDusumler = [{
              stokItemId: sameLotItem.id,
              lot: sameLotItem.lot,
              urunAdi: sameLotItem.urunAdi,
              miktar: farkAbs,
            }];
            autoDusuldu = true;
          } else {
            // Aynı lot yetersiz — alternatifleri kontrol et
            const alternatives = await storage.getStokItemsByUrunAdi(hareket.stokAdi, hareket.birim, hareket.stokItemId);
            const availableAlts = alternatives.filter(s => Number(s.miktar) > 0);
            const totalAvailable = sameLotRemaining + availableAlts.reduce((sum, s) => sum + Number(s.miktar), 0);

            if (totalAvailable + 0.0001 < farkAbs) {
              // Hiçbir yerde yeterli stok yok — KRİTİK uyarıyla kaydet
              // Mevcut tüm stokları düş, kalanı bekleyen olarak işaretle
              const partialDusumler: Array<{ stokItemId: number; lot: string | null; urunAdi: string; miktar: number }> = [];
              let kalan = farkAbs;
              if (sameLotItem && sameLotRemaining > 0) {
                const dus = Math.min(sameLotRemaining, kalan);
                await storage.decrementStokItemMiktar(sameLotItem.id, dus);
                partialDusumler.push({ stokItemId: sameLotItem.id, lot: sameLotItem.lot, urunAdi: sameLotItem.urunAdi, miktar: dus });
                kalan -= dus;
              }
              for (const alt of availableAlts) {
                if (kalan <= 0.0001) break;
                const dus = Math.min(Number(alt.miktar), kalan);
                await storage.decrementStokItemMiktar(alt.id, dus);
                partialDusumler.push({ stokItemId: alt.id, lot: alt.lot, urunAdi: alt.urunAdi, miktar: dus });
                kalan -= dus;
              }
              const created = await storage.createStokAnomali({
                depoHareketId: body.depoHareketId,
                tur: body.tur,
                beklenenMiktar: body.beklenenMiktar as any,
                gercekMiktar: body.gercekMiktar as any,
                fark: farkAbs as any,
                birim: body.birim,
                aciklama: body.aciklama,
                fotograf: body.fotograf ?? null,
                reportedBy: user.id,
                reportedByUsername: user.displayName || user.username,
                ekStokDusumler: partialDusumler,
                autoDusuldu: false,
                bekleyenMiktar: kalan,
                bekleyenUrunAdi: hareket.stokAdi,
                bekleyenBirim: hareket.birim,
              });
              return res.status(201).json({ ...created, criticalWarning: true, bekleyenMiktar: kalan });
            }

            // Yeterli alternatif var — kullanıcıdan seçim iste
            return res.status(400).json({
              message: 'Aynı lottaki kalan stok yetersiz. Lütfen ek lot seçimi yapın.',
              requireExtraSelection: true,
              fark: farkAbs,
              sameLotRemaining,
              sameLotId: hareket.stokItemId,
              sameLot: sameLotItem ? { stokItemId: sameLotItem.id, lot: sameLotItem.lot, urunAdi: sameLotItem.urunAdi, miktar: sameLotRemaining } : null,
              alternatives: availableAlts.map(s => ({
                stokItemId: s.id,
                lot: s.lot,
                urunAdi: s.urunAdi,
                birim: s.birim,
                miktar: Number(s.miktar),
              })),
            });
          }
        } else {
          // Kullanıcı ek lot seçimi yaptı — doğrula ve düş
          const sum = body.ekStokDusumler.reduce((s, e) => s + e.miktar, 0);
          if (Math.abs(sum - farkAbs) > 0.0001) {
            return res.status(400).json({ message: `Seçilen lot miktarlarının toplamı (${sum}) farkın (${farkAbs}) eşiti olmalı` });
          }
          // Her lotun yeterli stoğunu doğrula ve aynı ürün adı olduğunu kontrol et
          for (const e of body.ekStokDusumler) {
            const item = await storage.getStokItem(e.stokItemId);
            if (!item) return res.status(400).json({ message: `Stok lot bulunamadı (id=${e.stokItemId})` });
            if (item.urunAdi !== hareket.stokAdi || item.birim !== hareket.birim) {
              return res.status(400).json({ message: `Lot uyumsuz: ${item.urunAdi} (${item.birim}) ≠ ${hareket.stokAdi} (${hareket.birim})` });
            }
            if (Number(item.miktar) + 0.0001 < e.miktar) {
              return res.status(400).json({ message: `${item.urunAdi} LOT ${item.lot ?? '-'} için yetersiz stok (${item.miktar} < ${e.miktar})` });
            }
            ekStokDusumler.push({
              stokItemId: item.id,
              lot: item.lot,
              urunAdi: item.urunAdi,
              miktar: e.miktar,
            });
          }
          // Hepsi doğrulandı — şimdi düş
          for (const e of ekStokDusumler) {
            await storage.decrementStokItemMiktar(e.stokItemId, e.miktar);
          }
          autoDusuldu = ekStokDusumler.length === 1 && ekStokDusumler[0].stokItemId === hareket.stokItemId;
        }
      }

      const created = await storage.createStokAnomali({
        depoHareketId: body.depoHareketId,
        tur: body.tur,
        beklenenMiktar: body.beklenenMiktar as any,
        gercekMiktar: body.gercekMiktar as any,
        fark: farkAbs as any,
        birim: body.birim,
        aciklama: body.aciklama,
        fotograf: body.fotograf ?? null,
        reportedBy: user.id,
        reportedByUsername: user.displayName || user.username,
        ekStokDusumler,
        autoDusuldu,
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  // PATCH: Anomaliyi çözümle (sadece yöneticiler)
  app.patch('/api/stok-anomalileri/:id/resolve', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;
      await storage.resolveStokAnomali(id, user.id, user.displayName || user.username, notes);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  // DELETE: Anomali kaydını sil (sadece yöneticiler)
  app.delete('/api/stok-anomalileri/:id', requireManager, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteStokAnomali(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Sunucu hatası' });
    }
  });

  async function runMigrations() {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationsDir = path.join(process.cwd(), 'server', 'migrations');
      if (!fs.existsSync(migrationsDir)) return;

      // Migration takip tablosunu oluştur
      await storage.runRawSQL(`
        CREATE TABLE IF NOT EXISTS _migrations (
          filename TEXT PRIMARY KEY,
          applied_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const { db } = await import('./db');
      const { sql: drizzleSql } = await import('drizzle-orm');

      const files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).sort();
      for (const file of files) {
        try {
          // Bu migration daha önce çalıştırıldıysa atla
          const check = await db.execute(drizzleSql`SELECT 1 FROM _migrations WHERE filename = ${file}`);
          if ((check as any).rows?.length > 0) {
            continue;
          }
          const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          await storage.runRawSQL(sqlContent);
          await db.execute(drizzleSql`INSERT INTO _migrations (filename) VALUES (${file}) ON CONFLICT DO NOTHING`);
          console.log(`[migration] Applied: ${file}`);
        } catch (e) {
          console.error(`[migration] Error applying ${file}:`, (e as any)?.message ?? e);
        }
      }
    } catch (e) {
      console.error('[migration] Error running migrations:', e);
    }
  }

  async function seedDatabase() { /* Preset credentials excluded from export. */ }
  setTimeout(async () => { await runMigrations(); await seedDatabase(); }, 2000);

  return httpServer;
}
