"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Github } from "lucide-react";
import SectionHeading from "./SectionHeading";

const projects = [
  {
    index: "01",
    title: "AI-Powered Animated Video Generation System",
    tagline: "Prompt-to-video multi-agent pipeline",
    desc: "An end-to-end multi-agent pipeline that turns a natural language prompt into a complete short animated video — story generation, voice synthesis, visual composition, and final MP4 export — with zero manual creative intervention.",
    stack: ["LangChain", "LangGraph", "ElevenLabs", "Stable Diffusion", "FFmpeg", "FastAPI"],
    metric: "Fully autonomous story-to-video pipeline",
    accent: "from-violet/30 to-cyan/10",
  },
  {
    index: "02",
    title: "Legal Assistant CRM for Law Firms",
    tagline: "AI-driven client & appointment management",
    desc: "An intelligent CRM that handles client intake end-to-end for law firms — booking appointments, matching clients to the right lawyer based on case type, and managing upfront client communication automatically.",
    stack: ["LangChain", "FastAPI", "Node.js", "PostgreSQL"],
    metric: "Automates intake, matching & scheduling",
    accent: "from-cyan/25 to-violet/15",
  },
  {
    index: "03",
    title: "Autonomous AI Agent for Document Processing",
    tagline: "Multi-agent RAG orchestration framework",
    desc: "A multi-agent orchestration framework using LangChain for complex document workflows, with RAG pipelines over vector databases and chain-of-thought prompting for enhanced agent reasoning. Deployed via FastAPI in Docker, orchestrated with Kubernetes.",
    stack: ["LangChain", "FastAPI", "Docker", "Kubernetes"],
    metric: "Domain-tuned GPT-4 & Claude integration",
    accent: "from-amber/20 to-violet/10",
  },
  {
    index: "04",
    title: "LabGuard — Monitoring & Compliance Analytics",
    tagline: "Real-time monitoring & alerting platform",
    desc: "A real-time monitoring platform with WebSocket integration for instant event tracking, high-throughput event pipelines, automated anomaly detection, and analytics dashboards for compliance reporting.",
    stack: ["Node.js", "MongoDB", "WebSocket", "REST APIs"],
    metric: "Thousands of concurrent events handled",
    accent: "from-violet/25 to-cyan/15",
  },
  {
    index: "05",
    title: "Generative AI Research — Diffusion Models",
    tagline: "Comparative diffusion-model research",
    desc: "Comparative analysis of DDPM and Latent Diffusion architectures on domain-specific datasets, evaluated with FID and Inception Score metrics, alongside custom evaluation frameworks for production-readiness.",
    stack: ["PyTorch", "Hugging Face Diffusers", "DDPM", "Latent Diffusion"],
    metric: "Benchmarked via FID & Inception Score",
    accent: "from-cyan/20 to-amber/10",
  },
];

export default function Projects() {
  return (
    <section id="projects" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          tag="// 04_projects"
          title="Selected work"
          description="Five projects that show how I move from a research idea to a system real users depend on."
        />

        <div className="grid gap-6 md:grid-cols-2">
          {projects.map((p, i) => (
            <motion.article
              key={p.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: (i % 2) * 0.1 }}
              className={`glow-border group relative overflow-hidden rounded-2xl border border-border bg-surface/60 p-7 transition-transform duration-300 hover:-translate-y-1.5 ${
                i === 4 ? "md:col-span-2" : ""
              }`}
            >
              <div
                className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br ${p.accent} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100`}
              />

              <div className="relative flex items-start justify-between">
                <span className="font-mono text-xs text-mist/70">
                  {p.index}
                </span>
                <div className="flex gap-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <a
                    href="https://github.com/Saifurrehman2094"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.title} source code`}
                    className="text-mist transition-colors hover:text-cyan"
                  >
                    <Github size={18} />
                  </a>
                  <a
                    href="https://github.com/Saifurrehman2094"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.title} on GitHub`}
                    className="text-mist transition-colors hover:text-cyan"
                  >
                    <ArrowUpRight size={18} />
                  </a>
                </div>
              </div>

              <h3 className="relative mt-4 font-display text-xl font-semibold text-cloud">
                {p.title}
              </h3>
              <p className="relative mt-1 font-mono text-xs text-violet-soft">
                {p.tagline}
              </p>
              <p className="relative mt-4 text-sm leading-relaxed text-mist">
                {p.desc}
              </p>

              <div className="relative mt-5 flex flex-wrap gap-2">
                {p.stack.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border px-3 py-1 font-mono text-[11px] text-mist"
                  >
                    {s}
                  </span>
                ))}
              </div>

              <div className="relative mt-6 flex items-center gap-2 border-t border-border pt-4">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-glow-cyan" />
                <span className="font-mono text-xs text-cyan-soft">
                  {p.metric}
                </span>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
