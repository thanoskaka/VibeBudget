import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import {
  Category,
  DriveConnection,
  GoogleSheetsInspectionResult,
  GoogleSheetsSyncConfig,
  GoogleSheetsSyncDirection,
  Income,
  Transaction,
} from "../types";
import {
  clearSheetRowForItem,
  ensureSheetAndHeaders,
  getRequiredHeadersForConfig,
  inspectSpreadsheet,
  syncAppDataToSheet,
  syncSheetDataToApp,
} from "../utils/googleSheetsSync";
import {
  createBudgetDataFile,
  ensureBudgetFile,
  ensureVibeBudgetFolder,
  parseBudgetDataFile,
  readBudgetFileContent,
  updateBudgetFileContent,
} from "../utils/googleDrive";

const GOOGLE_ACCESS_TOKEN_KEY = "vibebudgetGoogleAccessToken";
const GOOGLE_REDIRECT_KEY = "vibebudgetGoogleRedirectInProgress";
const LOCAL_STATE_KEY = "vibebudgetLocalState";
const LOCAL_BUDGET_ID_KEY = "vibebudgetLocalBudgetId";
const DEFAULT_SYNC_INTERVAL_SECONDS = 30;
const DEFAULT_BUDGET_FILE_NAME = "budget.json";

const DEFAULT_CATEGORY_NAMES = [
  "Alcohol + Weed",
  "Canada Investments",
  "Car fuel",
  "Car maintenance",
  "Car Parking",
  "Clothing",
  "Donation",
  "Electronics",
  "Entertainment",
  "Gifts",
  "Going out food",
  "Groceries",
  "Household Items",
  "India Transfer - Parents",
  "India Transfer Investment",
  "Insurance",
  "Medical",
  "Misc.",
  "Nagar/Bamor Expenses",
  "Public transportation",
  "Rent",
  "Shopping",
  "Telecom",
  "Travel",
  "Utilities",
];

const getIsoNow = () => new Date().toISOString();

const createDefaultCategories = (): Category[] => (
  DEFAULT_CATEGORY_NAMES
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: crypto.randomUUID(),
      name,
      target_amount: 0,
    }))
);

const getLocalBudgetId = () => {
  const existing = localStorage.getItem(LOCAL_BUDGET_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(LOCAL_BUDGET_ID_KEY, next);
  return next;
};

interface LocalStatePayload {
  categories: Category[];
  transactions: Transaction[];
  income: Income[];
  googleSheetsConfig: GoogleSheetsSyncConfig | null;
  driveConnection: DriveConnection | null;
  lastSyncedAt: string | null;
}

const loadLocalState = (): LocalStatePayload => {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (!raw) {
    return {
      categories: createDefaultCategories(),
      transactions: [],
      income: [],
      googleSheetsConfig: null,
      driveConnection: null,
      lastSyncedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalStatePayload>;
    return {
      categories: Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : createDefaultCategories(),
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      income: Array.isArray(parsed.income) ? parsed.income : [],
      googleSheetsConfig: parsed.googleSheetsConfig || null,
      driveConnection: parsed.driveConnection || null,
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
    };
  } catch {
    return {
      categories: createDefaultCategories(),
      transactions: [],
      income: [],
      googleSheetsConfig: null,
      driveConnection: null,
      lastSyncedAt: null,
    };
  }
};

const persistLocalState = (payload: LocalStatePayload) => {
  localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(payload));
};

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  budgetId: string | null;
  ownerEmail: string | null;
  sharedUsers: string[];
  categories: Category[];
  transactions: Transaction[];
  income: Income[];
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  addTransaction: (data: any) => Promise<void>;
  updateTransaction: (id: string, data: any) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addIncome: (data: any) => Promise<void>;
  updateIncome: (id: string, data: any) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  updateCategoryTarget: (id: string, target: number) => Promise<void>;
  importData: (type: string, data: any[], isUpsert?: boolean, onProgress?: (current: number, total: number) => void) => Promise<void>;
  wipeData: (type: string) => Promise<void>;
  backupToDrive: () => Promise<void>;
  syncToCloud: () => Promise<void>;
  shareBudget: (email: string) => Promise<void>;
  googleSheetsConfig: GoogleSheetsSyncConfig | null;
  googleSheetsConnected: boolean;
  googleSheetsSyncing: boolean;
  googleSheetsError: string | null;
  connectGoogleSheets: () => Promise<void>;
  disconnectGoogleSheets: () => void;
  inspectGoogleSheetsSpreadsheet: (spreadsheetUrl: string, expensesSheetName: string, incomeSheetName: string) => Promise<GoogleSheetsInspectionResult>;
  saveGoogleSheetsConfig: (config: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">) => Promise<void>;
  syncGoogleSheets: (direction?: GoogleSheetsSyncDirection) => Promise<void>;
  backingUp: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  driveConnection: DriveConnection | null;
  driveConnected: boolean;
  driveSyncError: string | null;
  connectDriveFolder: (folderRef?: string) => Promise<void>;
  loadBudgetFromDrive: () => Promise<void>;
  disconnectDriveFolder: () => void;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialLocalState = useMemo(loadLocalState, []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [budgetId] = useState<string>(getLocalBudgetId);
  const [categories, setCategories] = useState<Category[]>(initialLocalState.categories);
  const [transactions, setTransactions] = useState<Transaction[]>(initialLocalState.transactions);
  const [income, setIncome] = useState<Income[]>(initialLocalState.income);
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState<GoogleSheetsSyncConfig | null>(initialLocalState.googleSheetsConfig);
  const [driveConnection, setDriveConnection] = useState<DriveConnection | null>(initialLocalState.driveConnection);
  const [lastSynced, setLastSynced] = useState<Date | null>(initialLocalState.lastSyncedAt ? new Date(initialLocalState.lastSyncedAt) : null);
  const [googleSheetsAccessToken, setGoogleSheetsAccessToken] = useState<string | null>(sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY));
  const [googleSheetsSyncing, setGoogleSheetsSyncing] = useState(false);
  const [googleSheetsError, setGoogleSheetsError] = useState<string | null>(null);
  const [driveSyncError, setDriveSyncError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const categoriesRef = useRef(categories);
  const transactionsRef = useRef(transactions);
  const incomeRef = useRef(income);
  const sheetsConfigRef = useRef(googleSheetsConfig);
  const driveConnectionRef = useRef(driveConnection);
  const autoSaveTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const loadingDriveRef = useRef(false);

  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { incomeRef.current = income; }, [income]);
  useEffect(() => { sheetsConfigRef.current = googleSheetsConfig; }, [googleSheetsConfig]);
  useEffect(() => { driveConnectionRef.current = driveConnection; }, [driveConnection]);

  const persistSnapshot = (
    nextCategories = categoriesRef.current,
    nextTransactions = transactionsRef.current,
    nextIncome = incomeRef.current,
    nextSheetsConfig = sheetsConfigRef.current,
    nextDriveConnection = driveConnectionRef.current,
    nextLastSynced = lastSynced
  ) => {
    persistLocalState({
      categories: nextCategories,
      transactions: nextTransactions,
      income: nextIncome,
      googleSheetsConfig: nextSheetsConfig,
      driveConnection: nextDriveConnection,
      lastSyncedAt: nextLastSynced ? nextLastSynced.toISOString() : null,
    });
  };

  const setBudgetState = ({
    nextCategories = categoriesRef.current,
    nextTransactions = transactionsRef.current,
    nextIncome = incomeRef.current,
    nextSheetsConfig = sheetsConfigRef.current,
    nextDriveConnection = driveConnectionRef.current,
    nextLastSynced = lastSynced,
  }: {
    nextCategories?: Category[];
    nextTransactions?: Transaction[];
    nextIncome?: Income[];
    nextSheetsConfig?: GoogleSheetsSyncConfig | null;
    nextDriveConnection?: DriveConnection | null;
    nextLastSynced?: Date | null;
  }) => {
    categoriesRef.current = nextCategories;
    transactionsRef.current = nextTransactions;
    incomeRef.current = nextIncome;
    sheetsConfigRef.current = nextSheetsConfig;
    driveConnectionRef.current = nextDriveConnection;

    setCategories(nextCategories);
    setTransactions(nextTransactions);
    setIncome(nextIncome);
    setGoogleSheetsConfig(nextSheetsConfig);
    setDriveConnection(nextDriveConnection);
    setLastSynced(nextLastSynced);

    persistSnapshot(
      nextCategories,
      nextTransactions,
      nextIncome,
      nextSheetsConfig,
      nextDriveConnection,
      nextLastSynced
    );
  };

  const storeAccessToken = (token: string | null) => {
    setGoogleSheetsAccessToken(token);
    if (token) {
      sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }
  };

  const beginGoogleAuth = async () => {
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, "true");
    await signInWithRedirect(auth, googleProvider);
  };

  useEffect(() => {
    const consumeRedirect = async () => {
      if (sessionStorage.getItem(GOOGLE_REDIRECT_KEY) !== "true") return;

      try {
        const result = await getRedirectResult(auth);
        const credential = result ? GoogleAuthProvider.credentialFromResult(result) : null;
        if (credential?.accessToken) {
          storeAccessToken(credential.accessToken);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google authentication failed.";
        setGoogleSheetsError(message);
        setDriveSyncError(message);
      } finally {
        sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
      }
    };

    void consumeRedirect();

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const ensureSignedInWithDriveScopes = async () => {
    if (!user || !googleSheetsAccessToken) {
      await beginGoogleAuth();
      throw new Error("Redirecting to Google to authorize Drive access.");
    }
  };

  const saveBudgetToDrive = async () => {
    const token = googleSheetsAccessToken;
    const currentConnection = driveConnectionRef.current;
    if (!token || !currentConnection) {
      throw new Error("Connect your VibeBudget Drive folder first.");
    }

    const payload = createBudgetDataFile(
      categoriesRef.current,
      transactionsRef.current,
      incomeRef.current,
      sheetsConfigRef.current
    );
    const content = JSON.stringify(payload, null, 2);

    const ensuredFile = await ensureBudgetFile(token, currentConnection, content);
    const nextConnection: DriveConnection = {
      ...currentConnection,
      budgetFileId: ensuredFile.fileId,
      budgetFileName: ensuredFile.fileName,
    };

    await updateBudgetFileContent(token, ensuredFile.fileId, content);
    const syncedAt = new Date();
    setBudgetState({ nextDriveConnection: nextConnection, nextLastSynced: syncedAt });
    setDriveSyncError(null);
  };

  const loadBudgetFromDrive = async () => {
    const token = googleSheetsAccessToken;
    const currentConnection = driveConnectionRef.current;
    if (!token || !currentConnection?.budgetFileId) {
      throw new Error("No Drive budget file connected yet.");
    }

    setIsSyncing(true);
    loadingDriveRef.current = true;
    try {
      const raw = await readBudgetFileContent(token, currentConnection.budgetFileId);
      const parsed = parseBudgetDataFile(raw);
      setBudgetState({
        nextCategories: parsed.categories.length > 0 ? parsed.categories : createDefaultCategories(),
        nextTransactions: parsed.transactions,
        nextIncome: parsed.income,
        nextSheetsConfig: parsed.googleSheetsConfig,
        nextLastSynced: new Date(),
      });
      setDriveSyncError(null);
    } finally {
      loadingDriveRef.current = false;
      setIsSyncing(false);
    }
  };

  const connectDriveFolder = async (folderRef?: string) => {
    await ensureSignedInWithDriveScopes();
    const token = sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    if (!token) return;

    setIsSyncing(true);
    try {
      const folder = await ensureVibeBudgetFolder(token, folderRef);
      const payload = createBudgetDataFile(
        categoriesRef.current,
        transactionsRef.current,
        incomeRef.current,
        sheetsConfigRef.current
      );
      const budgetFile = await ensureBudgetFile(token, { folderId: folder.folderId, budgetFileName: DEFAULT_BUDGET_FILE_NAME }, JSON.stringify(payload, null, 2));

      const nextConnection: DriveConnection = {
        folderId: folder.folderId,
        folderName: folder.folderName,
        folderUrl: folder.folderUrl,
        budgetFileId: budgetFile.fileId,
        budgetFileName: budgetFile.fileName,
        connectedAt: getIsoNow(),
      };

      setBudgetState({ nextDriveConnection: nextConnection });
      setDriveSyncError(null);

      try {
        await loadBudgetFromDrive();
      } catch {
        await saveBudgetToDrive();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const disconnectDriveFolder = () => {
    setBudgetState({ nextDriveConnection: null });
    setDriveSyncError(null);
  };

  useEffect(() => {
    if (!googleSheetsAccessToken || !driveConnection || loadingDriveRef.current) {
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      setBackingUp(true);
      void saveBudgetToDrive()
        .catch((error) => {
          setDriveSyncError(error instanceof Error ? error.message : "Failed to save budget.json to Drive.");
        })
        .finally(() => {
          setBackingUp(false);
        });
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [categories, transactions, income, googleSheetsConfig, driveConnection, googleSheetsAccessToken]);

  const inspectGoogleSheetsSpreadsheet = async (
    spreadsheetUrl: string,
    expensesSheetName: string,
    incomeSheetName: string
  ) => {
    if (!googleSheetsAccessToken) {
      throw new Error("Sign in with Google first.");
    }

    return inspectSpreadsheet(googleSheetsAccessToken, spreadsheetUrl, expensesSheetName, incomeSheetName);
  };

  const connectGoogleSheets = async () => {
    await ensureSignedInWithDriveScopes();
  };

  const disconnectGoogleSheets = () => {
    setGoogleSheetsError(null);
    setGoogleSheetsConfig(null);
    setBudgetState({ nextSheetsConfig: null });
  };

  const saveGoogleSheetsConfig = async (config: Omit<GoogleSheetsSyncConfig, "connectedAt" | "connectedBy">) => {
    if (!user || !googleSheetsAccessToken) {
      throw new Error("Sign in with Google first.");
    }

    const payload: GoogleSheetsSyncConfig = {
      ...config,
      connectedAt: sheetsConfigRef.current?.connectedAt || getIsoNow(),
      connectedBy: user.email || user.uid,
      lastError: null,
      lastSyncedAt: sheetsConfigRef.current?.lastSyncedAt || null,
      lastPullAt: sheetsConfigRef.current?.lastPullAt || null,
      lastPushAt: sheetsConfigRef.current?.lastPushAt || null,
    };

    await ensureSheetAndHeaders(
      googleSheetsAccessToken,
      payload.spreadsheetId,
      payload.expensesSheetName,
      getRequiredHeadersForConfig(payload, "expenses")
    );
    await ensureSheetAndHeaders(
      googleSheetsAccessToken,
      payload.spreadsheetId,
      payload.incomeSheetName,
      getRequiredHeadersForConfig(payload, "income")
    );

    setBudgetState({ nextSheetsConfig: payload });
    setGoogleSheetsError(null);
  };

  const ensureCategoryId = async (name: string) => {
    const existing = categoriesRef.current.find((category) => category.name === name);
    if (existing) return existing.id;

    const nextCategory: Category = {
      id: crypto.randomUUID(),
      name,
      target_amount: 0,
    };
    const nextCategories = [...categoriesRef.current, nextCategory].sort((a, b) => a.name.localeCompare(b.name));
    setBudgetState({ nextCategories });
    return nextCategory.id;
  };

  const upsertTransactionFromSync = async (id: string | null, data: Omit<Transaction, "id">) => {
    const nextTransactions = [...transactionsRef.current];
    const finalId = id || crypto.randomUUID();
    const existingIndex = nextTransactions.findIndex((item) => item.id === finalId);
    const payload: Transaction = { id: finalId, ...data };

    if (existingIndex >= 0) {
      nextTransactions[existingIndex] = payload;
    } else {
      nextTransactions.push(payload);
    }

    setBudgetState({ nextTransactions });
  };

  const upsertIncomeFromSync = async (id: string | null, data: Omit<Income, "id">) => {
    const nextIncome = [...incomeRef.current];
    const finalId = id || crypto.randomUUID();
    const existingIndex = nextIncome.findIndex((item) => item.id === finalId);
    const payload: Income = { id: finalId, ...data };

    if (existingIndex >= 0) {
      nextIncome[existingIndex] = payload;
    } else {
      nextIncome.push(payload);
    }

    setBudgetState({ nextIncome });
  };

  const syncGoogleSheets = async (direction: GoogleSheetsSyncDirection = "both") => {
    if (!googleSheetsAccessToken || !sheetsConfigRef.current) {
      throw new Error("Configure Google Sheets first.");
    }
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    setGoogleSheetsSyncing(true);
    setGoogleSheetsError(null);

    try {
      if (direction === "pull" || direction === "both") {
        await syncSheetDataToApp({
          token: googleSheetsAccessToken,
          config: sheetsConfigRef.current,
          transactions: transactionsRef.current,
          income: incomeRef.current,
          ensureCategoryId,
          upsertTransaction: upsertTransactionFromSync,
          upsertIncome: upsertIncomeFromSync,
        });
      }

      const configAfterPull = sheetsConfigRef.current;
      if (!configAfterPull) {
        throw new Error("Google Sheets config missing after pull.");
      }

      if (direction === "push" || direction === "both") {
        await syncAppDataToSheet(
          googleSheetsAccessToken,
          configAfterPull,
          transactionsRef.current,
          incomeRef.current
        );
      }

      const timestamp = getIsoNow();
      const nextConfig: GoogleSheetsSyncConfig = {
        ...configAfterPull,
        lastSyncedAt: timestamp,
        lastPullAt: direction === "push" ? configAfterPull.lastPullAt || null : timestamp,
        lastPushAt: direction === "pull" ? configAfterPull.lastPushAt || null : timestamp,
        lastError: null,
      };

      setBudgetState({ nextSheetsConfig: nextConfig, nextLastSynced: new Date() });
      setGoogleSheetsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
      setGoogleSheetsError(message);
      const currentConfig = sheetsConfigRef.current;
      if (currentConfig) {
        setBudgetState({
          nextSheetsConfig: {
            ...currentConfig,
            lastError: message,
          },
        });
      }
      throw error;
    } finally {
      syncInFlightRef.current = false;
      setGoogleSheetsSyncing(false);
    }
  };

  useEffect(() => {
    if (!googleSheetsAccessToken || !googleSheetsConfig?.autoSync) return;

    const interval = Math.max(15, googleSheetsConfig.syncIntervalSeconds || DEFAULT_SYNC_INTERVAL_SECONDS) * 1000;
    const timer = window.setInterval(() => {
      void syncGoogleSheets("both").catch(() => undefined);
    }, interval);

    return () => window.clearInterval(timer);
  }, [googleSheetsAccessToken, googleSheetsConfig]);

  const signIn = async () => {
    await beginGoogleAuth();
  };

  const logout = async () => {
    storeAccessToken(null);
    await signOut(auth);
  };

  const addTransaction = async (data: Omit<Transaction, "id">) => {
    const nextTransactions = [
      ...transactionsRef.current,
      {
        id: crypto.randomUUID(),
        ...data,
        updated_at: getIsoNow(),
      },
    ];
    setBudgetState({ nextTransactions });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const updateTransaction = async (id: string, data: Partial<Transaction>) => {
    const nextTransactions = transactionsRef.current.map((item) => (
      item.id === id ? { ...item, ...data, updated_at: getIsoNow() } : item
    ));
    setBudgetState({ nextTransactions });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const deleteTransaction = async (id: string) => {
    const nextTransactions = transactionsRef.current.filter((item) => item.id !== id);
    setBudgetState({ nextTransactions });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      await clearSheetRowForItem(googleSheetsAccessToken, sheetsConfigRef.current, "expenses", id).catch(() => undefined);
    }
  };

  const addIncome = async (data: Omit<Income, "id">) => {
    const nextIncome = [
      ...incomeRef.current,
      {
        id: crypto.randomUUID(),
        ...data,
        updated_at: getIsoNow(),
      },
    ];
    setBudgetState({ nextIncome });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const updateIncome = async (id: string, data: Partial<Income>) => {
    const nextIncome = incomeRef.current.map((item) => (
      item.id === id ? { ...item, ...data, updated_at: getIsoNow() } : item
    ));
    setBudgetState({ nextIncome });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      void syncGoogleSheets("push").catch(() => undefined);
    }
  };

  const deleteIncome = async (id: string) => {
    const nextIncome = incomeRef.current.filter((item) => item.id !== id);
    setBudgetState({ nextIncome });
    if (googleSheetsAccessToken && sheetsConfigRef.current) {
      await clearSheetRowForItem(googleSheetsAccessToken, sheetsConfigRef.current, "income", id).catch(() => undefined);
    }
  };

  const updateCategoryTarget = async (id: string, target: number) => {
    const nextCategories = categoriesRef.current.map((item) => (
      item.id === id ? { ...item, target_amount: target } : item
    ));
    setBudgetState({ nextCategories });
  };

  const importData = async (type: string, rows: any[], isUpsert = false, onProgress?: (current: number, total: number) => void) => {
    let nextCategories = [...categoriesRef.current];
    let nextTransactions = [...transactionsRef.current];
    let nextIncome = [...incomeRef.current];

    const getOrCreateCategoryId = (name: string) => {
      const existing = nextCategories.find((item) => item.name === name);
      if (existing) return existing.id;
      const created: Category = { id: crypto.randomUUID(), name, target_amount: 0 };
      nextCategories = [...nextCategories, created].sort((a, b) => a.name.localeCompare(b.name));
      return created.id;
    };

    rows.forEach((row, index) => {
      if (type === "targets") {
        const [name, target] = row;
        const id = getOrCreateCategoryId(name);
        nextCategories = nextCategories.map((item) => item.id === id ? { ...item, target_amount: target } : item);
      }

      if (type === "expenses") {
        const [date, vendor, amount, categoryName, notes] = row;
        const categoryId = getOrCreateCategoryId(categoryName);
        const existingIndex = isUpsert ? nextTransactions.findIndex((item) => item.date === date && item.vendor === vendor) : -1;
        const payload: Transaction = {
          id: existingIndex >= 0 ? nextTransactions[existingIndex].id : crypto.randomUUID(),
          date,
          vendor,
          amount,
          category_id: categoryId,
          category_name: categoryName,
          notes,
          updated_at: getIsoNow(),
        };
        if (existingIndex >= 0) {
          nextTransactions[existingIndex] = payload;
        } else {
          nextTransactions.push(payload);
        }
      }

      if (type === "income") {
        const [date, source, amount, category, notes] = row;
        const existingIndex = isUpsert ? nextIncome.findIndex((item) => item.date === date && item.source === source) : -1;
        const payload: Income = {
          id: existingIndex >= 0 ? nextIncome[existingIndex].id : crypto.randomUUID(),
          date,
          source,
          amount,
          category,
          notes,
          updated_at: getIsoNow(),
        };
        if (existingIndex >= 0) {
          nextIncome[existingIndex] = payload;
        } else {
          nextIncome.push(payload);
        }
      }

      onProgress?.(index + 1, rows.length);
    });

    setBudgetState({ nextCategories, nextTransactions, nextIncome });
  };

  const wipeData = async (type: string) => {
    if (type === "expenses") {
      setBudgetState({ nextTransactions: [] });
      return;
    }
    if (type === "income") {
      setBudgetState({ nextIncome: [] });
      return;
    }
    if (type === "categories") {
      setBudgetState({ nextCategories: createDefaultCategories() });
    }
  };

  const shareBudget = async () => {
    throw new Error("Shared budgets are not available in private Drive mode yet.");
  };

  const backupToDrive = async () => {
    await ensureSignedInWithDriveScopes();
    setBackingUp(true);
    try {
      if (!driveConnectionRef.current) {
        await connectDriveFolder();
      } else {
        await saveBudgetToDrive();
      }
    } finally {
      setBackingUp(false);
    }
  };

  const syncToCloud = async () => {
    await loadBudgetFromDrive();
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        budgetId,
        ownerEmail: user?.email || null,
        sharedUsers: [],
        categories,
        transactions,
        income,
        signIn,
        logout,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addIncome,
        updateIncome,
        deleteIncome,
        updateCategoryTarget,
        importData,
        wipeData,
        backupToDrive,
        syncToCloud,
        shareBudget,
        googleSheetsConfig,
        googleSheetsConnected: Boolean(googleSheetsAccessToken && user),
        googleSheetsSyncing,
        googleSheetsError,
        connectGoogleSheets,
        disconnectGoogleSheets,
        inspectGoogleSheetsSpreadsheet,
        saveGoogleSheetsConfig,
        syncGoogleSheets,
        backingUp,
        isSyncing,
        lastSynced,
        driveConnection,
        driveConnected: Boolean(driveConnection),
        driveSyncError,
        connectDriveFolder,
        loadBudgetFromDrive,
        disconnectDriveFolder,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
};
