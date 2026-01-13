import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { corsHeaders, corsResponse } from "@/lib/utils";

/**
 * Manejador para peticiones pre-flight (CORS).
 * Es vital para que el frontend (puerto 3000) pueda hablar con este microservicio (3001).
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  // 1. Obtención de parámetros de tiempo con valores por defecto
  const year = parseInt(searchParams.get("year")) || 2024;
  const period = searchParams.get("period") || "10";

  if (!userId) return corsResponse({ error: "userId requerido" }, 400);

  try {
    let startDate, endDate;

    // 2. Lógica de Calendario Fiscal: Determinamos el rango exacto de la consulta
    if (period.startsWith("Q")) {
      // Cálculo de Trimestres (Q1 = Meses 0,1,2 | Q2 = 3,4,5, etc.)
      const quarter = parseInt(period.substring(1));
      startDate = new Date(year, (quarter - 1) * 3, 1);
      endDate = new Date(year, quarter * 3, 1);
    } else {
      // Cálculo Mensual (Ajustando el desfase de 0-11 de JavaScript)
      const month = parseInt(period) - 1;
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 1);
    }

    // 3. Extracción de datos de la base de datos
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        transactionType: { in: ["SALE", "REFUND"] },
        transactionDate: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    // 4. Agregación de datos (Reduce): Aquí se hace la "magia" contable
    const summary = transactions.reduce((acc, curr) => {
      const country = curr.taxableJurisdiction || "UNKNOWN";

      // Manejo de signos: Las devoluciones restan del total del país
      const multi = curr.transactionType === "REFUND" ? -1 : 1;

      // Si es el primer registro de este país, inicializamos el acumulador
      if (!acc[country]) {
        acc[country] = {
          countryCode: country,
          currencyCode: curr.transactionCurrencyCode || "EUR",
          totalPriceOfItemsVat: 0,
          totalShipChargeVat: 0,
          totalGiftWrapVat: 0,
          totalValueVat: 0,
          totalPriceOfItemsVatIncl: 0,
          totalShipChargeVatIncl: 0,
          totalGiftWrapVatIncl: 0,
          totalValueVatIncl: 0,
        };
      }

      const s = acc[country];
      // Sumamos las cuotas de IVA y totales (ajustados por multi si es REFUND)
      s.totalPriceOfItemsVat += curr.totalPriceOfItemsVat * multi;
      s.totalShipChargeVat += curr.totalShipChargeVat * multi;
      s.totalGiftWrapVat += curr.totalGiftWrapVat * multi;
      s.totalValueVat += curr.totalValueVat * multi;
      s.totalPriceOfItemsVatIncl += curr.totalPriceOfItemsVatIncl * multi;
      s.totalShipChargeVatIncl += curr.totalShipChargeVatIncl * multi;
      s.totalGiftWrapVatIncl += curr.totalGiftWrapVatIncl * multi;
      s.totalValueVatIncl += curr.totalValueVatIncl * multi;

      return acc;
    }, {});

    // 5. Formateo y redondeo final (Para evitar errores de coma flotante de JS)
    const finalSummaries = Object.values(summary).map((values) => ({
      countryCode: values.countryCode,
      currencyCode: values.currencyCode,
      totalPriceOfItemsVat: Math.round(values.totalPriceOfItemsVat * 100) / 100,
      totalShipChargeVat: Math.round(values.totalShipChargeVat * 100) / 100,
      totalGiftWrapVat: Math.round(values.totalGiftWrapVat * 100) / 100,
      totalValueVat: Math.round(values.totalValueVat * 100) / 100,
      totalPriceOfItemsVatIncl:
        Math.round(values.totalPriceOfItemsVatIncl * 100) / 100,
      totalShipChargeVatIncl:
        Math.round(values.totalShipChargeVatIncl * 100) / 100,
      totalGiftWrapVatIncl: Math.round(values.totalGiftWrapVatIncl * 100) / 100,
      totalValueVatIncl: Math.round(values.totalValueVatIncl * 100) / 100,
    }));

    // 6. Respuesta final enriquecida
    return corsResponse({
      period: period,
      year: year,
      range: { start: startDate, end: endDate },
      summaries: finalSummaries,
    });
  } catch (error) {
    console.error("Error en microservicio de cálculo:", error);
    return corsResponse({ error: error.message }, 500);
  }
}
