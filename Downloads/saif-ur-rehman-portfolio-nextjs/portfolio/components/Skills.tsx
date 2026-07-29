"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const categories = [
  {
    title: "Languages",
    items: [
      { name: "Python", level: 95 },
      { name: "JavaScript / TypeScript", level: 88 },
      { name: "Java", level: 78 },
      { name: "C++", level: 75 },
      { name: "SQL", level: 85 },
    ],
  },
  {
    title: "Agentic & Generative AI",
    items: [
      { name: "LangChain / LangGraph", level: 93 },
      { name: "RAG & Vector Databases", level: 91 },
      { name: "Prompt Engineering & Fine-Tuning", level: 90 },
      { name: "Multi-Agent Orchestration (CrewAI, AutoGPT)", level: 87 },
    ],
  },
  {
    title: "Web & Mobile Development",
    items: [
      { name: "MERN Stack (React, Node.js)", level: 90 },
      { name: "FastAPI / REST & WebSocket APIs", level: 88 },
      { name: "Mobile App Development", level: 76 },
    ],
  },
  {
    title: "Cloud & DevOps",
    items: [
      { name: "AWS (Lambda, EC2, S3, Step Functions)", level: 86 },
      { name: "Docker / Kubernetes", level: 85 },
      { name: "Terraform / CI-CD (GitHub Actions)", level: 82 },
    ],
  },
];

export default function Skills() {
  return (
    <section id="skills" className="relative py-28">
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern bg-[size:44px_44px] opacity-40 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_0%,transparent_100%)]" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          tag="// 02_skills"
          title="Toolkit & expertise"
          description="A snapshot of the languages, frameworks, and platforms I use to take AI systems from prototype to production."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat, ci) => (
            <motion.div
              key={cat.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: ci * 0.08 }}
              className="rounded-2xl border border-border bg-surface/60 p-6"
            >
              <p className="font-display text-base font-semibold text-cloud">
                {cat.title}
              </p>
              <div className="mt-5 space-y-5">
                {cat.items.map((skill) => (
                  <div key={skill.name}>
                    <div className="mb-2 flex items-center justify-between font-mono text-xs text-mist">
                      <span>{skill.name}</span>
                      <span className="text-cyan-soft">{skill.level}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/70">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${skill.level}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full rounded-full bg-gradient-to-r from-violet to-cyan shadow-glow-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
