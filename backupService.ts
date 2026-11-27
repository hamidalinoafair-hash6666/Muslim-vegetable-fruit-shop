import { DatabaseBackup } from '../src/types';

/**
 * Automated Database Backup & Recovery Service
 * Creates daily automated snapshots and SQL/JSON data exports for Muslim Vegetable & Fruit Shop (Khanewal).
 */

const backupHistory: DatabaseBackup[] = [];

export function generateSqlDump(data: {
  products: any[];
  orders: any[];
  receipts: any[];
  reviews: any[];
}): string {
  let sql = `-- =========================================================================\n`;
  sql += `-- MUSLIM VEGETABLE & FRUIT SHOP (KHANEWAL) — DATABASE BACKUP\n`;
  sql += `-- Generated: ${new Date().toISOString()}\n`;
  sql += `-- =========================================================================\n\n`;

  sql += `-- 1. VEGETABLES & FRUITS CATALOG (${data.products.length} records)\n`;
  for (const p of data.products) {
    const cleanName = (p.name || '').replace(/'/g, "''");
    const cleanUrdu = (p.urdu_name || '').replace(/'/g, "''");
    const numericId = Number(p.supabase_id || p.id);
    if (Number.isFinite(numericId)) {
      sql += `INSERT INTO public.vegetables (id, name, urdu_name, price, unit, category, stock_quantity, is_out_of_stock) VALUES (${numericId}, '${cleanName}', '${cleanUrdu}', ${p.price}, '${p.unit}', '${p.category}', ${p.stock_quantity}, ${p.is_out_of_stock}) ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, stock_quantity = EXCLUDED.stock_quantity, is_out_of_stock = EXCLUDED.is_out_of_stock;\n`;
    }
  }

  sql += `\n-- 2. ORDERS TABLE DATA (${data.orders.length} records)\n`;
  for (const o of data.orders) {
    const cleanCust = (o.customer_name || '').replace(/'/g, "''");
    const cleanAddr = (o.delivery_address || '').replace(/'/g, "''");
    sql += `INSERT INTO public.orders (id, customer_name, customer_phone, delivery_address, delivery_area, delivery_lat, delivery_lng, delivery_distance_km, distance_source, subtotal, delivery_fee, total_amount, payment_method, payment_status, order_status) VALUES ('${o.id}', '${cleanCust}', '${o.customer_phone}', '${cleanAddr}', '${(o.delivery_area || '').replace(/'/g, "''")}', ${o.coordinates?.lat || 30.2985}, ${o.coordinates?.lng || 71.9325}, ${o.delivery_distance_km || 0}, '${o.distance_source || 'verified_sector_road'}', ${o.subtotal || 0}, ${o.delivery_fee || 0}, ${o.total_amount}, '${o.payment_method}', '${o.payment_status}', '${o.order_status}') ON CONFLICT (id) DO NOTHING;\n`;
  }

  sql += `\n-- 3. REVIEWS TABLE DATA (${data.reviews.length} records)\n`;
  for (const r of data.reviews) {
    const cleanCom = (r.comment || '').replace(/'/g, "''");
    const cleanUser = (r.user_name || '').replace(/'/g, "''");
    sql += `INSERT INTO public.reviews (id, product_id, user_name, rating, freshness_score, comment) VALUES ('${r.id}', '${r.product_id}', '${cleanUser}', ${r.rating}, ${r.freshness_score}, '${cleanCom}') ON CONFLICT (id) DO NOTHING;\n`;
  }

  return sql;
}

export function createDatabaseBackup(
  data: { products: any[]; orders: any[]; receipts: any[]; reviews: any[] },
  type: 'automated_daily' | 'manual' = 'manual'
): DatabaseBackup {
  const timestamp = new Date().toISOString();
  const dateStr = timestamp.split('T')[0];
  const timeStr = timestamp.split('T')[1].replace(/[:.]/g, '-').slice(0, 8);
  const fileName = `muslim_shop_khanewal_${dateStr}_${timeStr}.${type === 'automated_daily' ? 'daily' : 'manual'}.json`;

  const jsonStr = JSON.stringify(data, null, 2);
  const sqlStr = generateSqlDump(data);
  const sizeKb = Math.round((Buffer.byteLength(jsonStr) + Buffer.byteLength(sqlStr)) / 1024);

  const backup: DatabaseBackup = {
    id: `bak-${Date.now()}`,
    timestamp,
    file_name: fileName,
    records_count: {
      products: data.products.length,
      orders: data.orders.length,
      receipts: data.receipts.length,
      reviews: data.reviews.length,
    },
    size_kb: Math.max(1, sizeKb),
    type,
    download_data_json: jsonStr,
    download_data_sql: sqlStr,
  };

  backupHistory.unshift(backup);
  if (backupHistory.length > 20) backupHistory.pop();

  return backup;
}

export function getBackupHistory(): DatabaseBackup[] {
  return backupHistory;
}
