import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const SALT_ROUNDS = 12;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
type Attempt = { count: number; resetAt: number };
const loginAttempts = new Map<string, Attempt>();
const signupAttempts = new Map<string, Attempt>();
const inviteAttempts = new Map<string, Attempt>();

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    isAdminVerified?: boolean;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function requestKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneAttempts(map: Map<string, Attempt>, now: number): void {
  if (map.size < 2000) return;
  for (const [key, value] of map) if (value.resetAt <= now) map.delete(key);
}

function consumeAttempt(req: Request, res: Response, map: Map<string, Attempt>, limit: number): boolean {
  const now = Date.now();
  pruneAttempts(map, now);
  const key = requestKey(req);
  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }
  if (existing.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many attempts. Please try again later." });
    return false;
  }
  existing.count++;
  return true;
}

function clearAttempts(req: Request, map: Map<string, Attempt>): void {
  map.delete(requestKey(req));
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) return next();
  try {
    const user = await storage.getUserById(req.session.userId);
    if (user) req.user = user;
    else req.session.userId = undefined;
    next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isAdminVerified) return res.status(403).json({ error: "Admin access required" });
  next();
}

export async function signup(req: Request, res: Response) {
  if (!consumeAttempt(req, res, signupAttempts, 6)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: "Invalid email format" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (password.length > 256) return res.status(400).json({ error: "Password is too long" });

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await hashPassword(password);
    const user = await storage.createUser({ email, passwordHash, role: 'user' });
    await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    clearAttempts(req, signupAttempts);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    res.status(500).json({ error: "Failed to create account" });
  }
}

export async function login(req: Request, res: Response) {
  if (!consumeAttempt(req, res, loginAttempts, 10)) return;
  try {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(401).json({ error: "Invalid email or password" });
    if (password.length > 256) return res.status(401).json({ error: "Invalid email or password" });

    const user = await storage.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: "Invalid email or password" });

    await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    clearAttempts(req, loginAttempts);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: "Failed to log in" });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    req.session.destroy(err => {
      if (err) {
        console.error('[Auth] Logout error:', err);
        return res.status(500).json({ error: "Failed to log out" });
      }
      res.clearCookie('connect.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      res.json({ message: "Logged out successfully" });
    });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: "Failed to log out" });
  }
}

export async function getSession(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ user: null });
  const { passwordHash: _, ...userWithoutPassword } = req.user;
  res.json({ user: userWithoutPassword });
}

export async function inviteAccess(req: Request, res: Response) {
  if (!consumeAttempt(req, res, inviteAttempts, 10)) return;
  try {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code) return res.status(400).json({ error: "Invite code is required" });

    const validInviteCode = process.env.INVITE_CODE?.trim();
    if (!validInviteCode) {
      console.error('[Auth] INVITE_CODE is not configured; invite access disabled.');
      return res.status(503).json({ error: "Invite access is temporarily unavailable" });
    }
    if (code.length > 256 || code !== validInviteCode) return res.status(401).json({ error: "Invalid invite code" });

    const guestEmail = "guest@firstbasket.pro";
    let user = await storage.getUserByEmail(guestEmail);
    if (!user) {
      const guestPassword = randomBytes(32).toString("base64url");
      const passwordHash = await hashPassword(guestPassword);
      user = await storage.createUser({ email: guestEmail, passwordHash, role: 'guest' });
    }

    await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    clearAttempts(req, inviteAttempts);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Invite access error:', error);
    res.status(500).json({ error: "Failed to process invite" });
  }
}
