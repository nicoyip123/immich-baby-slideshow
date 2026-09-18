import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { AssetType } from "../immich/types.js";

export interface StatsRow { assetId: string; mediaType: AssetType; periodCount: number; totalCount: number; lastDisplayedAt: string }
export interface FavouriteRow { assetId: string; mediaType: AssetType; savedAt: string }
export interface StatsDatabase { saveFavourite(assetId: string, mediaType: AssetType): boolean; listFavourites(): FavouriteRow[]; deleteFavourite(assetId: string): void; record(token: string, assetId: string, type: AssetType): boolean; report(period: "7d"|"30d"|"all", type?: AssetType): StatsRow[]; reset(): void; close(): void }

export function createStatsDatabase(path: string, now: () => Date = () => new Date()): StatsDatabase {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS asset_daily_counts(asset_id TEXT NOT NULL, day TEXT NOT NULL, media_type TEXT NOT NULL, display_count INTEGER NOT NULL, last_displayed_at TEXT NOT NULL, PRIMARY KEY(asset_id,day)); CREATE TABLE IF NOT EXISTS used_impressions(token_hash TEXT PRIMARY KEY, used_at TEXT NOT NULL);`);
  db.exec("CREATE TABLE IF NOT EXISTS favourites(asset_id TEXT PRIMARY KEY, media_type TEXT NOT NULL, saved_at TEXT NOT NULL)");
  const record = db.transaction((token: string, assetId: string, type: AssetType) => {
    const instant = now();
    const hash = createHash("sha256").update(token).digest("hex");
    const inserted = db.prepare("INSERT OR IGNORE INTO used_impressions(token_hash,used_at) VALUES(?,?)").run(hash, instant.toISOString());
    if (!inserted.changes) return false;
    db.prepare(`INSERT INTO asset_daily_counts(asset_id,day,media_type,display_count,last_displayed_at) VALUES(?,?,?,?,?) ON CONFLICT(asset_id,day) DO UPDATE SET display_count=display_count+1,last_displayed_at=excluded.last_displayed_at`).run(assetId, instant.toISOString().slice(0,10), type, 1, instant.toISOString());
    db.prepare("DELETE FROM used_impressions WHERE used_at < ?").run(new Date(instant.getTime()-86_400_000).toISOString());
    return true;
  });
  return {
    record,
    saveFavourite(assetId, mediaType) { return db.prepare("INSERT OR IGNORE INTO favourites(asset_id,media_type,saved_at) VALUES(?,?,?)").run(assetId, mediaType, now().toISOString()).changes > 0; },
    listFavourites() { return db.prepare("SELECT asset_id assetId, media_type mediaType, saved_at savedAt FROM favourites ORDER BY saved_at DESC, asset_id ASC").all() as FavouriteRow[]; },
    deleteFavourite(assetId) { db.prepare("DELETE FROM favourites WHERE asset_id=?").run(assetId); },
    report(period, type) {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : undefined;
      const cutoff = days ? new Date(now().getTime()-(days-1)*86_400_000).toISOString().slice(0,10) : undefined;
      const rows = db.prepare(`SELECT asset_id assetId, media_type mediaType, SUM(CASE WHEN @cutoff IS NULL OR day>=@cutoff THEN display_count ELSE 0 END) periodCount, SUM(display_count) totalCount, MAX(last_displayed_at) lastDisplayedAt FROM asset_daily_counts WHERE (@type IS NULL OR media_type=@type) GROUP BY asset_id,media_type HAVING periodCount>0 ORDER BY periodCount DESC,lastDisplayedAt DESC`).all({ cutoff: cutoff ?? null, type: type ?? null });
      return rows as StatsRow[];
    },
    reset() { db.exec("DELETE FROM asset_daily_counts; DELETE FROM used_impressions;"); },
    close() { db.close(); }
  };
}

