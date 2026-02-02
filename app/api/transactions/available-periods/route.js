// Cliente de la base de datos
import prisma from "@/lib/prisma";

// Importaciones Next.js
import { NextResponse } from "next/server";

// Utilidades para la gestión del CORS
import { corsHeaders, corsResponse } from "@/lib/utils";

// Importamos las constantes necesarias
import { MONTH_NAMES } from "@/lib/Constants";

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
 *  GET api/transactions/available-periods
 *
 *  Name:           Get Available Periods
 *  Description:    Escanea la tabla de transacciones de un usuario y devuelve una lista
 *                  única de periodos (Mes/Año) que contienen datos procesables.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  // Capturamos la frecuencia enviada desde el frontend
  const taxFrequency = searchParams.get("taxFrequency") || "MONTHLY";

  if (!userId) return corsResponse({ error: "userId requerido" }, 400);

  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      select: { transactionDate: true },
      distinct: ["transactionDate"],
    });

    const periodsMap = new Map();

    transactions.forEach((t) => {
      const d = new Date(t.transactionDate);
      const year = d.getUTCFullYear();
      const monthIdx = d.getUTCMonth(); // 0-11

      if (taxFrequency === "MONTHLY") {
        // --- SOLO LÓGICA MENSUAL ---
        const monthNum = String(monthIdx + 1).padStart(2, "0");
        const monthKey = `M-${year}-${monthNum}`;
        if (!periodsMap.has(monthKey)) {
          periodsMap.set(monthKey, {
            year,
            period: monthNum, // Ej: "03"
            monthLabel: MONTH_NAMES[monthIdx],
            type: "MONTHLY",
            fullLabel: `${MONTH_NAMES[monthIdx]} ${year}`,
          });
        }
      } else {
        // --- SOLO LÓGICA TRIMESTRAL ---
        const qNum = Math.floor(monthIdx / 3) + 1;
        const quarter = `Q${qNum}`;
        const quarterKey = `Q-${year}-${quarter}`;
        if (!periodsMap.has(quarterKey)) {
          periodsMap.set(quarterKey, {
            year,
            period: String(qNum), // Guardamos "1" para Q1
            monthLabel: quarter, // "Q1"
            type: "QUARTERLY",
            fullLabel: `${quarter} ${year}`,
          });
        }
      }
    });

    const sortedPeriods = Array.from(periodsMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.period.localeCompare(a.period);
    });

    return corsResponse({
      userId,
      frequencyApplied: taxFrequency,
      count: sortedPeriods.length,
      periods: sortedPeriods,
    });
  } catch (error) {
    console.error("❌ Error en available-periods:", error);
    return corsResponse({ error: error.message }, 500);
  }
}
