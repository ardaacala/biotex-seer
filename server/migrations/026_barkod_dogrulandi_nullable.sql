-- depo_hareketleri.barkod_dogrulandi nullable hale getirildi
ALTER TABLE depo_hareketleri ALTER COLUMN barkod_dogrulandi DROP NOT NULL;
