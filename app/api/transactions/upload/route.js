// Cliente de la base de datos
import prisma from "@/lib/prisma";

// Librería para lectura del archivoz csv de forma eficiente
import csv from "csv-parser";

// Utilidades de streaming de Node.js
import { Writable, Readable } from "stream";
import { finished } from "stream/promises";

// Utilidades para generar el hash de seguridad
import crypto from "crypto";

// Utilidades para la gestión del CORS
import { corsHeaders, corsResponse } from "@/lib/utils";

// Configuraciones de filtrado: ventas y devoluciones entre países de la UE
const ALLOWED_TYPES = ["SALE", "REFUND"];
const TARGET_SCHEME = "UNION-OSS";

// Genera un float con el que JS pueda operar matemáticamente sin romperse
const cleanAndParseFloat = (value) => {
  if (typeof value !== "string") value = String(value || "0");
  const cleanedValue = value.trim().replace(",", ".");
  const result = parseFloat(cleanedValue);
  return isNaN(result) ? 0 : result;
};

// Crea la fecha en formato ISO (YYYY-MM-DD) para que la pueda manejar JS
const getRobustDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr.includes("-")) {
    const parts = dateStr.split(" ")[0].split("-");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const d = new Date(`${year}-${month}-${day}`);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

// Genera una huella digital única por cada fila para no duplicar datos
const generateFingerprint = (record) => {
  const identityString = [
    record.TRANSACTION_EVENT_ID,
    record.ASIN,
    record.TRANSACTION_TYPE,
    record.TRANSACTION_COMPLETE_DATE,
    record.TOTAL_ACTIVITY_VALUE_VAT_AMT,
  ]
    .join("|")
    .toLowerCase();
  return crypto.createHash("sha256").update(identityString).digest("hex");
};

// Definimos el método OPTIONS para gestionar el CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 *  POST api/transactions/upload
 *
 *  Name:         Upload Transactions
 *  Description:  Extrae de un fichero CSV los datos de las transacciones que ha realizado una empresa
 *                almacenando el resultado en la base de datos (tabla Transacciones). Está programado
 *                para el formato del fichero VAT Report de Amazon y hace un filtrado de las transacciones
 *                sobre las ventas (SALES) y devoluciones (REFUND) válidas entre países de la UE
 *                (UNION-OSS)
 **/

export async function POST(request) {
  try {
    // 1. Extrae el archivo y el ID de usuario del FormData
    const formData = await request.formData();
    const file = formData.get("csvFile");
    const userId = formData.get("userId");
    if (!file || !userId)
      return corsResponse({ message: "Datos incompletos" }, 400);
    const transactions = [];

    // 2. Convierte el stream del navegador a un stream compatible con Node.js
    const nodeStream = Readable.fromWeb(file.stream());

    // 3. Define el recolector procesando fila por fila para no saturar la RAM
    const collector = new Writable({
      objectMode: true,
      write(record, encoding, callback) {
        const csvType = String(record.TRANSACTION_TYPE || "")
          .trim()
          .toUpperCase();
        const csvScheme = String(record.TAX_REPORTING_SCHEME || "")
          .trim()
          .toUpperCase();
        const rawDate = record.TRANSACTION_COMPLETE_DATE;
        const date = getRobustDate(rawDate);
        if (!date && rawDate) {
          console.error(`❌ FECHA FALLIDA: "${rawDate}" no se pudo parsear.`);
        }
        // Lógica de filtrado: UNION-OSS y ventas o devoluciones
        if (
          date &&
          ALLOWED_TYPES.includes(csvType) &&
          csvScheme === TARGET_SCHEME
        ) {
          transactions.push({
            // Utiliza el Fingerprint para evitar duplicados
            fingerprint: generateFingerprint(record),
            userId: userId,
            transactionType: csvType,
            transactionDate: date,
            itemDescription: record.ITEM_DESCRIPTION || "",
            itemQuantity: parseInt(record.QTY || record.QUANTITY || "0"),
            totalPriceOfItemsVatExcl:
              cleanAndParseFloat(
                record.TOTAL_PRICE_OF_ITEMS_AMT_VAT_EXCL ||
                  record.PRICE_OF_ITEMS_AMT_VAT_EXCL,
              ) || 0,
            totalShipChargeVatExcl:
              cleanAndParseFloat(
                record.TOTAL_SHIP_CHARGE_AMT_VAT_EXCL ||
                  record.SHIP_CHARGE_AMT_VAT_EXCL,
              ) || 0,
            totalGiftWrapVatExcl:
              cleanAndParseFloat(
                record.TOTAL_GIFT_WRAP_AMT_VAT_EXCL ||
                  record.GIFT_WRAP_AMT_VAT_EXCL,
              ) || 0,
            totalValueVatExcl:
              cleanAndParseFloat(record.TOTAL_ACTIVITY_VALUE_AMT_VAT_EXCL) || 0,
            totalPriceOfItemsVat:
              cleanAndParseFloat(
                record.TOTAL_PRICE_OF_ITEMS_VAT_AMT ||
                  record.PRICE_OF_ITEMS_VAT_AMT,
              ) || 0,
            totalShipChargeVat:
              cleanAndParseFloat(
                record.TOTAL_SHIP_CHARGE_VAT_AMT || record.SHIP_CHARGE_VAT_AMT,
              ) || 0,
            totalGiftWrapVat:
              cleanAndParseFloat(
                record.TOTAL_GIFT_WRAP_VAT_AMT || record.GIFT_WRAP_VAT_AMT,
              ) || 0,
            totalValueVat:
              cleanAndParseFloat(record.TOTAL_ACTIVITY_VALUE_VAT_AMT) || 0,
            totalPriceOfItemsVatIncl:
              cleanAndParseFloat(
                record.TOTAL_PRICE_OF_ITEMS_AMT_VAT_INCL ||
                  record.PRICE_OF_ITEMS_AMT_VAT_INCL,
              ) || 0,
            totalShipChargeVatIncl:
              cleanAndParseFloat(
                record.TOTAL_SHIP_CHARGE_AMT_VAT_INCL ||
                  record.SHIP_CHARGE_AMT_VAT_INCL,
              ) || 0,
            totalGiftWrapVatIncl:
              cleanAndParseFloat(
                record.TOTAL_GIFT_WRAP_AMT_VAT_INCL ||
                  record.GIFT_WRAP_AMT_VAT_INCL,
              ) || 0,
            totalValueVatIncl:
              cleanAndParseFloat(record.TOTAL_ACTIVITY_VALUE_AMT_VAT_INCL) || 0,
            transactionCurrencyCode: record.TRANSACTION_CURRENCY_CODE || "EUR",
            departureCountry:
              record.DEPARTURE_COUNTRY || record.SALE_DEPART_COUNTRY || "",
            arrivalCountry:
              record.ARRIVAL_COUNTRY || record.SALE_ARRIVAL_COUNTRY || "",
            taxableJurisdiction: record.TAXABLE_JURISDICTION || "",
          });
        } else {
          console.log(
            `Fila descartada: Fecha(${!!date}) Tipo(${csvType}) Esquema(${csvScheme})`,
          );
        }
        callback();
      },
    });

    // 4. Ejecuta el pipeline de procesamiento
    nodeStream
      .pipe(
        csv({
          separator: ",",
          mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, ""),
          strict: false,
        }),
      )
      .pipe(collector);
    await finished(collector);

    // 5. Valida si se extrajeron datos
    if (transactions.length === 0) {
      return corsResponse(
        {
          message: "No hay datos válidos (OSS + SALES/REFUNDS) para procesar.",
        },
        200,
      );
    }

    // 6. Inserción masiva en base de datos
    const result = await prisma.transaction.createMany({
      data: transactions,
      skipDuplicates: true,
    });

    //7. Respuesta con éxito
    return corsResponse({
      message: "Éxito",
      nuevosInsertados: result.count,
    });

    //8. Error en el procesado del fichero
  } catch (error) {
    console.error("Error en el procesamiento del CSV:", error);
    return corsResponse(
      { message: "Error procesando el archivo", error: error.message },
      500,
    );
  }
}
