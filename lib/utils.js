import { NextResponse } from "next/server";

// 1. Configuración de CORS centralizada
export const corsHeaders = {
  "Access-Control-Allow-Origin": "https://hellotax-app.vercel.app",
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
export const getRobustDate = (dateStr) => {
  if (!dateStr) return null;

  // Amazon usa "13-06-2025"
  if (dateStr.includes("-")) {
    const parts = dateStr.split(" ")[0].split("-");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      // Creamos la fecha en formato ISO (YYYY-MM-DD) que sí entiende JS
      const d = new Date(`${year}-${month}-${day}`);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};
