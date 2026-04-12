# GitHub Copilot instructions — LAB-Guard

Use this file together with project docs and code. For visual and UX direction, treat **Design Context** below as authoritative when building or refactoring UI.

## Design Context

### Users

- University coursework project; **not commercialized**. Deployment target, if any: **university lab computers only**.
- Windows Electron app for **lab exams**: admins, teachers, students.
- **Students** should feel **calm**. **Teachers** should perceive the product as **fair** and **trusted**.

### Use cases

Exam lifecycle, proctoring (desktop/camera), C++ evaluation, optional LLM features — see repository README for pipelines.

### Brand personality

- **Elegant** in the sense of refined structure and typography, not heavy decoration.
- **Playful** elements balanced with an **institutional**, credible academic tone.

### Aesthetic direction

- **Light mode only.**
- No mandated brand colors; choose a cohesive, calm, slightly playful light palette.
- UI should be **engaging** (strong hierarchy, spacing, type, purposeful motion) — **not boring** — without becoming noisy or untrustworthy.

### Design principles

1. Calm, focused student exam experiences.
2. Clear, evidence-friendly teacher/admin views (fairness, trust).
3. Playful touches inside a serious institutional frame.
4. Engagement through craft, not clutter; respect reduced motion.
5. Prefer evolving shared tokens (`frontend/src/styles/design-system.css`) over scattered one-offs.

For deeper design workflow and quality bar, the project uses the **Impeccable** skill (`.agents/skills/impeccable/`); follow `.impeccable.md` at repo root for full context.
