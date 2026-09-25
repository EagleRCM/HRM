// ============================================
// CONFIGURATION
// ============================================
const SPREADSHEET_ID_PROPERTY = 'HRMS_SPREADSHEET_ID';
const DEFAULT_LEAVE_BALANCE_PROPERTY = 'HRMS_DEFAULT_LEAVE_BALANCE';
const INITIAL_ADMIN_ID_PROPERTY = 'HRMS_INITIAL_ADMIN_ID';
const INITIAL_ADMIN_PASSWORD_PROPERTY = 'HRMS_INITIAL_ADMIN_PASSWORD';
const INITIAL_ADMIN_EMAIL_PROPERTY = 'HRMS_INITIAL_ADMIN_EMAIL';
const SHEET_NAME = 'Employees';
const LEAVE_REQUESTS = 'LeaveRequests';
const ATTENDANCE = 'Attendance';
const SESSIONS = 'Sessions';
const AUDIT_LOG = 'AuditLog';
const NOTIFICATIONS = 'Notifications';

const SHEET_HEADERS = {};
SHEET_HEADERS[SHEET_NAME] = ['empId', 'name', 'email', 'department', 'role', 'managerId', 'managerEmail',
  'password_hash', 'salt', 'isActive', 'joiningDate', 'phone', 'address', 'leaveBalance'];
SHEET_HEADERS[LEAVE_REQUESTS] = ['requestId', 'empId', 'type', 'fromDate', 'toDate', 'duration', 'reason',
  'managerStatus', 'hrStatus', 'overallStatus', 'managerComment', 'hrComment', 'createdAt', 'updatedAt'];
SHEET_HEADERS[ATTENDANCE] = ['empId', 'date', 'checkIn', 'checkOut', 'hours'];
SHEET_HEADERS[SESSIONS] = ['token', 'empId', 'timestamp', 'status'];
SHEET_HEADERS[AUDIT_LOG] = ['timestamp', 'empId', 'action', 'details', 'actorEmail'];
SHEET_HEADERS[NOTIFICATIONS] = ['timestamp', 'empId', 'message', 'status'];

// ============================================
// WEB APP ENTRY POINT - SINGLE PAGE APP
// ============================================
function doGet(e) {

  try {

    const token =
      e && e.parameter
        ? e.parameter.token
        : null;


    // ==========================================
    // AUTHENTICATED USER
    // ==========================================

    if (token) {

      const session = validateSession_(token);

      if (session.valid) {

        const empId = session.empId;

        const user = {
          empId: empId,
          name: getEmployeeName_(empId),
          role: getUserRole_(empId),
          isAdmin_: isAdmin_(empId)
        };


        const requestedPage = String(e.parameter.page || '').toLowerCase();
        let fileName = 'MainApp';
        let title = 'HRMS Portal';

        if (requestedPage === 'admin') {
          if (!user.isAdmin_) {
            return HtmlService.createHtmlOutput('<h2>Access denied</h2><p>You are not authorized to view this page.</p>');
          }
          fileName = 'AdminPanel';
          title = 'Admin Panel - HRMS';
        } else if (requestedPage === 'reports') {
          if (!canManageEmployees_(empId)) {
            return HtmlService.createHtmlOutput('<h2>Access denied</h2><p>You are not authorized to view this page.</p>');
          }
          fileName = 'report';
          title = 'HR Reports - HRMS';
        }

        const template = HtmlService.createTemplateFromFile(fileName);


        template.tokenJson =
          JSON.stringify(token).replace(/</g, '\\u003c');

        template.userJson =
          JSON.stringify(user).replace(/</g, '\\u003c');


        return template
          .evaluate()
          .setTitle(title)
          .setXFrameOptionsMode(
            HtmlService.XFrameOptionsMode.ALLOWALL
          )
          .addMetaTag(
            'viewport',
            'width=device-width, initial-scale=1'
          );

      }

    }


    // ==========================================
    // LOGIN PAGE
    // ==========================================

    return HtmlService
      .createHtmlOutputFromFile('login')
      .setTitle('HRMS Login')
      .setXFrameOptionsMode(
        HtmlService.XFrameOptionsMode.ALLOWALL
      )
      .addMetaTag(
        'viewport',
        'width=device-width, initial-scale=1'
      );


  } catch (error) {

    console.error('doGet error:', error);

    return HtmlService
      .createHtmlOutput(
        '<h2>HRMS Error</h2>' +
        '<p>Unable to load the portal.</p>' +
        '<pre>' +
        String(error) +
        '</pre>'
      );

  }

}
// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================
function login(empId, password) {

  try {

    if (!empId || !password) {
      return {
        success: false,
        message: 'Employee ID and password are required.'
      };
    }

    const normalizedEmpId =
      String(empId).trim().toUpperCase();

    const sheet =
      getSpreadsheet_()
        .getSheetByName(SHEET_NAME);

    if (!sheet) {
      return {
        success: false,
        message: 'Employees sheet not found.'
      };
    }

    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return {
        success: false,
        message: 'No employee records found.'
      };
    }

    const headers = data[0];

    const empIndex =
      headers.indexOf('empId');

    const passwordIndex =
      headers.indexOf('password_hash');

    const saltIndex =
      headers.indexOf('salt');

    const nameIndex =
      headers.indexOf('name');

    const roleIndex =
      headers.indexOf('role');

    const statusIndex =
      headers.indexOf('isActive');

    const deptIndex =
      headers.indexOf('department');


    if (
      empIndex === -1 ||
      passwordIndex === -1 ||
      saltIndex === -1 ||
      statusIndex === -1
    ) {

      return {
        success: false,
        message: 'Employee sheet configuration error.'
      };

    }


    for (let i = 1; i < data.length; i++) {

      const row = data[i];

      const storedEmpId =
        String(row[empIndex])
          .trim()
          .toUpperCase();


      if (storedEmpId === normalizedEmpId) {


        // Account active check
        const active =
          row[statusIndex] === true ||
          String(row[statusIndex])
            .toUpperCase() === 'TRUE';


        if (!active) {

          return {
            success: false,
            message:
              'Account is inactive. Contact HR.'
          };

        }


        const storedHash =
          String(row[passwordIndex] || '');

        const salt =
          String(row[saltIndex] || '');

        const computedHash =
          hashPassword_(password, salt);


        if (computedHash === storedHash) {

          // Keep original Employee ID from sheet
          const actualEmpId =
            String(row[empIndex]).trim();

          const token =
            generateSessionToken_(actualEmpId);


          try {

            logActivity_(
              actualEmpId,
              'LOGIN',
              'Successful login'
            );

          } catch (logError) {

            console.log(
              'Audit logging failed:',
              logError
            );

          }


          return {

            success: true,

            token: token,

            user: {

              empId: actualEmpId,

              name:
                row[nameIndex] ||
                actualEmpId,

              role:
                row[roleIndex] ||
                'Employee',

              department:
                row[deptIndex] ||
                '',

              isAdmin_:
                isAdmin_(actualEmpId)

            }

          };

        }


        try {

          logActivity_(
            row[empIndex],
            'LOGIN_FAILED',
            'Invalid password'
          );

        } catch (e) {}


        return {
          success: false,
          message:
            'Invalid Employee ID or password.'
        };

      }

    }


    return {
      success: false,
      message:
        'Invalid Employee ID or password.'
    };


  } catch (error) {

    console.error(
      'Login error:',
      error
    );


    return {
      success: false,
      message:
        'System error. Please contact HR.'
    };

  }

}
function hashPassword_(password, salt) {
  const finalSalt = salt || Utilities.getUuid().substring(0, 16);
  const combined = password + finalSalt;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined);
  return digest.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

function normalizeEmpId_(empId) {
  return String(empId || '').trim().toUpperCase();
}

function toClientValue_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value;
}

function rowToObject_(headers, row, excludedFields) {
  const excluded = excludedFields || [];
  const result = {};
  headers.forEach(function(header, index) {
    if (excluded.indexOf(header) === -1) {
      result[header] = toClientValue_(row[index]);
    }
  });
  return result;
}

function generateSessionToken_(empId) {
  const timestamp = new Date().getTime();
  const random = Utilities.getUuid();
  const data = `${empId}|${timestamp}|${random}`;
  const token = Utilities.base64Encode(data);
  storeSession_(token, empId, timestamp);
  return token;
}

function storeSession_(token, empId, timestamp) {
  const sessionSheet = getOrCreateSheet_(SESSIONS);
  const expiryTime = new Date().getTime() - (8 * 60 * 60 * 1000);
  const allData = sessionSheet.getDataRange().getValues();
  for (let i = allData.length - 1; i >= 0; i--) {
    if (parseInt(allData[i][2]) < expiryTime) {
      sessionSheet.deleteRow(i + 1);
    }
  }
  sessionSheet.appendRow([token, empId, timestamp, 'ACTIVE']);
}

function validateSession_(token) {
  if (!token) return { valid: false };
  const sessionSheet = getSpreadsheet_().getSheetByName(SESSIONS);
  if (!sessionSheet) return { valid: false };

  const data = sessionSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token && String(data[i][3] || 'ACTIVE').toUpperCase() === 'ACTIVE') {
      const timestamp = parseInt(data[i][2]);
      const now = new Date().getTime();
      if (now - timestamp < 8 * 60 * 60 * 1000) {
        return { valid: true, empId: data[i][1] };
      }
    }
  }
  return { valid: false };
}

function logout(token) {
  const sessionSheet = getSpreadsheet_().getSheetByName(SESSIONS);
  if (!sessionSheet) return;

  const data = sessionSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      sessionSheet.deleteRow(i + 1);
      break;
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY);
  if (!spreadsheetId) {
    throw new Error('Missing Script Property: ' + SPREADSHEET_ID_PROPERTY);
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getDefaultLeaveBalance_() {
  const configured = Number(
    PropertiesService.getScriptProperties().getProperty(DEFAULT_LEAVE_BALANCE_PROPERTY)
  );
  return Number.isFinite(configured) && configured >= 0 ? configured : 15;
}

function configureSpreadsheet_(spreadsheetId) {
  if (!spreadsheetId || !String(spreadsheetId).trim()) {
    throw new Error('A spreadsheet ID is required.');
  }
  PropertiesService.getScriptProperties().setProperty(
    SPREADSHEET_ID_PROPERTY,
    String(spreadsheetId).trim()
  );
  return 'Spreadsheet configured successfully.';
}

function getOrCreateSheet_(name) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  const headers = SHEET_HEADERS[name];
  if (headers && sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function validateSetup_() {
  const result = { ok: true, errors: [], warnings: [] };
  let spreadsheet;
  try {
    spreadsheet = getSpreadsheet_();
  } catch (error) {
    result.ok = false;
    result.errors.push(String(error));
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  [SHEET_NAME, LEAVE_REQUESTS, ATTENDANCE, SESSIONS, AUDIT_LOG].forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      if (name === SHEET_NAME) {
        result.ok = false;
        result.errors.push('Missing required sheet: ' + name);
      } else {
        result.warnings.push('Sheet will be created on first use: ' + name);
      }
      return;
    }
    const values = sheet.getDataRange().getValues();
    const actualHeaders = values[0] || [];
    const missingHeaders = SHEET_HEADERS[name].filter(function(header) {
      return actualHeaders.indexOf(header) === -1;
    });
    if (missingHeaders.length) {
      result.ok = false;
      result.errors.push(name + ' is missing headers: ' + missingHeaders.join(', '));
    }
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function logActivity_(empId, action, details) {
  const logSheet = getOrCreateSheet_(AUDIT_LOG);
  logSheet.appendRow([
    new Date().toISOString(),
    empId,
    action,
    details,
    Session.getActiveUser().getEmail() || 'system'
  ]);
}

function isAdmin_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const roleIndex = headers.indexOf('role');

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      const role = String(data[i][roleIndex] || '').toUpperCase();
      return role === 'HR' || role === 'ADMIN' || role === 'MANAGER';
    }
  }
  return false;
}

function canManageEmployees_(empId) {
  const role = String(getUserRole_(empId) || '').toUpperCase();
  return role === 'HR' || role === 'ADMIN';
}

function getEmployeeName_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      return data[i][headers.indexOf('name')] || empId;
    }
  }
  return empId;
}

function getEmployeeEmail_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailIndex = headers.indexOf('email');

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      return data[i][emailIndex] || '';
    }
  }
  return '';
}

function getManagerId_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const managerIndex = headers.indexOf('managerId');

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      return data[i][managerIndex] || '';
    }
  }
  return '';
}

function getUserRole_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      return data[i][headers.indexOf('role')] || 'Employee';
    }
  }
  return 'Employee';
}

function getLeaveBalance_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      const rawBalance = data[i][headers.indexOf('leaveBalance')];
      const balance = rawBalance === '' || rawBalance == null ? NaN : Number(rawBalance);
      return Number.isFinite(balance) ? balance : getDefaultLeaveBalance_();
    }
  }
  return getDefaultLeaveBalance_();
}

function updateLeaveBalance_(empId, adjustment) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      const rawBalance = data[i][headers.indexOf('leaveBalance')];
      const storedBalance = rawBalance === '' || rawBalance == null ? NaN : Number(rawBalance);
      const current = Number.isFinite(storedBalance) ? storedBalance : getDefaultLeaveBalance_();
      const newBalance = current + adjustment;
      sheet.getRange(i + 1, headers.indexOf('leaveBalance') + 1).setValue(newBalance);
      return newBalance;
    }
  }
  return getDefaultLeaveBalance_();
}

function calculateWorkingDays_(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return 0;
  }
  let days = 0;
  const current = new Date(from);
  while (current <= to) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function getPortalUrl_() {
  return ScriptApp.getService().getUrl() || '';
}

// ============================================
// DASHBOARD DATA
// ============================================
function getDashboardData(token) {
  const session = validateSession_(token);
  if (!session.valid) {
    return { success: false, message: 'Invalid session' };
  }

  const empId = session.empId;
  const leaveBalance = getLeaveBalance_(empId);
  const pendingRequests = getPendingRequests_(empId);
  const monthlyLeaves = getMonthlyLeaves_(empId);
  const leaveHistory = getLeaveHistory_(empId);
  const attendance = getAttendance_(empId);

  return {
    success: true,
    leaveBalance: leaveBalance,
    pendingRequests: pendingRequests,
    monthlyLeaves: monthlyLeaves,
    leaveHistory: leaveHistory,
    attendance: attendance,
    isAdmin_: isAdmin_(empId),
    user: {
      empId: empId,
      name: getEmployeeName_(empId),
      role: getUserRole_(empId)
    }
  };
}

function getPendingRequests_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(LEAVE_REQUESTS);
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId) && data[i][headers.indexOf('overallStatus')] === 'PENDING') {
      count++;
    }
  }
  return count;
}

function getMonthlyLeaves_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(LEAVE_REQUESTS);
  if (!sheet) return 0;

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let total = 0;

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId) && data[i][headers.indexOf('overallStatus')] === 'APPROVED') {
      const fromDate = new Date(data[i][headers.indexOf('fromDate')]);
      if (fromDate.getMonth() === month && fromDate.getFullYear() === year) {
        total += parseInt(data[i][headers.indexOf('duration')]) || 0;
      }
    }
  }
  return total;
}

function getLeaveHistory_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(LEAVE_REQUESTS);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const history = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (normalizeEmpId_(row[headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      history.push({
        from: toClientValue_(row[headers.indexOf('fromDate')]),
        to: toClientValue_(row[headers.indexOf('toDate')]),
        type: row[headers.indexOf('type')],
        duration: row[headers.indexOf('duration')] || 0,
        status: row[headers.indexOf('overallStatus')] || 'PENDING'
      });
    }
    if (history.length >= 10) break;
  }
  return history;
}

function getAttendance_(empId) {
  const sheet = getSpreadsheet_().getSheetByName(ATTENDANCE);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const attendance = [];
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (normalizeEmpId_(row[headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      const date = new Date(row[headers.indexOf('date')]);
      if (date.getMonth() === month && date.getFullYear() === year) {
        attendance.push({
          date: toClientValue_(row[headers.indexOf('date')]),
          checkIn: row[headers.indexOf('checkIn')] || '--',
          checkOut: row[headers.indexOf('checkOut')] || '--',
          hours: row[headers.indexOf('hours')] || '0'
        });
      }
    }
    if (attendance.length >= 20) break;
  }
  return attendance;
}

// ============================================
// LEAVE MANAGEMENT
// ============================================
function applyLeave(data) {
  if (!data || !data.token) {
    return { success: false, message: 'Invalid request' };
  }
  const session = validateSession_(data.token);
  if (!session.valid) {
    return { success: false, message: 'Invalid session' };
  }

  const balance = getLeaveBalance_(session.empId);
  const duration = calculateWorkingDays_(data.from, data.to);

  if (['annual', 'sick', 'casual', 'other'].indexOf(String(data.type || '').toLowerCase()) === -1) {
    return { success: false, message: 'Invalid leave type' };
  }

  if (duration < 1) {
    return { success: false, message: 'Select a valid date range containing at least one working day' };
  }

  if (duration > balance) {
    return {
      success: false,
      message: `Insufficient leave balance. Available: ${balance} days, Requested: ${duration} days`
    };
  }

  const requestId = 'REQ' + new Date().getTime();
  const sheet = getOrCreateSheet_(LEAVE_REQUESTS);
  const managerId = getManagerId_(session.empId);

  sheet.appendRow([
    requestId,
    session.empId,
    data.type,
    data.from,
    data.to,
    duration,
    data.reason || '',
    'PENDING',
    'PENDING',
    'PENDING',
    '',
    '',
    new Date().toISOString(),
    new Date().toISOString()
  ]);

  logActivity_(session.empId, 'LEAVE_APPLIED', `${data.type} leave from ${data.from} to ${data.to}`);

  // Notify manager
  if (managerId) {
    const managerEmail = getEmployeeEmail_(managerId);
    if (managerEmail) {
      try {
        MailApp.sendEmail({
          to: managerEmail,
          subject: `Leave Request from ${session.empId}`,
          body: `Employee ${session.empId} has requested ${data.type} leave from ${data.from} to ${data.to} (${duration} days).\nReason: ${data.reason || 'N/A'}\n\nPlease review in the HRMS portal.`
        });
      } catch(e) {}
    }
  }

  return {
    success: true,
    message: 'Leave request submitted. Waiting for manager approval.',
    requestId: requestId
  };
}

function markAttendance(token, action) {
  const session = validateSession_(token);
  if (!session.valid) {
    return { success: false, message: 'Invalid session' };
  }

  const sheet = getOrCreateSheet_(ATTENDANCE);
  const empId = session.empId;
  const now = new Date();
  const timeZone = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, timeZone, 'yyyy-MM-dd');
  const time = Utilities.formatDate(now, timeZone, 'HH:mm:ss');

  const data = sheet.getDataRange().getValues();
  const headers = data[0] || ['empId', 'date', 'checkIn', 'checkOut', 'hours'];

  for (let i = data.length - 1; i >= 1; i--) {
    if (normalizeEmpId_(data[i][0]) === normalizeEmpId_(empId) && toClientValue_(data[i][1]) === today) {
      if (action === 'IN' && data[i][2]) {
        return { success: false, message: 'Already checked in today' };
      }
      if (action === 'OUT' && data[i][3]) {
        return { success: false, message: 'Already checked out today' };
      }
      if (action === 'OUT') {
        sheet.getRange(i + 1, headers.indexOf('checkOut') + 1).setValue(time);
        const checkIn = new Date(`${today}T${data[i][2]}`);
        const checkOut = new Date(`${today}T${time}`);
        const hours = ((checkOut - checkIn) / (1000 * 60 * 60)).toFixed(1);
        sheet.getRange(i + 1, headers.indexOf('hours') + 1).setValue(hours);
        logActivity_(empId, 'ATTENDANCE_OUT', `Checked out at ${time}`);
        return { success: true, message: 'Checked out successfully' };
      }
    }
  }

  if (action === 'IN') {
    sheet.appendRow([empId, today, time, '', '']);
    logActivity_(empId, 'ATTENDANCE_IN', `Checked in at ${time}`);
    return { success: true, message: 'Checked in successfully' };
  }

  return { success: false, message: 'No check-in found for today' };
}

function changePassword(token, currentPassword, newPassword) {
  const session = validateSession_(token);
  if (!session.valid) {
    return { success: false, message: 'Invalid session' };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const empId = session.empId;

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      const storedHash = data[i][headers.indexOf('password_hash')];
      const salt = data[i][headers.indexOf('salt')] || '';
      const computedHash = hashPassword_(currentPassword, salt);

      if (computedHash === storedHash) {
        const newSalt = Utilities.getUuid().substring(0, 16);
        const newHash = hashPassword_(newPassword, newSalt);
        sheet.getRange(i + 1, headers.indexOf('password_hash') + 1).setValue(newHash);
        sheet.getRange(i + 1, headers.indexOf('salt') + 1).setValue(newSalt);
        logActivity_(empId, 'PASSWORD_CHANGE', 'Password updated successfully');
        return { success: true, message: 'Password updated successfully' };
      } else {
        return { success: false, message: 'Current password is incorrect' };
      }
    }
  }
  return { success: false, message: 'Employee not found' };
}

// ============================================
// ADMIN FUNCTIONS
// ============================================
function getEmployees(token) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const employees = [];

  for (let i = 1; i < data.length; i++) {
    employees.push(rowToObject_(headers, data[i], ['password_hash', 'salt']));
  }
  return { success: true, employees: employees };
}

function getEmployee(token, empId) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const empIndex = headers.indexOf('empId');

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][empIndex]) === normalizeEmpId_(empId)) {
      return {
        success: true,
        profile: rowToObject_(headers, data[i], ['password_hash', 'salt'])
      };
    }
  }
  return { success: false, message: 'Employee not found' };
}

function addEmployee(token, employeeData) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const required = ['empId', 'name', 'email', 'department', 'role'];
  for (const field of required) {
    if (!employeeData[field]) {
      return { success: false, message: `Missing required field: ${field}` };
    }
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][0]) === normalizeEmpId_(employeeData.empId)) {
      return { success: false, message: 'Employee ID already exists' };
    }
  }

  const defaultPassword = generateTemporaryPassword_();
  const salt = Utilities.getUuid().substring(0, 16);
  const hash = hashPassword_(defaultPassword, salt);

  const headers = data[0];
  employeeData.empId = normalizeEmpId_(employeeData.empId);
  const newRow = [];
  headers.forEach(header => {
    if (header === 'password_hash') {
      newRow.push(hash);
    } else if (header === 'salt') {
      newRow.push(salt);
    } else if (header === 'isActive') {
      newRow.push('TRUE');
    } else if (header === 'joiningDate') {
      newRow.push(new Date().toISOString().split('T')[0]);
    } else if (header === 'leaveBalance') {
      newRow.push(getDefaultLeaveBalance_());
    } else {
      newRow.push(employeeData[header] || '');
    }
  });

  sheet.appendRow(newRow);
  logActivity_(session.empId, 'EMPLOYEE_ADDED', `Added employee ${employeeData.empId}`);

  return {
    success: true,
    message: 'Employee added. Temporary password: ' + defaultPassword
  };
}

function updateEmployee(token, empId, updateData) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      for (const key in updateData) {
        const colIndex = headers.indexOf(key);
        if (colIndex !== -1 && key !== 'empId' && key !== 'password_hash' && key !== 'salt') {
          sheet.getRange(i + 1, colIndex + 1).setValue(updateData[key]);
        }
      }
      logActivity_(session.empId, 'EMPLOYEE_UPDATED', `Updated employee ${empId}`);
      return { success: true, message: 'Employee updated successfully' };
    }
  }
  return { success: false, message: 'Employee not found' };
}

function deleteEmployee(token, empId) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  if (normalizeEmpId_(empId) === normalizeEmpId_(session.empId)) {
    return { success: false, message: 'Cannot delete your own account' };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][0]) === normalizeEmpId_(empId)) {
      sheet.getRange(i + 1, data[0].indexOf('isActive') + 1).setValue('FALSE');
      logActivity_(session.empId, 'EMPLOYEE_DELETED', `Deactivated employee ${empId}`);
      return { success: true, message: 'Employee deactivated successfully' };
    }
  }
  return { success: false, message: 'Employee not found' };
}

function resetPassword(token, empId) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const newPassword = generateTemporaryPassword_();
  const salt = Utilities.getUuid().substring(0, 16);
  const hash = hashPassword_(newPassword, salt);

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(empId)) {
      sheet.getRange(i + 1, headers.indexOf('password_hash') + 1).setValue(hash);
      sheet.getRange(i + 1, headers.indexOf('salt') + 1).setValue(salt);

      logActivity_(session.empId, 'PASSWORD_RESET', `Reset password for ${empId}`);
      return {
        success: true,
        message: 'Password reset. Temporary password: ' + newPassword
      };
    }
  }
  return { success: false, message: 'Employee not found' };
}

// ============================================
// GET EMPLOYEE PROFILE
// ============================================
function getEmployeeProfile(token) {
  const session = validateSession_(token);
  if (!session.valid) {
    return { success: false, message: 'Invalid session' };
  }

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][headers.indexOf('empId')]) === normalizeEmpId_(session.empId)) {
      const profile = rowToObject_(headers, data[i], ['password_hash', 'salt']);
      return { success: true, profile: profile };
    }
  }
  return { success: false, message: 'Employee not found' };
}

// ============================================
// LEAVE APPROVALS AND REPORTING
// ============================================
function getPendingApprovals(token) {
  const session = validateSession_(token);
  if (!session.valid || !isAdmin_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const sheet = getSpreadsheet_().getSheetByName(LEAVE_REQUESTS);
  if (!sheet) return { success: true, requests: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const role = String(getUserRole_(session.empId) || '').toUpperCase();
  const requests = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const employeeId = row[headers.indexOf('empId')];
    const managerStatus = String(row[headers.indexOf('managerStatus')] || 'PENDING').toUpperCase();
    const hrStatus = String(row[headers.indexOf('hrStatus')] || 'PENDING').toUpperCase();
    const overallStatus = String(row[headers.indexOf('overallStatus')] || 'PENDING').toUpperCase();
    let visible = false;

    if (role === 'MANAGER') {
      visible = normalizeEmpId_(getManagerId_(employeeId)) === normalizeEmpId_(session.empId) && managerStatus === 'PENDING';
    } else if (role === 'HR') {
      visible = managerStatus === 'APPROVED' && hrStatus === 'PENDING';
    } else if (role === 'ADMIN') {
      visible = overallStatus === 'PENDING';
    }

    if (visible) {
      requests.push({
        requestId: row[headers.indexOf('requestId')],
        empId: employeeId,
        employeeName: getEmployeeName_(employeeId),
        type: row[headers.indexOf('type')],
        from: toClientValue_(row[headers.indexOf('fromDate')]),
        to: toClientValue_(row[headers.indexOf('toDate')]),
        duration: Number(row[headers.indexOf('duration')]) || 0,
        managerStatus: managerStatus,
        hrStatus: hrStatus,
        overallStatus: overallStatus
      });
    }
  }

  return { success: true, requests: requests };
}

function approveLeave(token, requestId, approvalRole, comment) {
  return updateLeaveApproval_(token, requestId, approvalRole, comment, true);
}

function rejectLeave(token, requestId, approvalRole, comment) {
  return updateLeaveApproval_(token, requestId, approvalRole, comment, false);
}

function updateLeaveApproval_(token, requestId, approvalRole, comment, approved) {
  const session = validateSession_(token);
  if (!session.valid || !isAdmin_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(LEAVE_REQUESTS);
    if (!sheet) return { success: false, message: 'Leave request not found' };

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const requestIndex = headers.indexOf('requestId');
    const actualRole = String(getUserRole_(session.empId) || '').toUpperCase();
    const normalizedApprovalRole = String(approvalRole || '').toLowerCase();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][requestIndex]) !== String(requestId)) continue;

      const employeeId = data[i][headers.indexOf('empId')];
      const previousOverall = String(data[i][headers.indexOf('overallStatus')] || 'PENDING').toUpperCase();
      if (previousOverall !== 'PENDING') {
        return { success: false, message: 'This request has already been finalized' };
      }

      const isEmployeeManager = normalizeEmpId_(getManagerId_(employeeId)) === normalizeEmpId_(session.empId);
      const canActAsManager = actualRole === 'ADMIN' || (actualRole === 'MANAGER' && isEmployeeManager);
      const canActAsHr = actualRole === 'ADMIN' || actualRole === 'HR';

      if (normalizedApprovalRole === 'manager' && !canActAsManager) {
        return { success: false, message: 'Not authorized for manager approval' };
      }
      if (normalizedApprovalRole === 'hr' && !canActAsHr) {
        return { success: false, message: 'Not authorized for HR approval' };
      }
      if (normalizedApprovalRole === 'admin' && actualRole !== 'ADMIN') {
        return { success: false, message: 'Not authorized for admin approval' };
      }

      const status = approved ? 'APPROVED' : 'REJECTED';
      const finalApproval = approved && (normalizedApprovalRole === 'hr' || normalizedApprovalRole === 'admin');
      const duration = Number(data[i][headers.indexOf('duration')]) || 0;
      if (finalApproval && duration > getLeaveBalance_(employeeId)) {
        return { success: false, message: 'Employee no longer has sufficient leave balance' };
      }

      if (normalizedApprovalRole === 'manager') {
        sheet.getRange(i + 1, headers.indexOf('managerStatus') + 1).setValue(status);
        sheet.getRange(i + 1, headers.indexOf('managerComment') + 1).setValue(comment || '');
        if (!approved) {
          sheet.getRange(i + 1, headers.indexOf('overallStatus') + 1).setValue('REJECTED');
        }
      } else if (normalizedApprovalRole === 'hr') {
        if (String(data[i][headers.indexOf('managerStatus')]).toUpperCase() !== 'APPROVED') {
          return { success: false, message: 'Manager approval is required first' };
        }
        sheet.getRange(i + 1, headers.indexOf('hrStatus') + 1).setValue(status);
        sheet.getRange(i + 1, headers.indexOf('hrComment') + 1).setValue(comment || '');
        sheet.getRange(i + 1, headers.indexOf('overallStatus') + 1).setValue(status);
      } else if (normalizedApprovalRole === 'admin') {
        sheet.getRange(i + 1, headers.indexOf('managerStatus') + 1).setValue(status);
        sheet.getRange(i + 1, headers.indexOf('hrStatus') + 1).setValue(status);
        sheet.getRange(i + 1, headers.indexOf('hrComment') + 1).setValue(comment || '');
        sheet.getRange(i + 1, headers.indexOf('overallStatus') + 1).setValue(status);
      } else {
        return { success: false, message: 'Invalid approval role' };
      }

      if (finalApproval) {
        updateLeaveBalance_(employeeId, -duration);
      }

      sheet.getRange(i + 1, headers.indexOf('updatedAt') + 1).setValue(new Date().toISOString());
      logActivity_(session.empId, approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', String(requestId));
      return { success: true, message: approved ? 'Leave request approved' : 'Leave request rejected' };
    }
    return { success: false, message: 'Leave request not found' };
  } finally {
    lock.releaseLock();
  }
}

function getHRReport(token, reportType, filters) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  if (reportType === 'leave_summary') {
    return { success: true, data: buildLeaveSummary_() };
  }
  if (reportType === 'attendance_summary') {
    return { success: true, data: buildAttendanceSummary_() };
  }
  if (reportType === 'attendance_rate') {
    return { success: true, data: buildAttendanceRate_() };
  }
  if (reportType === 'department_analytics') {
    return { success: true, data: buildDepartmentAnalytics_() };
  }
  if (reportType === 'employee_metrics') {
    return { success: true, data: buildEmployeeMetrics_() };
  }
  return { success: false, message: 'Unknown report type' };
}

function buildLeaveSummary_() {
  const sheet = getSpreadsheet_().getSheetByName(LEAVE_REQUESTS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const summary = {};
  for (let i = 1; i < data.length; i++) {
    const date = new Date(data[i][headers.indexOf('fromDate')]);
    if (isNaN(date.getTime())) continue;
    const month = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
    const status = String(data[i][headers.indexOf('overallStatus')] || 'PENDING').toUpperCase();
    if (!summary[month]) summary[month] = { month: month, total: 0, approved: 0, rejected: 0, pending: 0 };
    summary[month].total++;
    if (status === 'APPROVED') summary[month].approved++;
    else if (status === 'REJECTED') summary[month].rejected++;
    else summary[month].pending++;
  }
  return Object.keys(summary).sort().reverse().map(function(month) { return summary[month]; });
}

function buildAttendanceSummary_() {
  const sheet = getSpreadsheet_().getSheetByName(ATTENDANCE);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const summary = {};
  for (let i = 1; i < data.length; i++) {
    const empId = String(data[i][headers.indexOf('empId')] || '');
    if (!empId) continue;
    if (!summary[empId]) summary[empId] = { empId: empId, name: getEmployeeName_(empId), days: 0, hours: 0, late: 0 };
    summary[empId].days++;
    summary[empId].hours += Number(data[i][headers.indexOf('hours')]) || 0;
    if (String(data[i][headers.indexOf('checkIn')] || '') > '09:15:00') summary[empId].late++;
  }
  return Object.keys(summary).map(function(empId) {
    const item = summary[empId];
    item.avgHours = item.days ? (item.hours / item.days).toFixed(1) : '0.0';
    return item;
  });
}

function buildAttendanceRate_() {
  const employeeSheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  if (!employeeSheet) return 0;
  const employeeData = employeeSheet.getDataRange().getValues();
  const employeeHeaders = employeeData[0] || [];
  const activeEmployees = employeeData.slice(1).filter(function(row) {
    return String(row[employeeHeaders.indexOf('isActive')]).toUpperCase() === 'TRUE';
  }).length;
  if (!activeEmployees) return 0;

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const elapsedWorkingDays = calculateWorkingDays_(firstDay, now);
  if (!elapsedWorkingDays) return 0;

  const attendanceSheet = getSpreadsheet_().getSheetByName(ATTENDANCE);
  if (!attendanceSheet) return 0;
  const attendanceData = attendanceSheet.getDataRange().getValues();
  const attendanceHeaders = attendanceData[0] || [];
  const seen = {};
  for (let i = 1; i < attendanceData.length; i++) {
    const date = new Date(attendanceData[i][attendanceHeaders.indexOf('date')]);
    if (isNaN(date.getTime()) || date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) continue;
    const empId = normalizeEmpId_(attendanceData[i][attendanceHeaders.indexOf('empId')]);
    seen[empId + '|' + toClientValue_(date)] = true;
  }
  return Math.min(100, Math.round(Object.keys(seen).length * 100 / (activeEmployees * elapsedWorkingDays)));
}

function buildDepartmentAnalytics_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const result = {};
  for (let i = 1; i < data.length; i++) {
    const department = String(data[i][headers.indexOf('department')] || 'Unassigned');
    const role = String(data[i][headers.indexOf('role')] || 'Employee');
    if (!result[department]) result[department] = { count: 0, roles: {} };
    result[department].count++;
    result[department].roles[role] = (result[department].roles[role] || 0) + 1;
  }
  return result;
}

function buildEmployeeMetrics_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAME);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  return data.slice(1).map(function(row) {
    return {
      empId: row[headers.indexOf('empId')],
      name: row[headers.indexOf('name')],
      department: row[headers.indexOf('department')],
      status: row[headers.indexOf('isActive')],
      leaveBalance: row[headers.indexOf('leaveBalance')] === ''
        ? getDefaultLeaveBalance_()
        : Number(row[headers.indexOf('leaveBalance')]) || 0
    };
  });
}

function getAllLeaveRequests(token) {
  const session = validateSession_(token);
  if (!session.valid || !isAdmin_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }
  const sheet = getSpreadsheet_().getSheetByName(LEAVE_REQUESTS);
  if (!sheet) return { success: true, requests: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const role = String(getUserRole_(session.empId) || '').toUpperCase();
  const requests = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const employeeId = row[headers.indexOf('empId')];
    if (role === 'MANAGER' && normalizeEmpId_(getManagerId_(employeeId)) !== normalizeEmpId_(session.empId)) {
      continue;
    }
    requests.push({
      requestId: row[headers.indexOf('requestId')],
      empId: employeeId,
      employeeName: getEmployeeName_(employeeId),
      type: row[headers.indexOf('type')],
      from: toClientValue_(row[headers.indexOf('fromDate')]),
      to: toClientValue_(row[headers.indexOf('toDate')]),
      duration: Number(row[headers.indexOf('duration')]) || 0,
      status: String(row[headers.indexOf('overallStatus')] || 'PENDING').toUpperCase()
    });
  }
  return { success: true, requests: requests };
}

function getSystemSettings(token) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }
  return { success: true, defaultLeaveBalance: getDefaultLeaveBalance_() };
}

function updateSystemSettings(token, settings) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }
  const balance = Number(settings && settings.defaultLeaveBalance);
  if (!Number.isFinite(balance) || balance < 0 || balance > 365) {
    return { success: false, message: 'Default leave balance must be between 0 and 365' };
  }
  PropertiesService.getScriptProperties().setProperty(DEFAULT_LEAVE_BALANCE_PROPERTY, String(balance));
  logActivity_(session.empId, 'SETTINGS_UPDATED', 'Default leave balance set to ' + balance);
  return { success: true, message: 'Settings saved' };
}

function exportDataCsv(token, type) {
  const session = validateSession_(token);
  if (!session.valid || !canManageEmployees_(session.empId)) {
    return { success: false, message: 'Unauthorized' };
  }

  const sheetByType = {
    employees: SHEET_NAME,
    leaves: LEAVE_REQUESTS,
    attendance: ATTENDANCE
  };
  const sheetName = sheetByType[type];
  if (!sheetName) return { success: false, message: 'Invalid export type' };
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'No data available' };

  const data = sheet.getDataRange().getValues();
  let exportData = data;
  if (type === 'employees' && data.length) {
    const excluded = ['password_hash', 'salt'];
    const includedIndexes = data[0].map(function(header, index) {
      return excluded.indexOf(header) === -1 ? index : -1;
    }).filter(function(index) { return index !== -1; });
    exportData = data.map(function(row) {
      return includedIndexes.map(function(index) { return row[index]; });
    });
  }

  const csv = exportData.map(function(row) {
    return row.map(function(value) {
      const text = String(toClientValue_(value == null ? '' : value)).replace(/"/g, '""');
      return '"' + text + '"';
    }).join(',');
  }).join('\r\n');

  return {
    success: true,
    filename: type + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '.csv',
    content: csv
  };
}

// ============================================
// SETUP FUNCTIONS
// ============================================
function generateTemporaryPassword_() {
  return 'Tmp#' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function setupAdmin_(adminId, password, email) {
  const properties = PropertiesService.getScriptProperties();
  adminId = adminId || properties.getProperty(INITIAL_ADMIN_ID_PROPERTY);
  password = password || properties.getProperty(INITIAL_ADMIN_PASSWORD_PROPERTY);
  email = email || properties.getProperty(INITIAL_ADMIN_EMAIL_PROPERTY);
  adminId = normalizeEmpId_(adminId);
  email = String(email || '').trim();
  if (!adminId || !password || String(password).length < 10 || !email) {
    throw new Error('Provide adminId, a password of at least 10 characters, and an email address.');
  }
  const salt = Utilities.getUuid().substring(0, 16);
  const hash = hashPassword_(password, salt);

  const sheet = getOrCreateSheet_(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmpId_(data[i][0]) === adminId) {
      properties.deleteProperty(INITIAL_ADMIN_PASSWORD_PROPERTY);
      return 'Admin already exists';
    }
  }

  sheet.appendRow([
    adminId,
    'System Admin',
    email,
    'Administration',
    'Admin',
    '',
    '',
    hash,
    salt,
    'TRUE',
    new Date().toISOString().split('T')[0],
    '',
    '',
    30
  ]);

  properties.deleteProperty(INITIAL_ADMIN_PASSWORD_PROPERTY);

  return 'Admin created successfully!';
}
