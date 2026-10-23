const { randomUUID } = require('node:crypto');

function createSupabaseStorage({ url, key, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS');
  const bucket = 'payment-proofs';
  async function request(path, options = {}) {
    const response = await fetchImpl(new URL(path, base), {
      ...options,
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...options.headers },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      // Never expose provider responses (which may contain personal data) or credentials.
      throw new Error(`Permanent storage request failed (${response.status})`);
    }
    return response.status === 204 ? null : response.json();
  }
  const tables = new Set(['registrations', 'abstracts', 'contacts', 'sponsorships', 'mail_logs']);
  return {
    kind: 'supabase',
    exec() { /* Schema is installed explicitly using supabase/schema.sql. */ },
    prepare(sql) {
      const insert = sql.match(/INSERT INTO\s+(\w+)\s*\(([^)]+)\)/i);
      const select = sql.match(/SELECT \* FROM\s+(\w+)\s+ORDER BY created_at DESC(?: LIMIT (\d+))?\s*$/i);
      if (insert && tables.has(insert[1])) {
        return { async run(...args) {
          const columns = insert[2].split(',').map(column => column.trim());
          const record = Object.fromEntries(columns.map((column, i) => [column, args[i]]).filter(([,value]) => value !== undefined));
          const rows = await request(`/rest/v1/${insert[1]}`, {method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(record)});
          if (!rows?.[0]?.id) throw new Error('Permanent storage did not confirm insertion');
          return {lastInsertRowid: rows[0].id};
        }};
      }
      if (select && tables.has(select[1])) {
        return { async all() {
          const rows = await request(`/rest/v1/${select[1]}?select=*&order=created_at.desc${select[2] ? '&limit='+select[2] : ''}`);
          if (!Array.isArray(rows)) throw new Error('Invalid permanent storage response');
          // Only authenticated admin routes call all(); proofs remain private at rest.
          return Promise.all(rows.map(async row => {
            if (row.payment_proof?.startsWith('supabase://payment-proofs/')) {
              const object = row.payment_proof.slice('supabase://payment-proofs/'.length);
              const signed = await request(`/storage/v1/object/sign/${bucket}/${encodeURIComponent(object)}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})});
              const signedPath = signed.signedURL || signed.signedUrl;
              if (!signedPath) throw new Error('Could not sign payment proof');
              row.payment_proof = new URL('/storage/v1'+signedPath, base).href;
            }
            return row;
          }));
        }};
      }
      throw new Error('Unsupported storage query');
    },
    async storeProof(buffer, ext, refId, originalFilename) {
      const object = `${randomUUID()}.${ext}`;
      const mimetype = {png:'image/png',jpg:'image/jpeg',webp:'image/webp',pdf:'application/pdf'}[ext];
      await request(`/storage/v1/object/${bucket}/${object}`, {method:'POST',headers:{'Content-Type':mimetype,'x-upsert':'false'},body:buffer});
      return {stored_path:`supabase://${bucket}/${object}`,stored_filename:object,original_filename:originalFilename,mimetype,size:buffer.length,uploaded_at:new Date().toISOString()};
    }
  };
}

function getSupabaseStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url && !key) return null;
  if (!url || !key) throw new Error('Both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createSupabaseStorage({url,key});
}
module.exports = { createSupabaseStorage, getSupabaseStorage };
