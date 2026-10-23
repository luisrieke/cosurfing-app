import { Platform, Share } from 'react-native';

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

/** Downloads on web; opens the share sheet with the CSV text on native. */
export async function exportCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: filename, message: csv });
}
