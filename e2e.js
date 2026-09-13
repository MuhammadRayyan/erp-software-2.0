
async function runTests() {
  console.log('Starting E2E tests...');
  const loginRes = await fetch('http://localhost:3000/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3000' },
    body: JSON.stringify({ email: 'admin@demo.local', password: 'demo12345' })
  });
  const setCookie = loginRes.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';
  const headers = { 'Cookie': cookie };

  if (!cookie) {
    console.error('Failed to get cookie', await loginRes.text());
    return;
  }

  const pages = [
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/invoices',
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/quotes',
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/orders',
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/sales/credit-notes',
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/invoices',
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/quotes',
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/orders',
    '/b/6a65b5ce-01e4-491f-8ada-0eddd05a50c2/purchases/debit-notes'
  ];

  for (const page of pages) {
    const res = await fetch('http://localhost:3000' + page, { headers, redirect: 'manual' });
    console.log(res.ok ? 'OK: ' + page : 'FAIL: ' + page + ' ' + res.status);
  }
}
runTests();

