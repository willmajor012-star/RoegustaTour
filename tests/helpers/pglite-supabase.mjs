// Test-only adapter: executes queries and RPCs in Postgres, keeping the actual
// Netlify handlers and their authentication/validation in the rehearsal path.
export function pgliteSupabase(db) {
  const identifier = (name) => {
    if (!/^[a-z_][a-z_0-9]*$/i.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
    return `"${name}"`;
  };
  return {
    async rpc(name, args) {
      try {
        const keys = Object.keys(args);
        const sql = `select public.${identifier(name)}(${keys.map((key, i) => `${identifier(key)} => $${i + 1}`).join(',')}) result`;
        return { data: (await db.query(sql, Object.values(args))).rows[0].result, error: null };
      } catch (error) { return { data: null, error: { message: error.message } }; }
    },
    from(table) {
      let operation = 'select'; let values; let single = false; let limit; let columns = '*';
      const filters = []; const order = [];
      const query = {
        select: (selection = '*') => { columns = selection; return query; },
        eq: (key, value) => { filters.push([key, '=', value]); return query; },
        in: (key, value) => { filters.push([key, 'in', value]); return query; },
        order: (key, { ascending = true } = {}) => { order.push(`${identifier(key)} ${ascending ? 'asc' : 'desc'}`); return query; },
        limit: (n) => { limit = n; return query; },
        single: () => { single = true; return query; },
        maybeSingle: () => { single = true; return query; },
        insert: (row) => { operation = 'insert'; values = row; return query; },
        update: (row) => { operation = 'update'; values = row; return query; },
        delete: () => { operation = 'delete'; return query; },
        then(resolve, reject) {
          return (async () => {
            try {
              const params = [];
              const param = (value) => { params.push(value); return `$${params.length}`; };
              let sql;
              const keys = Object.keys(values ?? {});
              if (operation === 'insert') sql = `insert into ${identifier(table)} (${keys.map(identifier).join(',')}) values (${keys.map((key) => param(values[key])).join(',')})`;
              else if (operation === 'update') sql = `update ${identifier(table)} set ${keys.map((key) => `${identifier(key)}=${param(values[key])}`).join(',')}`;
              else if (operation === 'delete') sql = `delete from ${identifier(table)}`;
              else sql = `select * from ${identifier(table)}`;
              if (filters.length) sql += ' where ' + filters.map(([key, op, value]) => op === 'in'
                ? value.length ? `${identifier(key)} in (${value.map(param).join(',')})` : 'false'
                : `${identifier(key)}=${param(value)}`).join(' and ');
              if (operation === 'select') {
                if (order.length) sql += ` order by ${order.join(',')}`;
                if (limit !== undefined) sql += ` limit ${Number(limit)}`;
              } else sql += ' returning *';
              const { rows } = await db.query(sql, params);
              if (columns.includes('players(')) {
                for (const row of rows) row.players = (await db.query('select * from players where id=$1', [row.player_id])).rows[0];
              }
              const wireRows = JSON.parse(JSON.stringify(rows)).map((row) => Object.fromEntries(
                Object.entries(row).map(([key, value]) => [key,
                  key.endsWith('_date') && typeof value === 'string' ? value.slice(0, 10) : value,
                ]),
              ));
              return { data: single ? wireRows[0] ?? null : wireRows, error: null };
            } catch (error) { return { data: null, error: { message: error.message } }; }
          })().then(resolve, reject);
        },
      };
      return query;
    },
  };
}
