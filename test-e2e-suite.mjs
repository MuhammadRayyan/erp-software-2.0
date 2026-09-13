import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log("Starting in-depth E2E checks...");
  const baseUrl = "http://localhost:3000";
  let cookie = "";

  try {
    // 1. Login
    const loginRes = await fetch(${baseUrl}/api/auth/sign-in/email, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@demo.local", password: "demo12345" })
    });
    
    if (!loginRes.ok) throw new Error("Login failed");
    const setCookie = loginRes.headers.get("set-cookie");
    if (setCookie) {
      cookie = setCookie.split(";")[0];
    }
    console.log("✅ Login successful");
  } catch (e) {
    console.error("❌ Login error", e);
    return;
  }

  const headers = { "Cookie": cookie };

  // 2. Test Core Pages Render (200 OK)
  const pagesToTest = [
    "/b/demo/sales/invoices",
    "/b/demo/sales/orders",
    "/b/demo/sales/quotes",
    "/b/demo/sales/credit-notes",
    "/b/demo/purchases/invoices",
    "/b/demo/purchases/orders",
    "/b/demo/purchases/debit-notes",
    "/b/demo/customers",
    "/b/demo/suppliers",
    "/b/demo/projects"
  ];

  for (const page of pagesToTest) {
    try {
      const res = await fetch(${baseUrl}, { headers });
      if (res.ok) {
        console.log(✅ Rendered  successfully);
      } else {
        console.error(❌ Failed to render  - Status: );
      }
    } catch (e) {
      console.error(❌ Network error on , e.message);
    }
  }
}

runTests();
