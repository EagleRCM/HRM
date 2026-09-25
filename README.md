# HRMS Google Apps Script Web App

An employee HR portal built as a Google Apps Script web app with a Google Sheet as its datastore. It includes login sessions, employee dashboards, attendance, leave requests, manager/HR approvals, employee administration, reports, settings, and CSV exports.

This repository began as the HRM trial project for sharing and testing.

## Files used by the deployed app

- `code.gs` — server-side Apps Script code
- `login.html` — unauthenticated login page
- `MainApp.html` — authenticated employee dashboard
- `AdminPanel.html` — manager, HR, and admin workspace
- `report.html` — standalone HR reports page
- `appsscript.json` — V8 runtime and web-app manifest
- `dashboard.html` — retained legacy dashboard; it is not routed by `doGet()`

## Required spreadsheet configuration

The spreadsheet ID is deliberately not committed to GitHub. In the Apps Script editor:

1. Open **Project Settings**.
2. Add the script property `HRMS_SPREADSHEET_ID`.
3. Set its value to the target Google Spreadsheet ID.

The app creates these sheets and their header rows when first needed: `Employees`, `LeaveRequests`, `Attendance`, `Sessions`, `AuditLog`, and `Notifications`.

## First admin

Add these temporary script properties in **Project Settings**:

- `HRMS_INITIAL_ADMIN_ID`
- `HRMS_INITIAL_ADMIN_PASSWORD` (at least 10 characters)
- `HRMS_INITIAL_ADMIN_EMAIL`

Then run `setupAdmin_` once from the Apps Script editor. The trailing underscore keeps this bootstrap function private from browser RPC calls. The bootstrap password property is deleted after the account is created successfully.

Run `validateSetup_` from the editor before deployment. It reports a missing spreadsheet property, missing sheets, and incompatible header names without changing existing data.

Do not commit real passwords or `.clasp.json`.

## Local validation

Node.js 18 or newer is sufficient; there are no package dependencies.

```powershell
npm test
```

This validates server and browser JavaScript syntax, confirms that browser RPC calls have matching server functions, runs core date/configuration unit checks, validates the manifest, and scans for the previously hard-coded deployment values.

## Deploy with clasp

Install and authenticate clasp, then associate this folder with an existing Apps Script project:

```powershell
npm install --global @google/clasp
clasp login
```

Create a local `.clasp.json` file (it is intentionally ignored by Git):

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "."
}
```

Then upload and deploy:

```powershell
clasp push
clasp version "HRMS release"
clasp deploy --description "HRMS web app"
```

Deploy as a web app that executes as the deploying user. Choose the access policy appropriate for your organization; the included manifest permits anonymous users to reach the login page, while application data remains behind the app's own login and role checks.

## GitHub

After reviewing the changes:

```powershell
git init
git add .
git commit -m "Repair and prepare HRMS Apps Script app"
git branch -M main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

The GitHub repository stores source code only. Deploying to Apps Script is a separate `clasp push`/web-app deployment step.
