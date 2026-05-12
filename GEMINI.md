# Attendify-v2 Project Instructions

## Agent Coordination & Memory
- **Shared Log:** All agents MUST maintain and refer to `docs/CONTEXT.md`.
- **Pre-task:** Read `docs/CONTEXT.md` to understand the latest changes and context.
- **Post-task:** Update `docs/CONTEXT.md` with a summary of your changes, including date, time, and status.

## Tech Stack & Conventions
- **Framework:** Next.js 15 (App Router), TypeScript.
- **Styling:** Tailwind CSS v4, Premium/Dark/Sci-Fi aesthetic.
- **Database:** Firebase Firestore (Real-time updates for Smartboard).
- **Auth:** Firebase Auth with Role-based access (Admin, Teacher, Student).

## Development Workflow
- Use surgical `replace` for file edits.
- Ensure all new features are tested and follow the established UI/UX patterns.
- Always check `.env.local` for required Firebase credentials.
