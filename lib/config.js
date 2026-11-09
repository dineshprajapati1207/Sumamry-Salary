// ---------------------------------------------------------------------------
// Central configuration for report logic.
// Everything that is a *mapping rule* (not data) lives here, so you can change a
// rule in one place without touching the processing code.
// Matching is case-insensitive and ignores extra spaces.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // The header row (the one containing "Emp Code") is searched within this many top rows.
  headerScanRows: 15,

  // Required columns and the header names accepted for each.
  // (The source sheet spells "Function" as "Funtion" and "Account Data" as "Accounts Data".)
  columns: {
    empCode: { label: 'Emp Code', aliases: ['Emp Code'] },
    name: { label: 'Name', aliases: ['Name'] },
    segment: { label: 'Segment', aliases: ['Segment'] },
    department: { label: 'Department', aliases: ['Department'] },
    function: { label: 'Function', aliases: ['Function', 'Funtion'] },
    accountsData: { label: 'Accounts Data', aliases: ['Accounts Data', 'Account Data'] },
    ctc: { label: 'CTC', aliases: ['CTC'] },
    loan: { label: 'Loan', aliases: ['Loan'] },
  },

  // Salary components run from `start` to `end` (inclusive) in the sheet's own column order.
  tally: {
    start: 'BASIC',
    end: 'Net Amount',
    // Columns that must exist inside the range (used for subtotals and reconciliation).
    required: {
      otherEarning: 'Other Earning',
      grossTotal: 'Gross Total',
      ctc: 'CTC',
      deductionTotal: 'Deduction Total',
    },
    rename: { Bonus: 'Statutory Bonus' },
    // These columns are added into "Other Earning" and are not listed separately.
    mergeIntoOtherEarning: [['Arrears'], ['LWP Reimbu', 'LWP Reimbursement']],
    subtotalRows: ['Gross Total', 'CTC', 'Deduction Total'],
    totalRows: ['Net Amount'],
    // The blank "Leave Encashment / Expenses / Provision" block from the reference file.
    includeLeaveEncashmentBlock: false,
  },

  fieldSales: {
    salesLabel: 'Sales',
    excludeFunctionValues: ['-'], // blank values are also excluded (and reported)
  },

  mis: {
    othersLabel: 'Others',
    // In the segment-wise department report every "Others" department is mapped to this segment.
    othersSegment: 'Petpooja',
    // Accounts Data departments consolidated into "Others".
    othersDepartments: [
      'Business Development',
      'Data Science',
      'Embedded Finance',
      'International Sales',
      'Learning & Development',
      'Enterprise Sales',
      'Renewal & Retention',
      'Sales Management & Analytics',
      "Founder's Office",
      'Operations',
      'Digital Solutions',
      'Partner Success',
    ],
    // Display order for the department list (matches your reference). New departments that are
    // not listed here are appended alphabetically, so nothing is ever dropped.
    departmentOrder: [
      'Account', 'Administration', 'Data Entry', 'Director', 'Human Resources', 'Integration',
      'Inventory', 'Attendo', 'Key Accounts Management', 'Invoice', 'Marketing', 'Others',
      'Product Development', 'R & D', 'Sales', 'Marketing Automation', 'Purchase', 'Support',
      'Training & Development', 'Tasks',
    ],
  },

  // Spelling variants that are NOT just a case difference (case differences are merged automatically).
  // key = variant (any case), value = the spelling to report under.
  departmentAliases: {
    'key account management': 'Key Accounts Management',
  },

  // Financial year used by the Quarterly / Half-yearly / Yearly comparisons (4 = April to March).
  // The dashboard also offers a Calendar-year option (January to December).
  fiscalYearStartMonth: 4,

  // Tolerance (in rupees) for reconciliation checks.
  tolerance: 1,
};
