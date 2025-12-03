// Comprehensive end-to-end API test to validate backend <-> frontend flows
// Requires backend server running and MongoDB available.
// Usage: npm run test:api (after starting the backend)

// Use global fetch if available (Node >=18), otherwise fall back to node-fetch (ESM)
const fetchFn = global.fetch
  ? global.fetch.bind(global)
  : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function logStep(title) {
  console.log(`\n=== ${title} ===`);
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'Assertion failed');
}

async function req(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetchFn(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': body instanceof FormData ? undefined : 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body:
      body instanceof FormData
        ? body
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { res, data };
}

async function run() {
  console.log('Starting Full API Integration Test...');

  const state = {
    admin: { email: 'admin@gmail.com', password: 'admin123', token: '' },
    caretaker: { email: 'caretaker@gmail.com', password: 'caretaker123', token: '' },
    user: { email: `testuser_${Date.now()}@example.com`, password: 'password123', id: '', token: '' },
    pg: { id: '', name: 'Test PG E2E' },
    booking: { id: '' },
    payment: { id: '' },
    complaint: { id: '' },
    notice: { id: '' },
  };

  let passed = 0;
  let failed = 0;

  // 1. Health Check
  try {
    logStep('Health Check');
    const { res, data } = await req('/');
    assert(res.ok, 'Health check failed');
    console.log('Health:', data);
    passed++;
  } catch (e) {
    failed++;
    console.error('Health Check FAILED:', e.message);
    return process.exit(1);
  }

  // 2. Public Lists used by frontend
  try {
    logStep('Public Lists: /api/pgs, /api/notices, /api/complaints');
    const pgs = await req('/api/pgs');
    assert(pgs.res.ok, 'GET /api/pgs failed');
    const notices = await req('/api/notices');
    assert(notices.res.ok, 'GET /api/notices failed');
    const complaints = await req('/api/complaints');
    assert(complaints.res.ok, 'GET /api/complaints failed');
    console.log('Public lists accessible');
    passed++;
  } catch (e) {
    failed++;
    console.error('Public Lists FAILED:', e.message);
  }

  // 3. Admin Login
  try {
    logStep('Admin Login');
    const { res, data } = await req('/api/login', {
      method: 'POST',
      body: { email: state.admin.email, password: state.admin.password },
    });
    assert(res.ok && data.token, 'Admin login failed');
    state.admin.token = data.token;
    console.log('Admin login success');
    passed++;
  } catch (e) {
    failed++;
    console.error('Admin Login FAILED:', e.message);
  }

  // 4. Caretaker Login
  try {
    logStep('Caretaker Login');
    const { res, data } = await req('/api/login', {
      method: 'POST',
      body: { email: state.caretaker.email, password: state.caretaker.password },
    });
    assert(res.ok && data.token, 'Caretaker login failed');
    state.caretaker.token = data.token;
    console.log('Caretaker login success');
    passed++;
  } catch (e) {
    failed++;
    console.error('Caretaker Login FAILED:', e.message);
  }

  // 5. Create PG (Admin)
  try {
    logStep('Create PG (Admin)');
    const body = {
      name: state.pg.name,
      address: '123 Test St',
      price: 5000,
      type: 'Boys',
      facilities: ['WiFi', 'AC'],
      totalBeds: 10,
      occupiedBeds: 0,
    };
    const { res, data } = await req('/api/pgs', { method: 'POST', token: state.admin.token, body });
    assert(res.ok && data.id, 'Create PG failed');
    state.pg.id = data.id;
    console.log('PG created:', state.pg.id);
    passed++;
  } catch (e) {
    failed++;
    console.error('Create PG FAILED:', e.message);
  }

  // 6. Signup + Login User
  try {
    logStep('User Signup');
    const { res, data } = await req('/api/signup', {
      method: 'POST',
      body: { name: 'Test User', email: state.user.email, password: state.user.password },
    });
    assert(res.ok && data.token && data.id, 'User signup failed');
    state.user.token = data.token;
    state.user.id = data.id;
    console.log('User signup success:', state.user.email);

    // Optional: login again to verify
    const login = await req('/api/login', {
      method: 'POST',
      body: { email: state.user.email, password: state.user.password },
    });
    assert(login.res.ok && login.data.token, 'User login failed');
    state.user.token = login.data.token;
    console.log('User login success');
    passed++;
  } catch (e) {
    failed++;
    console.error('User Signup/Login FAILED:', e.message);
  }

  // 7. Create Booking (User)
  try {
    logStep('Create Booking (User)');
    assert(state.pg.id, 'No PG to book');
    const body = {
      pgId: state.pg.id,
      userId: state.user.id,
      userName: 'Test User',
      pgName: state.pg.name,
      date: new Date().toISOString(),
      status: 'Pending',
    };
    const { res, data } = await req('/api/bookings', { method: 'POST', token: state.user.token, body });
    assert(res.ok && data._id, 'Create booking failed');
    state.booking.id = data._id;
    console.log('Booking created:', state.booking.id);
    passed++;
  } catch (e) {
    failed++;
    console.error('Create Booking FAILED:', e.message);
  }

  // 8. Confirm Booking (Admin) -> triggers payment creation
  try {
    logStep('Confirm Booking (Admin)');
    assert(state.booking.id, 'No booking to confirm');
    const { res, data } = await req(`/api/bookings/${state.booking.id}`, {
      method: 'PUT',
      token: state.admin.token,
      body: { status: 'Confirmed' },
    });
    assert(res.ok && data.status === 'Confirmed', 'Confirm booking failed');
    console.log('Booking confirmed');
    // give backend a moment to create payment
    await sleep(500);
    passed++;
  } catch (e) {
    failed++;
    console.error('Confirm Booking FAILED:', e.message);
  }

  // 9. Payments (User) -> should see at least one payment for this booking
  try {
    logStep('Get Payments (User)');
    const { res, data } = await req('/api/payments', { token: state.user.token });
    assert(res.ok && Array.isArray(data), 'Get payments failed');
    const forBooking = data.find((p) => `${p.bookingId}` === `${state.booking.id}`);
    assert(forBooking, 'No payment found for confirmed booking');
    state.payment.id = forBooking._id;
    console.log('Payment found:', state.payment.id);
    passed++;
  } catch (e) {
    failed++;
    console.error('Get Payments FAILED:', e.message);
  }

  // 10. Mark Payment as Paid (User)
  try {
    logStep('Mark Payment Paid (User)');
    assert(state.payment.id, 'No payment to update');
    const { res, data } = await req(`/api/payments/${state.payment.id}`, {
      method: 'PUT',
      token: state.user.token,
      body: { transactionId: `TX-${Date.now()}`, screenshotUrl: '/uploads/dummy.png' },
    });
    assert(res.ok && (data.status === 'Paid' || data.status === 'Verified'), 'Update payment failed');
    console.log('Payment updated by user with transactionId');
    passed++;
  } catch (e) {
    failed++;
    console.error('Update Payment FAILED:', e.message);
  }

  // 11. Create Complaint (User) and resolve it (Admin)
  try {
    logStep('Create & Resolve Complaint');
    const create = await req('/api/complaints', {
      method: 'POST',
      token: state.user.token,
      body: { userId: state.user.id, userName: 'Test User', description: 'Test Issue', status: 'Open' },
    });
    assert(create.res.ok && create.data._id, 'Create complaint failed');
    state.complaint.id = create.data._id;

    const resolve = await req(`/api/complaints/${state.complaint.id}`, {
      method: 'PUT',
      token: state.admin.token,
      body: { status: 'Resolved' },
    });
    assert(resolve.res.ok && resolve.data.status === 'Resolved', 'Resolve complaint failed');
    console.log('Complaint created and resolved');
    passed++;
  } catch (e) {
    failed++;
    console.error('Complaint Flow FAILED:', e.message);
  }

  // 12. Create & Delete Notice (Caretaker)
  try {
    logStep('Create & Delete Notice (Caretaker)');
    const create = await req('/api/notices', {
      method: 'POST',
      token: state.caretaker.token,
      body: { title: 'Test Notice', message: 'This is a test notice', date: new Date().toISOString() },
    });
    assert(create.res.ok && create.data._id, 'Create notice failed');
    state.notice.id = create.data._id;

    const del = await req(`/api/notices/${state.notice.id}`, {
      method: 'DELETE',
      token: state.caretaker.token,
    });
    assert(del.res.ok, 'Delete notice failed');
    console.log('Notice created and deleted');
    passed++;
  } catch (e) {
    failed++;
    console.error('Notice Flow FAILED:', e.message);
  }

  // 13. Ratings (User)
  try {
    logStep('Post Rating (User)');
    const { res, data } = await req('/api/ratings', {
      method: 'POST',
      token: state.user.token,
      body: { pgId: state.pg.id, rating: 5, comment: 'Excellent stay!' },
    });
    assert(res.ok && data._id, 'Post rating failed');
    console.log('Rating submitted');
    passed++;
  } catch (e) {
    failed++;
    console.error('Post Rating FAILED:', e.message);
  }

  // 14. Admin Stats
  try {
    logStep('Admin Stats');
    const { res, data } = await req('/api/admin/stats', { token: state.admin.token });
    assert(res.ok && typeof data.totalPgs === 'number', 'Admin stats failed');
    console.log('Admin stats OK');
    passed++;
  } catch (e) {
    failed++;
    console.error('Admin Stats FAILED:', e.message);
  }

  // Cleanup
  try {
    logStep('Cleanup: delete booking and PG');
    if (state.booking.id) {
      await req(`/api/bookings/${state.booking.id}`, { method: 'DELETE', token: state.admin.token });
      console.log('Booking deleted');
    }
    if (state.pg.id) {
      await req(`/api/pgs/${state.pg.id}`, { method: 'DELETE', token: state.admin.token });
      console.log('PG deleted');
    }
    passed++;
  } catch (e) {
    failed++;
    console.error('Cleanup FAILED:', e.message);
  }

  console.log(`\nRESULT: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
