import { Capacitor } from "@capacitor/core";

// Barcode capture. On native we use Google's ML Kit barcode scanner (the
// ready-made `scan()` UI) — proper autofocus, checksum-validated decode, runs in
// its own process so it needs no camera permission. The web build keeps the
// zxing-over-getUserMedia `BarcodeScanner.svelte` overlay.

export function barcodeScanIsNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open the native scanner. Resolves to the barcode digits, or `null` if the user
 * backed out. Throws only on a genuine failure.
 */
export async function scanBarcodeNative(): Promise<string | null> {
  const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
  const formats = [
    BarcodeFormat.Ean13,
    BarcodeFormat.Ean8,
    BarcodeFormat.UpcA,
    BarcodeFormat.UpcE,
  ];

  const avail = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable().catch(() => ({
    available: true,
  }));
  if (!avail.available) {
    // Kicks off a background download from Play Services; first scan may need a
    // moment, so surface a clear error rather than a silent hang.
    await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
    throw new Error("scanner-preparing");
  }

  try {
    const { barcodes } = await BarcodeScanner.scan({ formats, autoZoom: true });
    const raw = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue ?? "";
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 6 ? digits : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return null;
    throw e;
  }
}
