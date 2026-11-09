# Salary Summary Dashboard

A secure, automated dashboard that turns your monthly **Salary Sheet** into four reports:
**Field Sales, MIS Entry, Reclassification and Tally Entry**, with KPIs, charts, validation,
and Excel / Word / PDF export. Built with Next.js, Tailwind, Google Drive, Supabase and Vercel.

Your only monthly job: **drop the new sheet into the year folder in Google Drive** (e.g. `2026/Salary Sheet - Nov'26.xls`).
The dashboard re-checks Drive every 3 minutes (and whenever the browser tab is brought back to the front), picks up the
new file by its month and year, adds it to the Year/Month filters and opens its reports automatically. No Refresh press,
no code change. (The Refresh button is still there to force an immediate check.)

---

## Views: single month, custom range, comparisons

| View | What it shows |
|---|---|
| **Single month** | One month's four reports (default; the latest month opens automatically). |
| **Custom range** | Pick a **From** and **To** month (or a quick range: last 3 / 6 / 12 months, financial year to date). The four reports are built for the whole range: **CTC and salary amounts are added up**, **Employee Count is the average monthly headcount**, and the loan list adds each employee's loans over the range. Months in the range that have no sheet are listed in a warning and are not included. Salary sheets are monthly, so a range always covers whole months. |
| **Compare periods** | **Quarterly, Half-yearly or Yearly** comparison of a period against the previous one (or against the same period last year). Choose the **financial year (Apr-Mar)** or **calendar year**. Shows KPI changes, segment-wise, segment x department, Field Sales function-wise and Tally salary-component comparisons (previous vs current, change and % change) plus charts, and exports to Excel, Word and PDF. |

If the two periods have a different number of months (for example a quarter that is not finished yet) the dashboard warns you and the monthly averages are the like-for-like figures.

---

## How it works

```
Google Drive folder  ──(read-only service account)──┐
   2026/Salary Sheet - Oct'26.xls                   │
Supabase Storage (optional "Upload sheet" button) ──┤
                                                    ▼
                    Next.js API on Vercel: find file by month+year in its NAME
                    → parse (.xls/.xlsx) → validate → build 4 reports
                                                    ▼
          Dashboard (KPIs, charts, tables)  +  Excel / Word / PDF export
                                                    ▲
Supabase table `reclass_overrides` ── saved manual reclassifications, per month
```

* The month and year come from the **file name** (`Oct'26`, `Oct 26`, `October 2026`, `Oct_26` all work) and are cross-checked
  against the title row inside the sheet. A mismatch is flagged.
* Year/Month dropdowns are built from the files that exist, so new months appear automatically.
* A replaced file (same month, newer version) is detected too and the data reloads automatically.
* Everything is calculated from the actual columns of the selected sheet. No figures are hard-coded.

---

## One-time setup (about 30 minutes)

### 1. Supabase (saved reclassifications + upload fallback)
1. Create a free project at <https://supabase.com>.
2. SQL Editor → paste the contents of `supabase/schema.sql` → **Run**. (Creates the table and a private `salary-sheets` bucket.)
3. Project Settings → API: copy the **Project URL** (`SUPABASE_URL`) and the **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`).
   The service-role key is secret: it only goes into Vercel env vars, never into the browser or GitHub.

### 2. Google Drive access (service account)
1. <https://console.cloud.google.com> → create/select a project → **APIs & Services → Library → Google Drive API → Enable**.
2. **IAM & Admin → Service Accounts → Create**. Open it → **Keys → Add key → JSON**. A `.json` file downloads.
3. Copy the service account's email (`...@...iam.gserviceaccount.com`).
4. In Google Drive, **share your salary-sheet root folder with that email as Viewer**.
5. Put the key into `GOOGLE_SERVICE_ACCOUNT_JSON`: open the file, copy everything, and paste it as a single line
   (or base64-encode it). `DRIVE_ROOT_FOLDER_ID` is already set in `.env.example` for your folder.

Folder layout expected:
```
<root folder>/
   2026/   Salary Sheet - Oct'26.xls, Salary Sheet - Nov'26.xls ...
   2027/   ...
```
Sheets saved as native Google Sheets also work (they are converted on the fly).

### 3. Access (there is no login)
This version has **no sign-in screen**: anyone who has the dashboard link can open it, see the reports, download exports, upload sheets and change reclassifications.
Because the data is payroll, share the link only with the people who should see it. To lock it down without changing any code, use Vercel's own
protection (Project, Settings, **Deployment Protection**, for example Vercel Authentication or Password Protection, depending on your Vercel plan).

### 4. Put the code on GitHub
**Option A: upload in the browser (no Git needed).** On <https://github.com/new> create a **private** repository, click
**uploading an existing file**, drag the *contents* of this folder in (all files and sub-folders, including the hidden `.github`
folder if your browser shows it), then **Commit changes**. GitHub accepts at most 100 files per upload, so if it complains, upload
`app`, `components`, `lib`, `supabase`, `tests` first and the remaining files second.

**Option B: command line.**
```bash
cd salary-dashboard
git init
git add .
git commit -m "Salary dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USER/salary-dashboard.git
git push -u origin main
```
Use a **private** repository. `.gitignore` already blocks `.env*`, key files and `.xls/.xlsx` so payroll data and secrets are not committed.

### 5. Deploy on Vercel
1. <https://vercel.com> → **Add New → Project** → import the GitHub repo (framework: Next.js, no settings to change).
2. Before the first deploy, add every variable from `.env.example` under **Environment Variables**.
3. **Deploy.** Share the URL with your colleagues.

### Run locally (optional)
```bash
cp .env.example .env.local     # fill it in
npm install
npm run dev                    # http://localhost:3000
npm test                       # unit tests (synthetic data)
```

---

## Report rules (what is calculated)

| Report | Rule |
|---|---|
| **Field Sales** | Columns: Sales, Function, Count, CTC. Function comes from the sheet's `Funtion`/`Function` column; rows with `-` (or blank) are excluded. `Upselling - BD` appears as its own row. |
| **MIS Entry A** | Employee count by **Accounts Data**. The 12 listed departments are consolidated into **Others** (highlighted), followed by a breakdown table whose total equals Others. |
| **MIS Entry B** | Segment x Department (from the **Department** column): Total Earnings CTC and Employee Count. The same 12 departments as in section A are consolidated into one **Others** row that is mapped to the **Petpooja** segment (highlighted, last row of the segment), followed by a **department-wise breakdown of Others** (no segment split). Segment subtotals and a grand total are included. The target segment is `mis.othersSegment` in `lib/config.js`. |
| **Reclassification** | Segment x Department using the `CTC` column, in your reference layout (Sum of Earning CTC / No. of Employee) plus **manual reclassifications** saved per month. The previous month is shown side by side when its sheet exists. |
| **Tally Entry A** | Column totals from `BASIC` to `Net Amount` in the sheet's own order. `Bonus` is shown as **Statutory Bonus**; **Arrears** and **LWP Reimbu** are added into **Other Earning**. |
| **Tally Entry B** | Employees with Loan > 0: Emp Code, Name, Loan Deducted Amount, with total. |

Rules such as the Others list, renames, merges and the department-order hint live in **`lib/config.js`**.
The "Leave Encashment / Expenses / Provision" block is currently **left out**; set
`tally.includeLeaveEncashmentBlock: true` in `lib/config.js` to add it back.

### Manual reclassification
Reclassification tab → **Manual reclassification** → find an employee → choose the new department (and segment) → Save.
It is stored per month and re-applied each time you open that month. It affects only the Reclassification report.

---

## Validation (nothing fails silently)

* Required columns are checked; if any is missing the dashboard shows exactly which one and calculates nothing.
* The sheet's own **Total** row is excluded from counts and used to cross-check CTC, Loan and Net Amount.
* Duplicate Emp Codes are excluded (first kept) and listed. Rows with no Emp Code are excluded and listed.
* Blank / non-numeric cells are counted, treated as 0, and listed.
* Inconsistent spellings (e.g. `Sales Management & analytics`, `key Account Management`) are unified and listed.
* Reconciliation checks: same headcount and CTC in every report, earnings = Gross, Gross + employer = CTC,
  deductions = Deduction Total, Gross - Deductions = Net (also per employee), loan list = Loan total.
* Missing month, bad file names, unreadable files and month mismatches produce clear messages.
* The source file name, source (Drive / uploaded) and load time are shown on the dashboard.

## Exports
Every report has its own **Export this report** menu with **Excel (.xlsx), Word (.docx) and PDF (.pdf)**; the header has **Export all** (one file with all four reports).
File names look like `Salary-Report_Tally-Entry_Oct-2026.xlsx`. Exports contain only report data.

## Limits and notes
* Upload button: 4 MB limit (Vercel request limit). Larger files: put them in the Drive folder.
* Heavy months can take a few seconds (Drive download + parsing); functions are allowed up to 60 s.
* Word/PDF show the Reclassification previous-month panels one above the other; Excel keeps them side by side as in your reference.

## Troubleshooting
Changing a Vercel variable only takes effect after a **redeploy** (Deployments, the three dots, Redeploy).
For a quick self-check add `DEBUG_HEALTH=true` in Vercel, redeploy, open `https://YOUR-APP.vercel.app/api/health` (yes/no flags only, no secrets), and remove the variable afterwards.

| Message | Fix |
|---|---|
| "No salary-sheet source is configured" | Set the Drive and/or Supabase env vars on Vercel and redeploy. |
| "Google Drive could not be read" | Share the folder with the service-account email; check `DRIVE_ROOT_FOLDER_ID` and that the Drive API is enabled. |
| "No salary sheet was found for ..." | The file name must contain month and year (`Salary Sheet - Nov'26`) and sit in the folder; press Refresh. |
| "Required column ... was not found" | The sheet layout changed; the message names the column. Add a header alias in `lib/config.js` if it was only renamed. |
| Reclassification will not save | Run `supabase/schema.sql` and set the Supabase env vars. |
