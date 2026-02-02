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
  const s = String(dateStr).trim();

  // Caso Marzo: "19-03-2025" (DD-MM-YYYY)
  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length === 3) {
      // Si el primer bloque es el día (2 dígitos o menos) y el último el año (4 dígitos)
      if (parts[0].length <= 2 && parts[2].length === 4) {
        return new Date(
          parseInt(parts[2]),
          parseInt(parts[1]) - 1,
          parseInt(parts[0]),
        );
      }
      // Si ya viene como YYYY-MM-DD
      return new Date(s);
    }
  }

  // Caso Julio: "19/03/2025" (DD/MM/YYYY)
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      return new Date(
        parseInt(parts[2]),
        parseInt(parts[1]) - 1,
        parseInt(parts[0]),
      );
    }
  }

  const d = new Date(s);
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
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
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
    const userFrequency = formData.get("taxFrequency") || "MONTHLY";

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

        // Usamos la fecha de completado o la de cálculo como backup
        const rawDate =
          record.TRANSACTION_COMPLETE_DATE || record.TAX_CALCULATION_DATE;
        const date = getRobustDate(rawDate);

        if (!date && rawDate) {
          console.error(`❌ FECHA FALLIDA: "${rawDate}" no se pudo parsear.`);
        }

        // Lógica de filtrado
        const isAllowedType = ALLOWED_TYPES.includes(csvType);
        const isTargetScheme = csvScheme === TARGET_SCHEME;

        if (date && isAllowedType && isTargetScheme) {
          transactions.push({
            fingerprint: generateFingerprint(record),
            userId: userId,
            transactionType: csvType,
            transactionDate: date,
            itemDescription: record.ITEM_DESCRIPTION || "",
            itemQuantity: parseInt(record.QTY || "0"),
            transactionCurrencyCode: record.TRANSACTION_CURRENCY_CODE || "EUR",
            departureCountry:
              record.SALE_DEPART_COUNTRY || record.DEPARTURE_COUNTRY || "",
            arrivalCountry:
              record.SALE_ARRIVAL_COUNTRY || record.ARRIVAL_COUNTRY || "",
            taxableJurisdiction: record.TAXABLE_JURISDICTION || "",
            totalPriceOfItemsVatExcl: cleanAndParseFloat(
              record.TOTAL_PRICE_OF_ITEMS_AMT_VAT_EXCL ||
                record.PRICE_OF_ITEMS_AMT_VAT_EXCL,
            ),
            totalShipChargeVatExcl: cleanAndParseFloat(
              record.TOTAL_SHIP_CHARGE_AMT_VAT_EXCL ||
                record.SHIP_CHARGE_AMT_VAT_EXCL,
            ),
            totalGiftWrapVatExcl: cleanAndParseFloat(
              record.TOTAL_GIFT_WRAP_AMT_VAT_EXCL ||
                record.GIFT_WRAP_AMT_VAT_EXCL,
            ),
            totalValueVatExcl: cleanAndParseFloat(
              record.TOTAL_ACTIVITY_VALUE_AMT_VAT_EXCL,
            ),
            totalPriceOfItemsVat: cleanAndParseFloat(
              record.TOTAL_PRICE_OF_ITEMS_VAT_AMT ||
                record.PRICE_OF_ITEMS_VAT_AMT,
            ),
            totalShipChargeVat: cleanAndParseFloat(
              record.TOTAL_SHIP_CHARGE_VAT_AMT || record.SHIP_CHARGE_VAT_AMT,
            ),
            totalGiftWrapVat: cleanAndParseFloat(
              record.TOTAL_GIFT_WRAP_VAT_AMT || record.GIFT_WRAP_VAT_AMT,
            ),
            totalValueVat: cleanAndParseFloat(
              record.TOTAL_ACTIVITY_VALUE_VAT_AMT,
            ),
            totalPriceOfItemsVatIncl: cleanAndParseFloat(
              record.TOTAL_PRICE_OF_ITEMS_AMT_VAT_INCL ||
                record.PRICE_OF_ITEMS_AMT_VAT_INCL,
            ),
            totalShipChargeVatIncl: cleanAndParseFloat(
              record.TOTAL_SHIP_CHARGE_AMT_VAT_INCL ||
                record.SHIP_CHARGE_AMT_VAT_INCL,
            ),
            totalGiftWrapVatIncl: cleanAndParseFloat(
              record.TOTAL_GIFT_WRAP_AMT_VAT_INCL ||
                record.GIFT_WRAP_AMT_VAT_INCL,
            ),
            totalValueVatIncl: cleanAndParseFloat(
              record.TOTAL_ACTIVITY_VALUE_AMT_VAT_INCL,
            ),
          });
        } else {
          // Esto te dirá exactamente qué campo está fallando en las filas que no entran
          console.log(
            `⏩ Omitida: ${record.TRANSACTION_EVENT_ID} | Fecha OK: ${!!date} | Tipo OK: ${isAllowedType} | Esquema: ${csvScheme}`,
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

    console.log("Resultado Prisma:", result); // <-- AÑADE ESTO PARA VER EL LOG EN TU TERMINAL

    // 7. Respuesta detallada para saber qué pasa
    return corsResponse(
      {
        message: "Proceso completado",
        detalles: {
          frecuenciaProcesada: userFrequency,
          insertados: result.count,
        },
      },
      200,
      request,
    );

    //8. Error en el procesado del fichero
  } catch (error) {
    console.error("Error en el procesamiento del CSV:", error);
    return corsResponse(
      { message: "Error procesando el archivo", error: error.message },
      500,
    );
  }
}
