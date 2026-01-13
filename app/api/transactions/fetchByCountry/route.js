export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { EU_COUNTRIES } from "@/lib/EuCountries";

const prisma = new PrismaClient();

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country")?.toUpperCase(); // "ES"
  const userId = searchParams.get("userId");
  const yearStr = searchParams.get("year");
  const periodRaw = searchParams.get("period");

  if (
    !country ||
    !userId ||
    !yearStr ||
    !periodRaw ||
    periodRaw === "undefined"
  ) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }

  const year = parseInt(yearStr);

  try {
    // 1. NORMALIZACIÓN DE FECHAS (Se mantiene igual)
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

    // 2. GENERACIÓN DINÁMICA DE VARIACIONES DE PAÍS
    // Buscamos el objeto del país en nuestra constante
    const countryInfo = EU_COUNTRIES[country];

    // Creamos un Set para evitar duplicados y metemos las variaciones básicas
    const variationsSet = new Set([
      country, // "ES"
      country.toLowerCase(), // "es"
    ]);

    // Si el país existe en nuestra constante de los 27, añadimos su nombre completo
    if (countryInfo) {
      variationsSet.add(countryInfo.name); // "Spain"
      variationsSet.add(countryInfo.name.toUpperCase()); // "SPAIN"
      variationsSet.add(countryInfo.name.toLowerCase()); // "spain"
    }

    const countryVariations = Array.from(variationsSet);

    console.log(
      `🔍 Querying DB for: ${country} | Variations: [${countryVariations.join(
        ", "
      )}]`
    );

    // 3. CONSULTA A PRISMA
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: userId,
        taxableJurisdiction: { in: countryVariations },
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

    const response = NextResponse.json({
      country,
      countryName: countryInfo?.name || country,
      count: transactions.length,
      transactions,
    });

    response.headers.set(
      "Access-Control-Allow-Origin",
      "http://localhost:3000"
    );
    return response;
  } catch (error) {
    console.error("❌ Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
