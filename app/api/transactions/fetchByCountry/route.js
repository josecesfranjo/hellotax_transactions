// Cliente de la base de datos
import prisma from "@/lib/prisma";

// Importaciones Next.js
import { NextResponse } from "next/server";

// Utilidades para la gestión del CORS
import { corsHeaders, corsResponse } from "@/lib/utils";

// Constante con los países de UE y sus códigos
import { EU_COUNTRIES } from "@/lib/EuCountries";

// Force Dynamic
export const dynamic = "force-dynamic";

// Definimos el método OPTIONS para gestionar el CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 *  GET api/transactions/fetchByCountry
 *
 *  Name:         Fetch Transactions By Country
 *  Description:  Devuelve las transacciones existentes en la base de datos para
 *                una empresa, un periodo de tiempo concreto, que puede ser
 *                un mes o un trimestre, y un país concreto
 **/

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.toUpperCase();
  const userId = searchParams.get("userId");
  const yearStr = searchParams.get("year");
  const periodRaw = searchParams.get("period");

  // 1. Validación de parámetros
  if (
    !country ||
    !userId ||
    !yearStr ||
    !periodRaw ||
    periodRaw === "undefined"
  ) {
    return corsResponse({ error: "Invalid parameters." }, 400);
  }

  const year = parseInt(yearStr);

  try {
    // 2. Normalización de fechas
    let startDate, endDate;
    if (periodRaw.startsWith("Q")) {
      const quarter = parseInt(periodRaw.substring(1));
      startDate = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
      endDate = new Date(Date.UTC(year, quarter * 3, 1));
    } else {
      const month = parseInt(periodRaw) - 1;
      startDate = new Date(Date.UTC(year, month, 1));
      endDate = new Date(Date.UTC(year, month + 1, 1));
    }

    // 3. Generación de variables de país
    const countryInfo = EU_COUNTRIES[country];
    const variationsSet = new Set([country, country.toLowerCase()]);
    if (countryInfo) {
      variationsSet.add(countryInfo.name);
      variationsSet.add(countryInfo.name.toUpperCase());
      variationsSet.add(countryInfo.name.toLowerCase());
    }
    const countryVariations = Array.from(variationsSet);

    // 4. Extracción de datos de la base de datos
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: userId,
        OR: [
          { taxableJurisdiction: { in: countryVariations } },
          { arrivalCountry: { in: countryVariations } },
        ],
        transactionType: { in: ["SALE", "REFUND"] },
        transactionDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        transactionId: true,
        transactionType: true,
        transactionDate: true,
        itemDescription: true,
        itemQuantity: true,
        totalValueVatExcl: true,
        totalValueVat: true,
        totalValueVatIncl: true,
        transactionCurrencyCode: true,
      },
      orderBy: { transactionDate: "desc" },
    });

    // 6. Respuesta con el resultado
    return corsResponse({
      country,
      countryName: countryInfo?.name || country,
      count: transactions.length,
      transactions,
    });

    // 7. Error en el cálculo
  } catch (error) {
    console.error("❌ Error en Microservicio Detalle:", error.message);
    return corsResponse({ error: error.message }, 500);
  }
}
