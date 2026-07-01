import { google } from "googleapis";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID!;

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    // Newlines in private key are stored as \n literals in env vars
    key: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function client() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/** Read all rows from a sheet range. Row 0 of the result is the header. */
export async function readRange(range: string): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return (res.data.values ?? []) as string[][];
}

/** Append a single row to a sheet. */
export async function appendRow(
  sheetName: string,
  values: (string | number | boolean | null)[]
): Promise<void> {
  await client().spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [values.map((v) => (v === null ? "" : String(v)))],
    },
  });
}

/**
 * Update a single cell. `col` is the column letter (A, B, …).
 * `row` is the 1-indexed sheet row number.
 */
export async function updateCell(
  sheetName: string,
  row: number,
  col: string,
  value: string
): Promise<void> {
  await client().spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${col}${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}
