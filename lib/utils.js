import { NextResponse } from "next/server";

export const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export const corsResponse = (data, status = 200) => {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders,
  });
};
