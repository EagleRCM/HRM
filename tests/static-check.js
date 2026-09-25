'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'code.gs');
const htmlFiles = fs.readdirSync(root).filter(name => name.endsWith('.html'));
const serverSource = fs.readFileSync(serverPath, 'utf8');

new vm.Script(serverSource, { filename: 'code.gs' });

const serverFunctions = new Set(
  [...serverSource.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)].map(match => match[1])
);
const allowedPublicFunctions = new Set([
  'doGet', 'login', 'logout', 'getDashboardData', 'applyLeave', 'markAttendance',
  'changePassword', 'getEmployees', 'getEmployee', 'addEmployee', 'updateEmployee',
  'deleteEmployee', 'resetPassword', 'getEmployeeProfile', 'getPendingApprovals',
  'approveLeave', 'rejectLeave', 'getHRReport', 'getAllLeaveRequests',
  'getSystemSettings', 'updateSystemSettings', 'exportDataCsv'
]);
for (const name of serverFunctions) {
  assert(name.endsWith('_') || allowedPublicFunctions.has(name),
    `Internal helper ${name}() is exposed to browser RPC; suffix it with an underscore`);
}
const ignoredChainMethods = new Set([
  'withSuccessHandler', 'withFailureHandler', 'getElementById', 'addEventListener', 'map', 'join'
]);

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    const javascript = match[1]
      .replace(/<\?!=\s*tokenJson\s*\?>/g, '"test-token"')
      .replace(/<\?!=\s*userJson\s*\?>/g, '{"empId":"TEST","role":"Admin","isAdmin":true}')
      .replace(/<\?=[\s\S]*?\?>/g, '""');
    new vm.Script(javascript, { filename: `${file}:script-${index + 1}` });
  });

  for (const match of html.matchAll(/^\s*\.([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const name = match[1];
    if (!ignoredChainMethods.has(name)) {
      assert(serverFunctions.has(name), `${file} calls missing server function ${name}()`);
    }
  }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }
  getLastRow() { return this.rows.length; }
  appendRow(row) { this.rows.push([...row]); }
  deleteRow(rowNumber) { this.rows.splice(rowNumber - 1, 1); }
  getDataRange() { return { getValues: () => this.rows.map(row => [...row]) }; }
  getRange(row, column) {
    return {
      setValue: value => {
        while (this.rows.length < row) this.rows.push([]);
        this.rows[row - 1][column - 1] = value;
      }
    };
  }
}

class MockSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

const scriptProperties = new Map([
  ['HRMS_SPREADSHEET_ID', 'test-sheet-id'],
  ['HRMS_DEFAULT_LEAVE_BALANCE', '15']
]);
const spreadsheet = new MockSpreadsheet();

const context = {
  console,
  Date,
  Math,
  JSON,
  Number,
  String,
  Object,
  Array,
  Utilities: {
    getUuid: () => '12345678-1234-1234-1234-123456789abc',
    formatDate: (date, timeZone, format) => {
      const iso = new Date(date).toISOString();
      if (format === 'HH:mm:ss') return '09:00:00';
      if (format === 'yyyy-MM') return iso.slice(0, 7);
      if (format === 'yyyyMMdd') return iso.slice(0, 10).replace(/-/g, '');
      return iso.slice(0, 10);
    },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest: (algorithm, value) => [...crypto.createHash('sha256').update(value).digest()],
    base64Encode: value => Buffer.from(value).toString('base64')
  },
  Session: {
    getScriptTimeZone: () => 'Asia/Kolkata',
    getActiveUser: () => ({ getEmail: () => 'test@example.com' })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: key => scriptProperties.get(key) || null,
      setProperty: (key, value) => scriptProperties.set(key, value),
      deleteProperty: key => scriptProperties.delete(key)
    })
  },
  SpreadsheetApp: { openById: id => {
    assert.equal(id, 'test-sheet-id');
    return spreadsheet;
  } },
  MailApp: { sendEmail: () => undefined },
  LockService: {
    getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined })
  },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://example.test/exec' }) }
};
vm.createContext(context);
new vm.Script(serverSource, { filename: 'code.gs' }).runInContext(context);

assert.equal(context.normalizeEmpId_(' emp001 '), 'EMP001');
assert.equal(context.calculateWorkingDays_('2026-09-21', '2026-09-25'), 5);
assert.equal(context.calculateWorkingDays_('2026-09-26', '2026-09-27'), 0);
assert.equal(context.calculateWorkingDays_('2026-09-28', '2026-09-25'), 0);
assert.equal(context.getDefaultLeaveBalance_(), 15);
assert.match(context.generateTemporaryPassword_(), /^Tmp#[a-fA-F0-9]{12}$/);

assert.equal(context.setupAdmin_('ADMIN001', 'a-strong-password', 'admin@example.com'),
  'Admin created successfully!');
const adminLogin = context.login('admin001', 'a-strong-password');
assert.equal(adminLogin.success, true);
assert.equal(context.login('admin001', 'wrong-password').success, false);
assert.equal(context.validateSession_(adminLogin.token).valid, true);

const addEmployee = context.addEmployee(adminLogin.token, {
  empId: 'emp001',
  name: 'Test Employee',
  email: 'employee@example.com',
  department: 'Engineering',
  role: 'Employee'
});
assert.equal(addEmployee.success, true);
const temporaryPassword = addEmployee.message.match(/Temporary password: (.+)$/)[1];
const employeeLogin = context.login('EMP001', temporaryPassword);
assert.equal(employeeLogin.success, true);

const leave = context.applyLeave({
  token: employeeLogin.token,
  type: 'annual',
  from: '2026-09-21',
  to: '2026-09-22',
  reason: 'Test leave'
});
assert.equal(leave.success, true);
assert.equal(context.approveLeave(adminLogin.token, leave.requestId, 'admin', 'Approved').success, true);
assert.equal(context.getLeaveBalance_('EMP001'), 13);
assert.equal(context.getDashboardData(employeeLogin.token).leaveHistory[0].status, 'APPROVED');
assert.equal(context.getHRReport(adminLogin.token, 'leave_summary', {}).data[0].approved, 1);

assert.equal(context.markAttendance(employeeLogin.token, 'IN').success, true);
assert.equal(context.markAttendance(employeeLogin.token, 'OUT').success, true);
assert.equal(context.getDashboardData(employeeLogin.token).attendance.length, 1);
assert.equal(context.validateSetup_().ok, true);

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
assert.equal(manifest.runtimeVersion, 'V8');
assert.equal(manifest.timeZone, 'Asia/Kolkata');
assert.equal(manifest.webapp.access, 'ANYONE_ANONYMOUS');
assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');

assert(!/admin098|Admin@12345|1o8cX5t01Jt7j7CeWmpwv0-As68HSl1atxAIYxxHj6lk/.test(serverSource),
  'Hard-coded deployment data or credentials found');

console.log(`Validated code.gs and ${htmlFiles.length} HTML files.`);
console.log(`Verified ${serverFunctions.size} server functions, core workflows, and Apps Script manifest.`);
