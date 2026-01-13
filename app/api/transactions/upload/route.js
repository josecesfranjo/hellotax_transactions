import prisma from "@/lib/prisma"; // Cliente de base de datos
import csv from "csv-parser"; // Librería para parsear el CSV de forma eficiente
import { Writable, Readable } from "stream"; // Utilidades de streaming de Node.js
import { finished } from "stream/promises"; // Para saber cuándo termina el stream
import crypto from "crypto"; // Para generar el hash de seguridad
import { corsResponse, cleanAndParseFloat, getRobustDate } from "@/lib/utils";

// Configuraciones de filtrado: solo ventas/devoluciones y régimen OSS (ventas intracomunitarias)
const ALLOWED_TYPES = ["SALE", "REFUND"];
const TARGET_SCHEME = "UNION-OSS";

/**
 * Genera una huella digital (Fingerprint) única por cada fila.
 * Esto evita que si subes el mismo archivo dos veces, se dupliquen los datos.
 */
const generateFingerprint = (record) => {
  const identityString = [
    record.TRANSACTION_EVENT_ID,
    record.TRANSACTION_TYPE,
    record.ASIN,
    record.TRANSACTION_COMPLETE_DATE,
    record.QTY || record.QUANTITY,
    record.TOTAL_ACTIVITY_VALUE_VAT_AMT,
  ]
    .join("|")
    .toLowerCase();
  return crypto.createHash("sha256").update(identityString).digest("hex");
};

export async function OPTIONS() {
  return corsResponse({}, 200);
}

export async function POST(request) {
  try {
    // 1. Extraer el archivo y el ID de usuario del FormData
    const formData = await request.formData();
    const file = formData.get("csvFile");
    const userId = formData.get("userId");

    if (!file || !userId)
      return corsResponse({ message: "Datos incompletos" }, 400);

    const transactions = [];
    // Convertimos el stream del navegador a un stream compatible con Node.js
    const nodeStream = Readable.fromWeb(file.stream());

    // 2. Definir el recolector (Writable Stream)
    // Procesamos fila por fila para no saturar la memoria RAM del servidor
    const collector = new Writable({
      objectMode: true,
      write(record, encoding, callback) {
        // Limpieza de datos básicos
        const csvType = String(record.TRANSACTION_TYPE || "")
          .trim()
          .toUpperCase();
        const csvScheme = String(record.TAX_REPORTING_SCHEME || "")
          .trim()
          .toUpperCase();
        // --- LOG 1: Ver qué fecha entra del CSV ---
        const rawDate = record.TRANSACTION_COMPLETE_DATE;
        const date = getRobustDate(rawDate);

        // --- LOG 2: Si la fecha falla, ver por qué ---
        if (!date && rawDate) {
          console.error(`❌ FECHA FALLIDA: "${rawDate}" no se pudo parsear.`);
        }

        // 3. Filtro de negocio: Solo guardamos lo que sea OSS y ventas/devoluciones válidas
        if (
          date &&
          ALLOWED_TYPES.includes(csvType) &&
          csvScheme === TARGET_SCHEME
        ) {
          transactions.push({
            fingerprint: generateFingerprint(record), // Clave para evitar duplicados
            userId: userId,
            transactionType: csvType,
            transactionDate: date,
            itemDescription: record.ITEM_DESCRIPTION || "",
            itemQuantity: parseInt(record.QTY || record.QUANTITY || "0"),

            // --- BLOQUE EXCL. IVA ---
            totalPriceOfItemsVatExcl:
              cleanAndParseFloat(
                record.TOTAL_PRICE_OF_ITEMS_AMT_VAT_EXCL ||
                  record.PRICE_OF_ITEMS_AMT_VAT_EXCL
              ) || 0,
            totalShipChargeVatExcl:
              cleanAndParseFloat(
                record.TOTAL_SHIP_CHARGE_AMT_VAT_EXCL ||
                  record.SHIP_CHARGE_AMT_VAT_EXCL
              ) || 0,
            totalGiftWrapVatExcl:
              cleanAndParseFloat(
                record.TOTAL_GIFT_WRAP_AMT_VAT_EXCL ||
                  record.GIFT_WRAP_AMT_VAT_EXCL
              ) || 0,
            totalValueVatExcl:
              cleanAndParseFloat(record.TOTAL_ACTIVITY_VALUE_AMT_VAT_EXCL) || 0,

            // --- BLOQUE CUOTA DE IVA ---
            totalPriceOfItemsVat:
              cleanAndParseFloat(
                record.TOTAL_PRICE_OF_ITEMS_VAT_AMT ||
                  record.PRICE_OF_ITEMS_VAT_AMT
              ) || 0,
            totalShipChargeVat:
              cleanAndParseFloat(
                record.TOTAL_SHIP_CHARGE_VAT_AMT || record.SHIP_CHARGE_VAT_AMT
              ) || 0,
            totalGiftWrapVat:
              cleanAndParseFloat(
                record.TOTAL_GIFT_WRAP_VAT_AMT || record.GIFT_WRAP_VAT_AMT
              ) || 0,
            totalValueVat:
              cleanAndParseFloat(record.TOTAL_ACTIVITY_VALUE_VAT_AMT) || 0,

            // --- BLOQUE INCL. IVA (TOTAL) ---
            totalPriceOfItemsVatIncl:
              cleanAndParseFloat(
                record.TOTAL_PRICE_OF_ITEMS_AMT_VAT_INCL ||
                  record.PRICE_OF_ITEMS_AMT_VAT_INCL
              ) || 0,
            totalShipChargeVatIncl:
              cleanAndParseFloat(
                record.TOTAL_SHIP_CHARGE_AMT_VAT_INCL ||
                  record.SHIP_CHARGE_AMT_VAT_INCL
              ) || 0,
            totalGiftWrapVatIncl:
              cleanAndParseFloat(
                record.TOTAL_GIFT_WRAP_AMT_VAT_INCL ||
                  record.GIFT_WRAP_AMT_VAT_INCL
              ) || 0,
            totalValueVatIncl:
              cleanAndParseFloat(record.TOTAL_ACTIVITY_VALUE_AMT_VAT_INCL) || 0,

            // --- INFORMACIÓN GEOGRÁFICA ---
            transactionCurrencyCode: record.TRANSACTION_CURRENCY_CODE || "EUR",
            departureCountry:
              record.DEPARTURE_COUNTRY || record.SALE_DEPART_COUNTRY || "",
            arrivalCountry:
              record.ARRIVAL_COUNTRY || record.SALE_ARRIVAL_COUNTRY || "",
            taxableJurisdiction: record.TAXABLE_JURISDICTION || "",
          });
        } else {
          console.log(
            `Fila descartada: Fecha(${!!date}) Tipo(${csvType}) Esquema(${csvScheme})`
          );
        }
        callback();
      },
    });

    // 4. Ejecutar el pipeline de procesamiento
    // Usamos mapHeaders para limpiar cualquier carácter invisible (BOM) de Amazon
    nodeStream
      .pipe(
        csv({
          separator: ",", // Tu archivo usa comas
          mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, ""), // <-- ESTO LIMPIA EL UNDEFINED
          strict: false,
        })
      )
      .pipe(collector);

    await finished(collector);

    // 5. Validar si se extrajeron datos
    if (transactions.length === 0) {
      return corsResponse(
        {
          message: "No hay datos válidos (OSS + SALES/REFUNDS) para procesar.",
        },
        200
      );
    }

    // 6. Inserción masiva en base de datos
    // 'skipDuplicates: true' usa la columna 'fingerprint' (si es UNIQUE) para no fallar
    const result = await prisma.transaction.createMany({
      data: transactions,
      skipDuplicates: true,
    });

    return corsResponse({
      message: "Éxito",
      nuevosInsertados: result.count,
    });
  } catch (error) {
    console.error("Error en el procesamiento del CSV:", error);
    return corsResponse(
      { message: "Error procesando el archivo", error: error.message },
      500
    );
  }
}
