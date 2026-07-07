# Material Gate Pass System

A full-stack material gate pass management system built as summer trainee project, digitizing the paper-based process of tracking material movement in and out of the plant — from request, to approval, to physical gate verification.

**Live:** [gate-pass-cyan.vercel.app](https://gate-pass-cyan.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)

## Overview

Material moving in or out of a manufacturing plant like BHEL needs a paper trail: what's leaving, who's carrying it, whether it's coming back, and who signed off on it. This project replaces that paper trail with a role-based web app that takes a gate pass from creation to approval to physical exit/return, with an audit log at every step.

## Features

- **Role-based access** — separate portals for Department Users, Admins, and Security staff, each scoped to what they're allowed to see and do
- **Two pass types** — Returnable (expects the material back, tracked for overdue returns) and Non-Returnable (one-way)
- **Approval workflow** — passes are routed to the correct approver based on department, with full approve/reject history
- **Security gate verification** — a dedicated checkpoint screen for verifying vehicle, driver, and materials before allowing exit or return, with deny/flag reasons logged
- **Automated notifications** — email alerts on creation, approval, and a two-stage overdue-return escalation (creator first, then Security) via a scheduled cron job
- **Vendor portal** — external vendors can register and view passes relevant to them without full system access
- **PDF gate pass generation** — printable/downloadable pass documents for physical verification at the gate
- **Atomic, collision-safe pass numbering** — a Postgres `SECURITY DEFINER` function guarantees unique sequential pass numbers even under concurrent submissions
- **Activity log** — every create/approve/reject/exit/return action is recorded against the pass for traceability

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Database & Auth | Supabase (Postgres, Row Level Security, Auth) |
| Styling | Tailwind CSS |
| Email | Resend |
| PDF Generation | pdfkit |
| Deployment | Vercel |

## Roles

| Role | Access |
|---|---|
| **User** | Create gate passes for their department, track their own submissions |
| **Admin** | Full visibility across all passes, approves requests, manages Security accounts |
| **Security** | Gate checkpoint — verifies and clears passes for physical exit/return |
| **Vendor** | Limited external portal for passes involving them |

## Project Structure

app/
├── login/                # Role-based sign-in
├── signup/               # Registration
├── dashboard/            # User & Admin gate pass list
├── gate-pass/
│   ├── new/              # Create a gate pass
│   └── [id]/             # View / edit a gate pass
├── security/             # Security checkpoint verification screen
├── admin/                # Admin-only management views
├── vendor/               # Vendor portal
└── api/                  # Route handlers (PDF export, email, overdue cron)
components/                # Shared UI (PortalHeader, form primitives)
lib/                       # Supabase client, auth helpers, business logic
