const fs = require('fs');
const path = require('path');

class InMemoryDb {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.tables = {
      registrations: [],
      abstracts: [],
      contacts: [],
      sponsorships: [],
      mail_logs: []
    };
    this.load();
  }

  load() {
    if (this.storagePath && fs.existsSync(this.storagePath)) {
      try {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        this.tables = { ...this.tables, ...data };
      } catch (e) {
        console.warn('[DB FALLBACK] Could not parse existing storage file:', e.message);
      }
    }
  }

  save() {
    if (this.storagePath) {
      try {
        fs.writeFileSync(this.storagePath, JSON.stringify(this.tables, null, 2), 'utf8');
      } catch (e) {
        // Silently retain in-memory if disk is not writable
      }
    }
  }

  exec(sql) {
    return this;
  }

  prepare(sql) {
    const normalized = (sql || '').replace(/\s+/g, ' ').trim();
    const self = this;

    let tableName = 'registrations';
    if (/into\s+abstracts|from\s+abstracts/i.test(normalized)) tableName = 'abstracts';
    else if (/into\s+contacts|from\s+contacts/i.test(normalized)) tableName = 'contacts';
    else if (/into\s+sponsorships|from\s+sponsorships/i.test(normalized)) tableName = 'sponsorships';
    else if (/into\s+mail_logs|from\s+mail_logs/i.test(normalized)) tableName = 'mail_logs';

    return {
      run(...args) {
        const table = self.tables[tableName] || (self.tables[tableName] = []);
        const id = table.length + 1;
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

        let record = { id, created_at: now };
        if (tableName === 'registrations') {
          record = {
            id,
            full_name: args[0],
            email: args[1],
            phone: args[2],
            category: args[3],
            tier: args[4],
            workshop: args[5],
            amount: args[6],
            currency: args[7] || 'INR',
            ref_id: args[8],
            payment_ref: args[9],
            payment_proof: args[10],
            proof_filename: args[11],
            proof_mimetype: args[12],
            proof_size: args[13],
            proof_uploaded_at: args[14] || now,
            created_at: now
          };
        } else if (tableName === 'abstracts') {
          record = {
            id,
            full_name: args[0],
            email: args[1],
            title: args[2],
            category: args[3],
            body: args[4],
            ref_id: args[5],
            document_path: args[6], document_filename: args[7], document_mimetype: args[8], document_size: args[9], preference: args[10],
            created_at: now
          };
        } else if (tableName === 'contacts') {
          record = {
            id,
            name: args[0],
            email: args[1],
            message: args[2],
            created_at: now
          };
        } else if (tableName === 'sponsorships') {
          record = {
            id,
            company_name: args[0],
            contact_person: args[1],
            email: args[2],
            phone: args[3],
            tier: args[4],
            amount: args[5],
            notes: args[6],
            ref_id: args[7],
            payment_ref: args[8],
            payment_proof: args[9],
            created_at: now
          };
        } else if (tableName === 'mail_logs') {
          record = {
            id,
            recipient: args[0],
            subject: args[1],
            type: args[2],
            ref_id: args[3],
            status: args[4],
            message_id: args[5],
            error_msg: args[6],
            created_at: now
          };
        }
        table.unshift(record);
        self.save();
        return { lastInsertRowid: id, changes: 1 };
      },

      all(...args) {
        const table = self.tables[tableName] || [];
        return [...table];
      },

      get(...args) {
        const table = self.tables[tableName] || [];
        if (/count\(\*\)/i.test(normalized)) {
          return { count: table.length };
        }
        return table[0];
      }
    };
  }
}

module.exports = { InMemoryDb };
