async function test() {
  // 1. Sign in
  const loginRes = await fetch("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.local", password: "demo12345" })
  });
  const cookies = loginRes.headers.get("set-cookie");
  console.log("Login OK:", loginRes.status);
  
  // 2. Fetch the preview
  const res = await fetch("http://localhost:3000/api/businesses/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/document-templates/preview-pdf?type=sales-quote", {
    headers: {
      "Cookie": cookies || ""
    }
  });
  console.log("Preview PDF Status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));
  
  if (res.status === 200) {
    const buf = await res.arrayBuffer();
    console.log("PDF length:", buf.byteLength);
  } else {
    console.log(await res.text());
  }
}
test();
