import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { MongoClient } from 'mongodb';
import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { products } from '../src/products.js';

const scrypt = promisify(scryptCallback);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(currentDir, '..');
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'shopnova';
const sessionCookie = 'shopnova_session';
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

if (!mongoUri) {
  throw new Error('MONGODB_URI is required. Set it to your MongoDB Atlas connection string before starting ShopNova.');
}

const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
await mongoClient.connect();
const database = mongoClient.db(databaseName);
const users = database.collection('users');
const sessions = database.collection('sessions');
const catalog = database.collection('products');
const orders = database.collection('orders');

await Promise.all([
  users.createIndex({ email: 1 }, { unique: true }),
  sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  sessions.createIndex({ userId: 1 }),
  catalog.createIndex({ id: 1 }, { unique: true }),
  orders.createIndex({ createdAt: -1 })
]);

await catalog.bulkWrite(products.map(product => ({
  updateOne: {
    filter: { id: product.id },
    update: { $set: product },
    upsert: true
  }
})));

const app = express();
const port = Number(process.env.PORT || 3001);
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' }
});
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function getSessionToken(request) {
  const cookie = request.headers.cookie?.split('; ').find(part => part.startsWith(`${sessionCookie}=`));
  return cookie?.slice(sessionCookie.length + 1);
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${sessionCookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifetimeSeconds}${secure}`);
}

function publicUser(user) {
  return { id: user._id.toString(), email: user.email, isAdmin: Boolean(user.isAdmin) };
}

async function createSession(userId, response) {
  const token = randomBytes(32).toString('base64url');
  await sessions.insertOne({
    _id: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000)
  });
  setSessionCookie(response, token);
}

async function passwordHash(password, salt) {
  return scrypt(password, salt, 64);
}

async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || typeof password !== 'string') {
    throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to configure the admin account.');
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
    throw new Error('ADMIN_EMAIL must be valid and ADMIN_PASSWORD must be 12 to 128 characters.');
  }

  const existingUser = await users.findOne({ email });
  if (existingUser) {
    await users.updateOne({ _id: existingUser._id }, { $set: { isAdmin: true } });
    return;
  }

  const salt = randomBytes(16);
  const hash = await passwordHash(password, salt);
  await users.insertOne({
    email,
    passwordHash: hash.toString('hex'),
    passwordSalt: salt.toString('hex'),
    isAdmin: true,
    lastLoginAt: null,
    createdAt: new Date()
  });
}

function validateCredentials(request, response) {
  const email = request.body?.email;
  const password = request.body?.password;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    response.status(400).json({ error: 'Enter a valid email address.' });
    return null;
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    response.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    return null;
  }
  return { email: email.trim().toLowerCase(), password };
}

async function requireAdmin(request, response, next) {
  const token = getSessionToken(request);
  if (!token) return response.status(401).json({ error: 'Sign in with an admin account to continue.' });
  const session = await sessions.findOne({
    _id: hashSessionToken(token),
    expiresAt: { $gt: new Date() }
  });
  if (!session) return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  const user = await users.findOne({ _id: session.userId });
  if (!user?.isAdmin) return response.status(403).json({ error: 'Admin access is required.' });
  request.adminUser = publicUser(user);
  return next();
}

app.get('/api/auth/me', async (request, response) => {
  const token = getSessionToken(request);
  if (!token) return response.json({ user: null });
  const session = await sessions.findOne({
    _id: hashSessionToken(token),
    expiresAt: { $gt: new Date() }
  });
  const user = session ? await users.findOne({ _id: session.userId }) : null;
  return response.json({ user: user ? publicUser(user) : null });
});

app.post('/api/auth/register', authRateLimit, async (request, response) => {
  const credentials = validateCredentials(request, response);
  if (!credentials) return;

  const salt = randomBytes(16);
  const hash = await passwordHash(credentials.password, salt);
  try {
    const user = {
      email: credentials.email,
      passwordHash: hash.toString('hex'),
      passwordSalt: salt.toString('hex'),
      isAdmin: false,
      lastLoginAt: new Date(),
      createdAt: new Date()
    };
    const result = await users.insertOne(user);
    user._id = result.insertedId;
    await createSession(user._id, response);
    return response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ error: 'An account with this email already exists.' });
    }
    throw error;
  }
});

app.post('/api/auth/login', authRateLimit, async (request, response) => {
  const credentials = validateCredentials(request, response);
  if (!credentials) return;

  const user = await users.findOne({ email: credentials.email });
  if (!user) return response.status(401).json({ error: 'Email or password is incorrect.' });

  const hash = await passwordHash(credentials.password, Buffer.from(user.passwordSalt, 'hex'));
  const expectedHash = Buffer.from(user.passwordHash, 'hex');
  if (!timingSafeEqual(hash, expectedHash)) {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }

  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await createSession(user._id, response);
  return response.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', async (request, response) => {
  const token = getSessionToken(request);
  if (token) await sessions.deleteOne({ _id: hashSessionToken(token) });
  response.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return response.json({ success: true });
});

app.get('/api/admin/dashboard', requireAdmin, async (request, response) => {
  const requestedLimit = Number(request.query.limit || 50);
  const requestedOffset = Number(request.query.offset || 0);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 ||
      !Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    return response.status(400).json({ error: 'Pagination values must be non-negative integers.' });
  }
  const limit = Math.min(requestedLimit, 100);
  const customers = { isAdmin: { $ne: true } };
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [memberCount, activeMemberCount, orderCount, members] = await Promise.all([
    users.countDocuments(customers),
    users.countDocuments({ ...customers, lastLoginAt: { $gte: thirtyDaysAgo } }),
    orders.countDocuments(),
    users.find(customers, {
      projection: { email: 1, createdAt: 1, lastLoginAt: 1 }
    }).sort({ createdAt: -1, _id: -1 }).skip(requestedOffset).limit(limit).toArray()
  ]);
  return response.json({
    memberCount,
    activeMemberCount,
    orderCount,
    members: members.map(({ email, createdAt, lastLoginAt }) => ({ email, createdAt, lastLoginAt }))
  });
});

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', database: 'connected' });
});

app.get('/api/products', async (_request, response) => {
  const rows = await catalog.find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
  response.json(rows);
});

app.post('/api/orders', async (request, response) => {
  const items = request.body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return response.status(400).json({ error: 'Provide between 1 and 50 cart items.' });
  }

  const quantities = new Map();
  for (const item of items) {
    if (!Number.isSafeInteger(item?.id) || !Number.isSafeInteger(item?.qty) || item.qty < 1 || item.qty > 99) {
      return response.status(400).json({ error: 'Each item must have a valid product ID and quantity from 1 to 99.' });
    }
    const quantity = (quantities.get(item.id) || 0) + item.qty;
    if (quantity > 99) {
      return response.status(400).json({ error: 'A product quantity cannot exceed 99.' });
    }
    quantities.set(item.id, quantity);
  }

  const orderProducts = await catalog.find(
    { id: { $in: [...quantities.keys()] } },
    { projection: { id: 1, name: 1, price: 1 } }
  ).toArray();
  if (orderProducts.length !== quantities.size) {
    return response.status(400).json({ error: 'One or more cart products are no longer available.' });
  }

  const orderItems = orderProducts.map(product => ({
    productId: product.id,
    name: product.name,
    unitPrice: product.price,
    quantity: quantities.get(product.id)
  }));
  const total = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const result = await orders.insertOne({ items: orderItems, total, createdAt: new Date() });
  return response.status(201).json({ orderId: result.insertedId.toString(), total, paymentCollected: false });
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'API route not found.' });
});

const distDir = path.join(projectDir, 'dist');
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.use((request, response, next) => {
    if (request.method !== 'GET') return next();
    response.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((error, _request, response, _next) => {
  console.error('Request failed:', error);
  if (response.headersSent) return;
  response.status(error instanceof SyntaxError ? 400 : 500).json({
    error: error instanceof SyntaxError ? 'Request body must be valid JSON.' : 'An unexpected server error occurred.'
  });
});

await bootstrapAdmin();

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`ShopNova API listening on http://localhost:${port} (MongoDB: ${databaseName})`);
});

function shutdown() {
  server.close(() => {
    mongoClient.close().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
