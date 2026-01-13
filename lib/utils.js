import { NextResponse } from "next/server";

// 1. Configuración de CORS centralizada
export const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// 2. Helper para respuestas consistentes
export const corsResponse = (data, status = 200) => {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders,
  });
};

// 3. Limpieza de números (para el CSV)
export const cleanAndParseFloat = (value) => {
  if (typeof value !== "string") value = String(value || "0");
  const cleanedValue = value.trim().replace(",", ".");
  const result = parseFloat(cleanedValue);
  return isNaN(result) ? 0 : result;
};

// 4. Procesamiento robusto de fechas
export function getRobustDate(dateStr) {
  if (!dateStr) return null;

  // Si la fecha tiene guiones y el primer bloque es de 2 dígitos (formato DD-MM-YYYY)
  if (dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts[0].length === 2) {
      const [day, month, year] = parts;
      // Creamos la fecha (el mes en JS empieza en 0, por eso restamos 1)
      const d = new Date(year, month - 1, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Intento estándar para otros formatos
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}
