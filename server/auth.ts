import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const SALT_ROUNDS = 12;
const SESSION_DURATION_DAYS = 30;

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Generate a secure session token
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

// Hash a password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify a password against a hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Auth middleware - attaches user to request if valid session exists
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.cookies?.session;

  if (!sessionToken) {
    return next();
  }

  try {
    const session = await storage.getSessionByToken(sessionToken);
    
    if (!session) {
      return next();
    }

    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      await storage.deleteSession(session.id);
      res.clearCookie('session');
      return next();
    }

    // Get user and attach to request
    const user = await storage.getUserById(session.userId);
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    console.error('[Auth] Middleware error:', error);
    next();
  }
}

// Require auth middleware - returns 401 if not authenticated
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Auth route handlers
export async function signup(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = await storage.createUser({
      email,
      passwordHash,
      role: 'user'
    });

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    await storage.createSession({
      userId: user.id,
      sessionToken,
      expiresAt
    });

    // Set cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
    });

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Signup error:', error);
    res.status(500).json({ error: "Failed to create account" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

    await storage.createSession({
      userId: user.id,
      sessionToken,
      expiresAt
    });

    // Set cookie
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
    });

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: "Failed to log in" });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    const sessionToken = req.cookies?.session;

    if (sessionToken) {
      const session = await storage.getSessionByToken(sessionToken);
      if (session) {
        await storage.deleteSession(session.id);
      }
    }

    res.clearCookie('session');
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: "Failed to log out" });
  }
}

export async function getSession(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ user: null });
  }

  // Return user without password hash
  const { passwordHash: _, ...userWithoutPassword } = req.user;
  res.json({ user: userWithoutPassword });
}
