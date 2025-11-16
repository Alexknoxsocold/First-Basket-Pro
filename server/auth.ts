import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const SALT_ROUNDS = 12;

// Extend Express Request and Session types
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
  }
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
  if (!req.session?.userId) {
    return next();
  }

  try {
    const user = await storage.getUserById(req.session.userId);
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
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

    // Store user ID in session and save before responding
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
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

    // Store user ID in session and save before responding
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
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
    req.session.destroy((err) => {
      if (err) {
        console.error('[Auth] Logout error:', err);
        return res.status(500).json({ error: "Failed to log out" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
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

export async function inviteAccess(req: Request, res: Response) {
  try {
    const { code } = req.body;

    // Validate input
    if (!code) {
      return res.status(400).json({ error: "Invite code is required" });
    }

    // Check invite code against environment variable
    const validInviteCode = process.env.INVITE_CODE || "FIRSTBASKET2024";
    
    if (code !== validInviteCode) {
      return res.status(401).json({ error: "Invalid invite code" });
    }

    // Create a guest user if one doesn't exist
    const guestEmail = "guest@firstbasket.pro";
    let user = await storage.getUserByEmail(guestEmail);
    
    if (!user) {
      // Create guest user with a secure random password (they won't use it)
      const guestPassword = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const passwordHash = await hashPassword(guestPassword);
      
      user = await storage.createUser({
        email: guestEmail,
        passwordHash,
        role: 'guest'
      });
    }

    // Store user ID in session and save before responding
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Return user without password hash
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Invite access error:', error);
    res.status(500).json({ error: "Failed to process invite" });
  }
}
