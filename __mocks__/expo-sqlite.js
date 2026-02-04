/**
 * Modern expo-sqlite mock supporting openDatabaseSync and the new async API.
 */

const mockRows = [];

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockImplementation(async (sql, params = []) => {
    const sqlLower = sql.toLowerCase();

    if (sqlLower.includes('insert') || sqlLower.includes('replace')) {
      const row = {
        id: params[0],
        name: params[1],
        payload: params[2],
        data: params[3],
        priority: params[4],
        active: params[5],
        timeout: params[6],
        created: params[7],
        failed: params[8],
      };
      const idx = mockRows.findIndex((r) => r.id === row.id);
      if (idx > -1) mockRows[idx] = row;
      else mockRows.push(row);
      return { lastInsertRowId: 1, changes: 1 };
    }

    if (sqlLower.includes('delete from') && !sqlLower.includes('where')) {
      mockRows.length = 0;
    }

    if (sqlLower.includes('delete from') && sqlLower.includes('where id =')) {
      const id = params[0];
      const idx = mockRows.findIndex((r) => r.id === id);
      if (idx > -1) mockRows.splice(idx, 1);
    }

    if (
      sqlLower.includes('update') &&
      sqlLower.includes('set active = 0 where active = 1')
    ) {
      mockRows.forEach((r) => {
        if (r.active === 1) r.active = 0;
      });
      return { changes: 1 };
    }

    if (sqlLower.includes('update') && sqlLower.includes('set active = 1')) {
      // atomic claim: UPDATE ... WHERE id IN (...)
      // Extract IDs from SQL like WHERE id IN ('id1','id2')
      const matches = sql.match(/'([^']+)'/g);
      if (matches) {
        const ids = matches.map((m) => m.replace(/'/g, ''));
        mockRows.forEach((r) => {
          if (ids.includes(r.id)) r.active = 1;
        });
      }
      return { changes: 1 };
    }

    if (sqlLower.includes('update')) {
      const id = params[3];
      const row = mockRows.find((r) => r.id === id);
      if (row) {
        row.active = params[0];
        row.failed = params[1];
        row.data = params[2];
      }
    }

    return { changes: 1 };
  }),

  getAllAsync: jest.fn().mockImplementation(async (sql, params = []) => {
    const sqlLower = sql.toLowerCase();
    let result = [...mockRows];

    if (sqlLower.includes('where active = 0')) {
      result = result.filter((r) => r.active === 0);
    }

    if (sqlLower.includes('where id =')) {
      const id = params[0];
      return result.filter((r) => r.id === id);
    }

    // Sort by priority DESC, created ASC
    if (sqlLower.includes('order by priority desc, created asc')) {
      result.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      });
    }

    if (sqlLower.includes('limit ?')) {
      const limit = params[params.length - 1];
      result = result.slice(0, limit);
    }

    return result;
  }),

  getFirstAsync: jest.fn().mockImplementation(async (sql, params = []) => {
    const rows = await mockDb.getAllAsync(sql, params);
    return rows[0] || null;
  }),

  withExclusiveTransactionAsync: jest
    .fn()
    .mockImplementation(async (callback) => {
      return await callback({
        getAllAsync: mockDb.getAllAsync,
        runAsync: mockDb.runAsync,
      });
    }),
};

export const openDatabaseSync = jest.fn().mockReturnValue(mockDb);

// Legacy API support
export const openDatabase = jest.fn(() => ({
  transaction: (cb) =>
    cb({
      executeSql: (sql, params, success) => {
        success?.({}, { rows: { _array: [], length: 0 } });
      },
    }),
}));
