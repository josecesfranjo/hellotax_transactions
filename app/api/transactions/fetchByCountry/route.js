export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { EU_COUNTRIES } from "@/lib/EuCountries";
import { corsHeaders } from "@/lib/utils";

const prisma = new PrismaClient();

/**
 * OPTIONS: Maneja la petición "pre-flight" del navegador.
 * Sin esto, el navegador bloquea el GET por seguridad.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.toUpperCase();
  const userId = searchParams.get("userId");
  const yearStr = searchParams.get("year");
  const periodRaw = searchParams.get("period");

  // Validación de parámetros
  if (
    !country ||
    !userId ||
    !yearStr ||
    !periodRaw ||
    periodRaw === "undefined"
  ) {
    return NextResponse.json(
      { error: "Invalid parameters." },
      { status: 400, headers: corsHeaders } // Importante incluir headers incluso en errores
    );
  }

  const year = parseInt(yearStr);

  try {
    // 1. NORMALIZACIÓN DE FECHAS
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

    // 2. GENERACIÓN DE VARIACIONES DE PAÍS
    const countryInfo = EU_COUNTRIES[country];
    const variationsSet = new Set([country, country.toLowerCase()]);

    if (countryInfo) {
      variationsSet.add(countryInfo.name);
      variationsSet.add(countryInfo.name.toUpperCase());
      variationsSet.add(countryInfo.name.toLowerCase());
    }

    const countryVariations = Array.from(variationsSet);

    // 3. CONSULTA A PRISMA
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: userId,
        // Usamos taxableJurisdiction o arrivalCountry según tu mapeo del CSV
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

    // 4. RESPUESTA CON HEADERS CORS
    return NextResponse.json(
      {
        country,
        countryName: countryInfo?.name || country,
        count: transactions.length,
        transactions,
      },
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
