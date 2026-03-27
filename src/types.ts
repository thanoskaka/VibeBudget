export interface Category {
  id: string;
  name: string;
  target_amount: number;
}

export interface Transaction {
  id: string;
  date: string;
  vendor: string;
  amount: number;
  category_id: string;
  category_name: string;
  notes: string;
  updated_at?: string;
}

export interface Income {
  id: string;
  date: string;
  source: string;
  amount: number;
  category: string;
  notes?: string;
  updated_at?: string;
}

export type View = "dashboard" | "transactions" | "analysis" | "settings";

export type DateRangeOption = "this-month" | "last-month" | "last-3-months" | "last-6-months" | "ytd" | "last-12-months" | "custom";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  option: DateRangeOption;
}

export type GoogleSheetsSyncDirection = "pull" | "push" | "both";

export interface ExpenseSheetMapping {
  date: string;
  vendor: string;
  amount: string;
  category: string;
  notes: string;
  id: string;
  updatedAt: string;
}

export interface IncomeSheetMapping {
  date: string;
  source: string;
  amount: string;
  category: string;
  notes: string;
  id: string;
  updatedAt: string;
}

export interface GoogleSheetsSyncConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  expensesSheetName: string;
  incomeSheetName: string;
  expenseMapping: ExpenseSheetMapping;
  incomeMapping: IncomeSheetMapping;
  autoSync: boolean;
  syncIntervalSeconds: number;
  connectedAt: string;
  connectedBy: string;
  lastSyncedAt?: string | null;
  lastPushAt?: string | null;
  lastPullAt?: string | null;
  lastError?: string | null;
}

export interface GoogleSheetsInspectionResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  expenseHeaders: string[];
  incomeHeaders: string[];
  suggestedExpenseMapping: ExpenseSheetMapping;
  suggestedIncomeMapping: IncomeSheetMapping;
}

export interface DriveConnection {
  folderId: string;
  folderName: string;
  folderUrl?: string | null;
  budgetFileId?: string | null;
  budgetFileName: string;
  connectedAt: string;
}
