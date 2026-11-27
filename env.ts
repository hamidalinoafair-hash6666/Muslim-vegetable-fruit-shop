import dotenv from 'dotenv';

// Load .env before server/auth and server/db initialize, overriding container-wrapped vars
// (does not remove runtime-injected keys like GEMINI_API_KEY that are absent from .env).
dotenv.config({ override: true });
