# Supabase Setup

## Overview
This directory contains local Supabase configuration and database management scripts.

---

## Structure
- `migrations/`: Versioned schema changes (reconstructed for clarity).
- `seed.sql`: Initial data for local development (includes mock auth users).
- `config.toml`: Supabase CLI configuration.

---

## Schema Source of Truth
The current database schema is defined in:
`../db/schema.sql`

This file represents the complete database structure including:
- Tables & Relationships
- Indexes for performance
- RLS policies for security
- Custom Functions (RPC)

---

## Notes
The database was originally built using Supabase Studio.
The migration files are **reconstructed** to reflect key architectural decisions:
1. `001`: Initial schema design.
2. `002`: Schema refinement.
3. `003`: RLS policy introduction.
4. `004`: Performance optimizations (Indexes).