// Cliente de la base de datos
import prisma from "@/lib/prisma";

// Importaciones Next.js
import { NextResponse } from "next/server";

// Utilidades para la gestión del CORS
import { corsHeaders, corsResponse } from "@/lib/utils";

// Force Dynamic
export const dynamic = "force-dynamic";

// Definimos el método OPTIONS para gestionar el CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 *  GET api/transactions/fetch
 *
 *  Name:         Fetch VAT Data
 *  Description:  Devuelve un conjunto de datos calculados sobre las ventas
 *                y los impuestos de una empresa en un periodo concreto, que
 *                puede ser un mes o un trimestre, a partir de las transacciones
 *                que ha realizado la empresa en ese periodo
 **/

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return corsResponse({ error: "userId requerido" }, 400);

  // 1. Obtiene del params los parámetros de tiempo
  const year = parseInt(searchParams.get("year"));
  const period = searchParams.get("period");

  try {
    let startDate, endDate;

    // 2. Determina el rango exacto de la consulta
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

    // 3. Extrae los datos de la base de datos
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

    // 4. Agregación de datos
    const summary = transactions.reduce((acc, curr) => {
      const country = curr.taxableJurisdiction || "UNKNOWN";
      const multi = curr.transactionType === "REFUND" ? -1 : 1;
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

    // 5. Formateo y redondeo final
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

    // 6. Respuesta con el resultado
    return corsResponse({
      period: period,
      year: year,
      range: { start: startDate, end: endDate },
      summaries: finalSummaries,
    });

    // 7. Respuesta del error en el cálculo
  } catch (error) {
    console.error("Error en microservicio de cálculo:", error);
    return corsResponse({ error: error.message }, 500);
  }
}
